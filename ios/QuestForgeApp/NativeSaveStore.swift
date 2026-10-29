import Foundation

/// A stable app-container copy survives changes to the signed bundle's file URL.
final class NativeSaveStore {
    static let storageKey = "quest-forge-v4"
    static let maximumBytes = 2 * 1_024 * 1_024
    private var lastSavedData: Data?

    enum SaveError: LocalizedError {
        case invalidData
        case tooLarge

        var errorDescription: String? {
            switch self {
            case .invalidData: return "v4のバックアップJSONを確認してください。"
            case .tooLarge: return "バックアップは2MB以内のJSONファイルを選んでください。"
            }
        }
    }

    private var saveURL: URL {
        get throws {
            let directory = try FileManager.default.url(
                for: .applicationSupportDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: true
            )
            try FileManager.default.setAttributes(
                [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                ofItemAtPath: directory.path
            )
            return directory.appendingPathComponent(Self.storageKey + ".json", isDirectory: false)
        }
    }

    static func validatedData(from json: String) throws -> Data {
        let data = Data(json.utf8)
        guard data.count <= maximumBytes else { throw SaveError.tooLarge }
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              object["version"] as? Int == 4 else { throw SaveError.invalidData }
        return data
    }

    func save(json: String) throws {
        let data = try Self.validatedData(from: json)
        guard data != lastSavedData else { return }
        try data.write(to: saveURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        lastSavedData = data
    }

    func restorationJSON() -> String? {
        guard let url = try? saveURL,
              let handle = try? FileHandle(forReadingFrom: url) else { return nil }
        defer { try? handle.close() }
        guard let data = try? handle.read(upToCount: Self.maximumBytes + 1),
              data.count <= Self.maximumBytes,
              let json = String(data: data, encoding: .utf8),
              (try? Self.validatedData(from: json)) != nil else { return nil }
        lastSavedData = data
        return json
    }

    func restorationScript() -> String? {
        guard let json = restorationJSON(),
              let data = try? JSONSerialization.data(withJSONObject: [json]),
              let literal = String(data: data, encoding: .utf8) else { return nil }
        return """
        (function () {
          try {
            const key = 'quest-forge-v4';
            const previous = window.localStorage.getItem(key);
            if (previous === null || previous === '') {
              window.localStorage.setItem(key, \(literal)[0]);
            }
          } catch (_) {}
        })();
        """
    }
}
