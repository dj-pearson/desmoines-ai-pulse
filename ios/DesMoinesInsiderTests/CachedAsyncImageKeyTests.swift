import SwiftUI
import XCTest
@testable import DesMoinesInsider

/// IOS-DD-PLATFORM-13: a downsampled bitmap and the full-resolution one are
/// cached under different keys.
@MainActor
final class CachedAsyncImageKeyTests: XCTestCase {

    private typealias Subject = CachedAsyncImage<EmptyView>

    func testDownsampledAndFullKeysDiffer() {
        XCTAssertNotEqual(Subject.cacheKey("u", maxPixels: 1170), Subject.cacheKey("u", maxPixels: nil))
    }

    func testKeysAreStable() {
        XCTAssertEqual(Subject.cacheKey("u", maxPixels: 1170), Subject.cacheKey("u", maxPixels: 1170))
        XCTAssertEqual(Subject.cacheKey("u", maxPixels: nil), Subject.cacheKey("u", maxPixels: nil))
    }
}
