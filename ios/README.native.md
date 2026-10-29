# QUEST FORGE iPhone host

The native source has no package or network dependencies. It targets iPhone,
portrait, iOS 17 or newer. `QuestForgeApp.swift` is the single `@main` entry point.
The Xcode target must compile the five Swift files under `QuestForgeApp/`, use
that folder's `Info.plist`, and copy `PrivacyInfo.xcprivacy` into its resources.
Set `TARGETED_DEVICE_FAMILY = 1`, `IPHONEOS_DEPLOYMENT_TARGET = 17.0`, and provide
the bundle identifier, marketing/build versions, signing team, and app icon.

## Offline web resources

Copy the complete production `docs/` content into a resource folder named `Web`.
Add **Web as a folder reference**, preserving `Web/index.html` and `Web/assets/`.
Do not flatten its contents into the application bundle. The controller uses
`loadFileURL(_:allowingReadAccessTo:)` with access limited to that folder and
`WKWebsiteDataStore.default()` for persistent website storage.

The SwiftUI navigation bar has a settings button. The game occupies the remaining
safe area; the host never places a native button over the game's controls.

## Bridge contract

Only the bundled main file frame is accepted. Post messages using:

```js
window.webkit.messageHandlers.questNative.postMessage({ action: 'ready' });
```

Supported actions:

| action | fields | behavior |
| --- | --- | --- |
| `ready` | — | Emits the ready event. |
| `save` | `json` | Saves validated v4 state, maximum 2 MiB. |
| `speak` | `text` | Japanese native speech, maximum 500 characters. |
| `cancelSpeech` | — | Stops native speech. |
| `haptic` | `style` | `light`, `medium`, `heavy`, `soft`, `rigid`, `selection`, `success`, `warning`, `error`; aliases `attack`, `skill`, `win`, `hurt`. |
| `export` | `json` | Shares a temporary `.json` file using the native share sheet. |
| `import` | — | Opens the native JSON document picker. |
| `scheduleReminder` | `seconds`, `title`, `body` | Remembers the latest deadline and schedules it only when notification permission already exists. |
| `clearReminders` | — | Clears this app's pending and delivered notifications. |

Callbacks are fixed-name window events with JSON-serialized data only:

```js
window.addEventListener('quest-native-ready', event => {
  // event.detail === { version: '1.0.0' }
});
window.addEventListener('quest-native-import', event => {
  // event.detail.json is a string, not executable JavaScript.
  // Validate it and obtain the user's replacement confirmation in the web app.
});
```

The ready event is emitted after the document finishes and in response to `ready`.
There is no timer advancement in Swift. Foreground activation dispatches the
standard `focus` event so the web engine settles its absolute deadline.
Background/inactive transitions stop native speech.

## Persistence and privacy

`save` writes `Application Support/quest-forge-v4.json` atomically with
`completeUntilFirstUserAuthentication` protection. The app does not place durable
state in Caches. On a new document, a document-start script restores that validated
copy only when the `quest-forge-v4` localStorage key is missing or empty. Existing
web records are never replaced by the automatic restore. Unreadable/invalid
native copies are ignored; explicit backup import still belongs to the web app.

The settings sheet is the only caller of notification `requestAuthorization`.
Launching the app, saving, receiving `scheduleReminder`, or querying permission
does not prompt. Once the user opts in, the latest unexpired reminder is scheduled.
The current reminder is replaced on synchronization and cleared by the web app
when no task is active. Local notifications remain optional.

No analytics, tracking, remote service, account, microphone, camera, photo-library,
or speech-recognition access is included. AVSpeechSynthesizer does not request
microphone permission. The privacy manifest declares no collected data, tracking,
or direct use of required-reason APIs. Re-audit it if native APIs/dependencies are
added later. iOS device backup may include the app container under the user's own
device-backup settings. Deleting the app removes its local records.

## Native verification

Before distribution, verify on a real iPhone: first launch with airplane mode;
safe areas and task completion on a small screen; native voice; JSON share/import;
denying notification permission; explicit opt-in; background reminder delivery;
returning after an expired task; force-close/relaunch; and a signed app update that
retains the same application container. Native speech/notification behavior and
signed-update persistence cannot be established by a simulator build alone.

Only an actual user-tapped HTTP(S) link can open Safari. Automatic remote
navigation and remote popups are cancelled, and no remote page replaces the game.
