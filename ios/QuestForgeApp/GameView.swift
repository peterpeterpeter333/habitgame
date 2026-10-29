import SwiftUI
import WebKit

struct GameView: View {
    @ObservedObject var game: QuestGameController

    var body: some View {
        NavigationStack {
            ZStack {
                Color(red: 0.025, green: 0.055, blue: 0.09).ignoresSafeArea()
                GameWebView(webView: game.webView)

                if let error = game.loadError {
                    VStack(spacing: 18) {
                        Image(systemName: "sparkles")
                            .font(.largeTitle)
                            .foregroundStyle(.yellow.opacity(0.8))
                        Text("旅の支度を読み込めませんでした")
                            .font(.headline)
                        Text(error)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                        Button("もう一度読み込む") { game.loadGame() }
                            .buttonStyle(.borderedProminent)
                            .tint(Color(red: 0.76, green: 0.64, blue: 0.39))
                    }
                    .padding(28)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(red: 0.025, green: 0.055, blue: 0.09))
                } else if game.isLoading {
                    ProgressView("旅の支度をしています…")
                        .padding(22)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
                }
            }
            .navigationTitle("QUEST FORGE")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Color(red: 0.035, green: 0.075, blue: 0.12), for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { game.showsSettings = true } label: {
                        Image(systemName: "gearshape")
                    }
                    .accessibilityLabel("アプリの設定")
                    .tint(.init(red: 0.9, green: 0.82, blue: 0.64))
                }
            }
        }
        .sheet(isPresented: $game.showsSettings) {
            NativeSettingsView(game: game)
        }
        .alert(item: $game.notice) { notice in
            Alert(
                title: Text(notice.title),
                message: Text(notice.message),
                dismissButton: .default(Text("閉じる"))
            )
        }
        .task { game.loadGameIfNeeded() }
    }
}

private struct GameWebView: UIViewRepresentable {
    let webView: WKWebView

    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

private struct NativeSettingsView: View {
    @ObservedObject var game: QuestGameController
    @Environment(\.dismiss) private var dismiss

    private var version: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0.0"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
        return "Version \(version) (\(build))"
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(game.notificationStatus)
                        .foregroundStyle(.secondary)
                    Button("課題の終了通知を有効にする") {
                        game.enableNotifications()
                    }
                    .disabled(game.isRequestingNotificationPermission)
                    if game.notificationsDenied {
                        Button("iPhoneの通知設定を開く") {
                            game.openApplicationSettings()
                        }
                    }
                    Button("予約している終了通知を取り消す") {
                        game.clearReminders()
                    }
                } header: {
                    Text("通知（任意）")
                } footer: {
                    Text("許可すると、取り組んでいる課題の終了時刻を通知します。アプリの起動だけでは通知の許可を求めません。画面を閉じている間も課題の時間は進みます。")
                }

                Section("読み上げ") {
                    Button("読み上げを止める") { game.cancelSpeech() }
                    Text("読み上げの有効・無効は、ゲーム内の「時間案内」で変更できます。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("旅の記録") {
                    Text("旅の記録はこのiPhone内に保存します。アプリの更新時に備えた控えも端末内に保存します。")
                    Text("機種変更やアプリの削除に備えるときは、ゲーム内の「記録」からバックアップを共有・保存してください。読み込みではJSONファイルを選べます。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("このアプリについて") {
                    LabeledContent("QUEST FORGE", value: version)
                    Link("プライバシーポリシー", destination: URL(string: "https://peterpeterpeter333.github.io/habitgame/privacy.html")!)
                    Link("サポート", destination: URL(string: "https://peterpeterpeter333.github.io/habitgame/support.html")!)
                    Text("現実の一歩を、仲間と歩く冒険に。ゲーム本体とイラストはアプリに同梱され、通信なしで遊べます。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("アプリの設定")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("完了") { dismiss() }
                }
            }
            .task { await game.refreshNotificationStatus() }
        }
    }
}
