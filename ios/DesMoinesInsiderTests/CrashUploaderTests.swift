import XCTest
@testable import DesMoinesInsider

/// XPLAT-004 AC1 -- the payload half of the crash upload path.
///
/// The network half is deliberately untested here. Exercising it would mean
/// posting to the live sink or injecting a URLProtocol stub, and what actually
/// breaks in this code is the mapping: `log-error` validates `source` and
/// `userId` and silently drops what it does not accept, so a wrong field is
/// invisible in production rather than an error. That is what these assert.
final class CrashUploaderTests: XCTestCase {

    private func record(
        kind: CrashRecord.Kind = .nonFatal,
        message: String = "NSURLErrorDomain#-1009: offline",
        callStack: [String] = []
    ) -> CrashRecord {
        CrashRecord(
            id: "id-1",
            kind: kind,
            timestamp: Date(timeIntervalSince1970: 0),
            message: message,
            callStack: callStack,
            userId: "0123456789abcdef",
            customKeys: [:],
            appVersion: "1.4.0",
            osVersion: "17.5"
        )
    }

    // MARK: - Field mapping

    func testPayloadUsesTheValuesTheSinkAccepts() {
        let payload = CrashUploader.payload(for: record())

        // `source` is validated against client | edge; anything else silently
        // becomes "client" at the sink, so send what we mean.
        XCTAssertEqual(payload["source"], "client")
        XCTAssertEqual(payload["component"], "ios-crash")
        XCTAssertEqual(payload["action"], "nonFatal")
        XCTAssertEqual(payload["route"], "ios/1.4.0 (17.5)")
    }

    func testPayloadNeverSendsUserId() {
        // The record's hashed id is 16 hex characters. log-error requires a
        // 36-character UUID and drops anything else, so sending it would look
        // like attribution while attributing nothing.
        XCTAssertNil(CrashUploader.payload(for: record())["userId"])
    }

    func testSeveritySeparatesFatalFromRecorded() {
        XCTAssertEqual(CrashUploader.severity(for: .fatalSignal), "critical")
        XCTAssertEqual(CrashUploader.severity(for: .fatalException), "critical")
        XCTAssertEqual(CrashUploader.severity(for: .nonFatal), "error")
    }

    func testMessageIsTruncatedToWhatTheSinkStores() {
        let long = String(repeating: "x", count: 5000)
        let message = CrashUploader.payload(for: record(message: long))["message"]
        XCTAssertEqual(message?.count, 2000)
    }

    // MARK: - Frame reduction

    func testTopSymbolDropsAddressAndOffset() {
        // Everything except the symbol moves between runs, and the cluster
        // signature is a hash of the message.
        let frames = [
            "0   libsystem_kernel.dylib   0x00000001f0a2c1b4 __pthread_kill + 8",
            "3   DesMoinesInsider         0x0000000104b2c3d4 $s16DesMoinesInsider9LoadEventsyyF + 328",
        ]
        XCTAssertEqual(CrashUploader.topSymbol(of: frames), "$s16DesMoinesInsider9LoadEventsyyF")
    }

    func testTopSymbolSkipsSystemFrames() {
        // The top frame of a crash stack is the trap, which is the same for
        // unrelated crashes and would collapse them into one cluster.
        let frames = [
            "0   libsystem_kernel.dylib   0x00000001f0a2c1b4 __pthread_kill + 8",
            "1   libsystem_pthread.dylib  0x00000001f0a5d3f8 pthread_kill + 268",
            "2   CoreFoundation           0x000000018c0f1234 __exceptionPreprocess + 172",
        ]
        XCTAssertNil(CrashUploader.topSymbol(of: frames))
    }

    func testTopSymbolReturnsNilRatherThanGuessing() {
        XCTAssertNil(CrashUploader.topSymbol(of: []))
        XCTAssertNil(CrashUploader.topSymbol(of: ["not a frame"]))
    }

    func testPayloadAppendsTheSymbolToTheMessage() {
        let frames = ["3   DesMoinesInsider   0x0000000104b2c3d4 $s16DesMoinesInsider4bootyyF + 12"]
        let message = CrashUploader.payload(for: record(callStack: frames))["message"]
        XCTAssertEqual(message, "NSURLErrorDomain#-1009: offline @ $s16DesMoinesInsider4bootyyF")
    }

    func testPayloadOmitsTheSymbolWhenThereIsNoAppFrame() {
        let frames = ["0   libsystem_kernel.dylib   0x00000001f0a2c1b4 __pthread_kill + 8"]
        let message = CrashUploader.payload(for: record(callStack: frames))["message"]
        XCTAssertEqual(message, "NSURLErrorDomain#-1009: offline")
    }
}
