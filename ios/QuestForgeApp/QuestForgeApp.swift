import SwiftUI

@main
struct QuestForgeApp: App {
    @StateObject private var game = QuestGameController()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            GameView(game: game)
                .preferredColorScheme(.dark)
                .onChange(of: scenePhase) { _, phase in
                    game.applicationActivityChanged(isActive: phase == .active)
                }
        }
    }
}
