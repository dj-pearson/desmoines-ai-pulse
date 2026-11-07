import Foundation
import Supabase
import SwiftUI
import UniformTypeIdentifiers

// MARK: - XPLAT-007 (iOS half) · Right of access
//
// Settings had "Delete Account" (the right of erasure) and nothing for the
// right of access. This calls `export-user-data`, the same function Android's
// "Export My Data" calls, and hands the JSON to the system file exporter.
//
// The client does no assembly of its own on purpose. export-user-data walks the
// PURGE_TABLES + RETAINED_TABLES list the deletion path uses, under the service
// role, so access and erasure cannot drift. A client-side walk would go through
// RLS, where a table the user cannot select from answers [] rather than an
// error: a legal-rights document full of false "you have no data here" entries.
//
// The function answers 404 until it is deployed (edge-deploy-baseline.json).
// That case gets its own outcome so Settings can say so and give the privacy
// address, instead of a generic failure.

/// What one export attempt came to.
enum DataExportOutcome: Equatable {
    /// The export decoded; `json` is the pretty-printed document to save.
    case ready(json: Data, tablesWithData: Int?, tablesConsidered: Int?, unavailableCount: Int)
    /// 404: the function is not deployed yet.
    case notAvailable
    /// 401: the session is gone or invalid.
    case notSignedIn
    /// Anything else, including a 2xx whose body is not an export. `status`
    /// is nil when the request never got an HTTP answer.
    case failed(status: Int?)
}

@MainActor
final class DataExportService {
    static let shared = DataExportService()
    private init() {}

    nonisolated static let privacyEmail = "privacy@desmoinesinsider.com"

    nonisolated static let notAvailableMessage =
        "Data export isn't available in the app yet. Email \(privacyEmail) from the address on your account and we'll send you a copy of your data."

    nonisolated static let notSignedInMessage = "Your session has expired. Sign in again, then export your data."

    nonisolated static let saveFailedMessage =
        "Your data was downloaded but could not be saved there. Try again and pick a different location."

    nonisolated static func failedMessage(status: Int?) -> String {
        if status == nil {
            return "Couldn't reach the server. Check your connection and try again."
        }
        return "Your data couldn't be exported right now. Try again, or email \(privacyEmail)."
    }

    /// Maps the function's answer to an outcome. Pure, so the tests can feed it
    /// bodies without a network.
    nonisolated static func classify(status: Int, body: Data) -> DataExportOutcome {
        switch status {
        case 404: return .notAvailable
        case 401: return .notSignedIn
        case 200...299: break
        default: return .failed(status: status)
        }

        guard let root = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any],
              // Both are always present in a real export (export-user-data/index.ts).
              // A 2xx without them is not something to hand the user as their data.
              root["data"] is [String: Any],
              root["exportedAt"] is String,
              let pretty = try? JSONSerialization.data(
                  withJSONObject: root,
                  options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
              ) else {
            return .failed(status: status)
        }

        return .ready(
            json: pretty,
            tablesWithData: intValue(root["tablesWithData"]),
            tablesConsidered: intValue(root["tablesConsidered"]),
            unavailableCount: (root["unavailable"] as? [Any])?.count ?? 0
        )
    }

    /// JSONSerialization hands numbers back as NSNumber, and a Bool is one too;
    /// only a real integer counts.
    private nonisolated static func intValue(_ value: Any?) -> Int? {
        guard let number = value as? NSNumber,
              CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
        return number.intValue
    }

    /// `desmoines-insider-data-2026-11-07.json`, dated in the device's zone.
    nonisolated static func fileName(now: Date = Date(), timeZone: TimeZone = .current) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return "desmoines-insider-data-\(formatter.string(from: now)).json"
    }

    /// What to say once the file is saved. An export that could not read some
    /// tables says so: a copy that is quietly incomplete is the defect the web
    /// export had for months.
    nonisolated static func savedMessage(
        fileName: String,
        tablesWithData: Int?,
        tablesConsidered: Int?,
        unavailableCount: Int
    ) -> String {
        var message = "Your data was saved to \(fileName)."
        if let tablesWithData, let tablesConsidered {
            message += " It includes data from \(tablesWithData) of the \(tablesConsidered) places we store account data."
        }
        if unavailableCount > 0 {
            message += " This copy is incomplete: \(unavailableCount) of those places could not be read. They are listed under \"unavailable\" in the file; email \(privacyEmail) if you need them."
        }
        return message
    }

    /// Asks export-user-data for the signed-in user's data.
    func requestExport() async -> DataExportOutcome {
        guard let client = SupabaseService.shared.client else {
            return .failed(status: nil)
        }
        do {
            return try await client.functions.invoke(
                "export-user-data",
                options: .init(method: .post),
                decode: { data, response in
                    Self.classify(status: response.statusCode, body: data)
                }
            )
        } catch FunctionsError.httpError(let code, let data) {
            return Self.classify(status: code, body: data)
        } catch {
            AppLogger.network.warning("Data export request failed: \(error.localizedDescription)")
            return .failed(status: nil)
        }
    }
}

/// The export as a document for `.fileExporter`, which lets the user pick
/// Files, iCloud Drive or another provider without any storage permission.
struct DataExportDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }

    let data: Data

    init(data: Data) {
        self.data = data
    }

    init(configuration: ReadConfiguration) throws {
        guard let contents = configuration.file.regularFileContents else {
            throw CocoaError(.fileReadCorruptFile)
        }
        data = contents
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}
