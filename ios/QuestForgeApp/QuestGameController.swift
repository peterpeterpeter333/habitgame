import SwiftUI
import UIKit
@preconcurrency import WebKit

struct NativeNotice: Identifiable {
    let id = UUID()
    let title: String
    let message: String
}

@MainActor
final class QuestGameController: NSObject, ObservableObject {
    @Published private(set) var isLoading = true
    @Published private(set) var loadError: String?
    @Published var notice: NativeNotice?
    @Published var showsSettings = false
    @Published private(set) var notificationStatus = "通知の状態を確認しています…"
    @Published private(set) var notificationsDenied = false
    @Published private(set) var isRequestingNotificationPermission = false

    let webView: WKWebView
    private let saveStore: NativeSaveStore
    private let nativeBridge: QuestNativeBridge
    private var hasLoaded = false
    private var webDirectory: URL?

    override init() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.allowsInlineMediaPlayback = true
        let view = WKWebView(frame: .zero, configuration: configuration)
        let store = NativeSaveStore()
        webView = view
        saveStore = store
        nativeBridge = QuestNativeBridge(webView: view, saveStore: store)
        super.init()

        configuration.userContentController.add(
            WeakScriptMessageHandler(target: nativeBridge),
            name: "questNative"
        )
        view.navigationDelegate = self
        view.uiDelegate = self
        view.isOpaque = false
        view.backgroundColor = UIColor(red: 0.025, green: 0.055, blue: 0.09, alpha: 1)
        view.scrollView.backgroundColor = view.backgroundColor
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.scrollView.bounces = false
        view.allowsBackForwardNavigationGestures = false
        nativeBridge.onNotice = { [weak self] notice in self?.notice = notice }
        nativeBridge.onNotificationStatus = { [weak self] label, denied in
            self?.notificationStatus = label
            self?.notificationsDenied = denied
        }
    }

    func loadGameIfNeeded() {
        guard !hasLoaded else { return }
        loadGame()
    }

    func loadGame() {
        hasLoaded = true
        isLoading = true
        loadError = nil
        guard let directory = Bundle.main.url(forResource: "Web", withExtension: nil),
              FileManager.default.fileExists(atPath: directory.appendingPathComponent("index.html").path) else {
            isLoading = false
            loadError = "アプリに必要なゲームファイルが見つかりません。アプリを更新してから、もう一度お試しください。"
            return
        }
        webDirectory = directory.resolvingSymlinksInPath().standardizedFileURL
        let contentController = webView.configuration.userContentController
        contentController.removeAllUserScripts()
        if let script = saveStore.restorationScript() {
            contentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        webView.loadFileURL(directory.appendingPathComponent("index.html"), allowingReadAccessTo: directory)
    }

    func applicationActivityChanged(isActive: Bool) {
        if isActive {
            // The web engine settles absolute deadlines; native code does not advance game state.
            webView.evaluateJavaScript("window.dispatchEvent(new Event('focus'));") { _, _ in }
        } else {
            nativeBridge.cancelSpeech()
        }
    }

    func cancelSpeech() { nativeBridge.cancelSpeech() }
    func clearReminders() { nativeBridge.clearReminders() }
    func refreshNotificationStatus() async { await nativeBridge.refreshNotificationStatus() }

    func enableNotifications() {
        guard !isRequestingNotificationPermission else { return }
        isRequestingNotificationPermission = true
        Task {
            await nativeBridge.requestNotificationPermission()
            isRequestingNotificationPermission = false
        }
    }

    func openApplicationSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }

    private func isBundledPage(_ url: URL) -> Bool {
        guard url.isFileURL, let directory = webDirectory else { return false }
        let path = url.resolvingSymlinksInPath().standardizedFileURL.path
        return path == directory.path || path.hasPrefix(directory.path + "/")
    }

    private func openUserLink(_ navigationAction: WKNavigationAction) {
        guard navigationAction.navigationType == .linkActivated,
              let url = navigationAction.request.url,
              ["https", "http"].contains(url.scheme?.lowercased() ?? "") else { return }
        UIApplication.shared.open(url)
    }
}

extension QuestGameController: WKNavigationDelegate, WKUIDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if isBundledPage(url) {
            decisionHandler(.allow)
        } else {
            openUserLink(navigationAction)
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        openUserLink(navigationAction)
        return nil
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        isLoading = false
        loadError = nil
        nativeBridge.sendReadyEvent()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showLoadError(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showLoadError(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        isLoading = false
        loadError = "ゲーム画面が一度閉じられました。保存した旅の記録から読み直せます。"
    }

    private func showLoadError(_ error: Error) {
        if (error as NSError).code == NSURLErrorCancelled { return }
        isLoading = false
        loadError = "ゲーム画面を読み込めませんでした。もう一度お試しください。"
    }

    // Local WebKit cannot present these JavaScript dialogs by itself.
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor () -> Void) {
        guard let presenter = nativeBridge.presentationController else { completionHandler(); return }
        let alert = UIAlertController(title: "QUEST FORGE", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "閉じる", style: .default) { _ in completionHandler() })
        presenter.present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor (Bool) -> Void) {
        guard let presenter = nativeBridge.presentationController else { completionHandler(false); return }
        let alert = UIAlertController(title: "QUEST FORGE", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "キャンセル", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "続ける", style: .default) { _ in completionHandler(true) })
        presenter.present(alert, animated: true)
    }
}

@MainActor
private final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: (any WKScriptMessageHandler)?
    init(target: any WKScriptMessageHandler) { self.target = target }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}
