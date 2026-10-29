import AVFoundation
import UIKit
import UniformTypeIdentifiers
import UserNotifications
@preconcurrency import WebKit

@MainActor
final class QuestNativeBridge: NSObject, WKScriptMessageHandler, UIDocumentPickerDelegate {
    static let bridgeVersion = "1.0.0"
    var onNotice: ((NativeNotice) -> Void)?
    var onNotificationStatus: ((String, Bool) -> Void)?

    private weak var webView: WKWebView?
    private let saveStore: NativeSaveStore
    private let speech = AVSpeechSynthesizer()
    private let notificationCenter = UNUserNotificationCenter.current()
    private let bundledWebDirectory = Bundle.main.url(forResource: "Web", withExtension: nil)?.resolvingSymlinksInPath().standardizedFileURL
    private var pendingReminder: PendingReminder?
    private var isImporting = false
    private var reportedSaveFailure = false

    private struct PendingReminder {
        let identifier = "quest-forge.reminder." + UUID().uuidString
        let deadline: Date
        let title: String
        let body: String
    }

    init(webView: WKWebView, saveStore: NativeSaveStore) {
        self.webView = webView
        self.saveStore = saveStore
        super.init()
    }

    var presentationController: UIViewController? {
        guard var controller = webView?.window?.rootViewController else { return nil }
        while let presented = controller.presentedViewController, !presented.isBeingDismissed {
            controller = presented
        }
        return controller
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "questNative", message.frameInfo.isMainFrame,
              isBundledMainDocument(message.frameInfo.request.url),
              let payload = message.body as? [String: Any],
              let action = payload["action"] as? String else { return }

        switch action {
        case "ready": sendReadyEvent()
        case "save":
            guard let json = payload["json"] as? String else { return }
            do {
                try saveStore.save(json: json)
                reportedSaveFailure = false
            } catch {
                if !reportedSaveFailure {
                    reportedSaveFailure = true
                    showNotice("端末内の控えを保存できません", "ゲーム内の「記録」からバックアップを保存してください。")
                }
            }
        case "speak":
            guard let text = payload["text"] as? String else { return }
            speak(text)
        case "cancelSpeech": cancelSpeech()
        case "haptic": haptic(payload["style"] as? String ?? "light")
        case "export":
            guard let json = payload["json"] as? String else { return }
            exportBackup(json)
        case "import": importBackup()
        case "scheduleReminder":
            guard let seconds = payload["seconds"] as? Double,
                  seconds.isFinite, seconds >= 1, seconds <= 31_536_000 else { return }
            let title = String((payload["title"] as? String ?? "QUEST FORGE").prefix(100))
            let body = String((payload["body"] as? String ?? "課題の時間になりました。冒険の続きを確かめましょう。").prefix(300))
            pendingReminder = PendingReminder(deadline: Date().addingTimeInterval(seconds), title: title, body: body)
            notificationCenter.removeAllPendingNotificationRequests()
            Task { await schedulePendingReminderIfAuthorized() }
        case "clearReminders": clearReminders()
        default: break
        }
    }

    private func isBundledMainDocument(_ url: URL?) -> Bool {
        guard let url, url.isFileURL, let directory = bundledWebDirectory else { return false }
        let path = url.resolvingSymlinksInPath().standardizedFileURL.path
        return path.hasPrefix(directory.path + "/")
    }

    func sendReadyEvent() {
        dispatchEvent("quest-native-ready", detail: ["version": Self.bridgeVersion])
    }

    private func dispatchEvent(_ name: String, detail: [String: String]) {
        // Only these two constant event names may become JavaScript source.
        guard name == "quest-native-ready" || name == "quest-native-import",
              let data = try? JSONSerialization.data(withJSONObject: detail),
              let literal = String(data: data, encoding: .utf8) else { return }
        let event = name == "quest-native-ready" ? "'quest-native-ready'" : "'quest-native-import'"
        webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent(\(event), {detail: \(literal)}));") { _, _ in }
    }

    private func speak(_ text: String) {
        let text = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(500))
        guard !text.isEmpty else { return }
        speech.stopSpeaking(at: .immediate)
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "ja-JP")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        speech.speak(utterance)
    }

    func cancelSpeech() { speech.stopSpeaking(at: .immediate) }

    private func haptic(_ style: String) {
        switch style {
        case "success", "win": UINotificationFeedbackGenerator().notificationOccurred(.success)
        case "warning", "hurt": UINotificationFeedbackGenerator().notificationOccurred(.warning)
        case "error": UINotificationFeedbackGenerator().notificationOccurred(.error)
        case "selection": UISelectionFeedbackGenerator().selectionChanged()
        default:
            let impactStyle: UIImpactFeedbackGenerator.FeedbackStyle
            switch style {
            case "heavy", "skill": impactStyle = .heavy
            case "medium", "attack": impactStyle = .medium
            case "soft": impactStyle = .soft
            case "rigid": impactStyle = .rigid
            default: impactStyle = .light
            }
            UIImpactFeedbackGenerator(style: impactStyle).impactOccurred()
        }
    }

    private func exportBackup(_ json: String) {
        do {
            let data = try NativeSaveStore.validatedData(from: json)
            guard let presenter = presentationController else {
                showNotice("共有画面を開けません", "画面を開き直して、もう一度お試しください。")
                return
            }
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent("QuestForge-" + UUID().uuidString, isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let url = directory.appendingPathComponent("quest-forge-v4-backup.json")
            try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            let activity = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            activity.popoverPresentationController?.sourceView = webView
            activity.popoverPresentationController?.sourceRect = CGRect(x: 0, y: 0, width: 1, height: 1)
            activity.completionWithItemsHandler = { _, _, _, _ in
                try? FileManager.default.removeItem(at: directory)
            }
            presenter.present(activity, animated: true)
        } catch {
            showNotice("バックアップを共有できません", error.localizedDescription)
        }
    }

    private func importBackup() {
        guard !isImporting, let presenter = presentationController else { return }
        cancelSpeech()
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.json], asCopy: true)
        picker.delegate = self
        picker.allowsMultipleSelection = false
        isImporting = true
        presenter.present(picker, animated: true)
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { isImporting = false }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        isImporting = false
        guard let url = urls.first else { return }
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        do {
            let handle = try FileHandle(forReadingFrom: url)
            defer { try? handle.close() }
            let data = try handle.read(upToCount: NativeSaveStore.maximumBytes + 1) ?? Data()
            guard data.count <= NativeSaveStore.maximumBytes else { throw NativeSaveStore.SaveError.tooLarge }
            guard let json = String(data: data, encoding: .utf8) else { throw NativeSaveStore.SaveError.invalidData }
            _ = try NativeSaveStore.validatedData(from: json)
            // The web app validates and asks about replacing its current record.
            dispatchEvent("quest-native-import", detail: ["json": json])
        } catch {
            showNotice("バックアップを読み込めません", error.localizedDescription)
        }
    }

    func refreshNotificationStatus() async {
        let settings = await notificationCenter.notificationSettings()
        let label: String
        switch settings.authorizationStatus {
        case .authorized: label = "終了通知は許可されています。"
        case .provisional, .ephemeral: label = "終了通知は静かに届けられます。"
        case .denied: label = "終了通知は無効です。必要なときはiPhoneの設定から変更できます。"
        case .notDetermined: label = "終了通知はまだ有効にしていません。"
        @unknown default: label = "通知の設定をiPhoneで確認してください。"
        }
        onNotificationStatus?(label, settings.authorizationStatus == .denied)
    }

    /// Called only by the explicit opt-in button in NativeSettingsView.
    func requestNotificationPermission() async {
        do {
            let granted = try await notificationCenter.requestAuthorization(options: [.alert, .sound])
            await refreshNotificationStatus()
            if granted { await schedulePendingReminderIfAuthorized() }
        } catch {
            showNotice("通知を設定できません", "iPhoneの通知設定を確認して、もう一度お試しください。")
        }
    }

    private func schedulePendingReminderIfAuthorized() async {
        guard let reminder = pendingReminder else { return }
        let settings = await notificationCenter.notificationSettings()
        guard pendingReminder?.identifier == reminder.identifier,
              [.authorized, .provisional, .ephemeral].contains(settings.authorizationStatus) else { return }
        let seconds = reminder.deadline.timeIntervalSinceNow
        guard seconds > 0 else { return }
        let content = UNMutableNotificationContent()
        content.title = reminder.title
        content.body = reminder.body
        content.sound = .default
        let request = UNNotificationRequest(
            identifier: reminder.identifier,
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: max(1, seconds), repeats: false)
        )
        do {
            try await notificationCenter.add(request)
            if pendingReminder?.identifier != reminder.identifier {
                notificationCenter.removePendingNotificationRequests(withIdentifiers: [reminder.identifier])
            }
        } catch {
            // Background synchronization is quiet. The game remains usable without notifications.
        }
    }

    func clearReminders() {
        pendingReminder = nil
        notificationCenter.removeAllPendingNotificationRequests()
        notificationCenter.removeAllDeliveredNotifications()
    }

    private func showNotice(_ title: String, _ message: String) {
        onNotice?(NativeNotice(title: title, message: message))
    }
}
