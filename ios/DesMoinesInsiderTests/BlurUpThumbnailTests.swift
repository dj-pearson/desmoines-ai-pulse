import UIKit
import XCTest
@testable import DesMoinesInsider

/// IOS-AUDIT-PERF-029: list thumbnails opt out of the blur-up render; heroes
/// keep it.
final class BlurUpThumbnailTests: XCTestCase {

    private func sampleImage() -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 40, height: 30)).image { context in
            UIColor.systemTeal.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 40, height: 30))
        }
    }

    func testDisabledRendersNothing() {
        XCTAssertNil(BlurUpThumbnail.make(from: sampleImage(), enabled: false))
    }

    func testEnabledRendersTheTwelvePointThumbnail() throws {
        let thumbnail = try XCTUnwrap(BlurUpThumbnail.make(from: sampleImage(), enabled: true))
        XCTAssertEqual(thumbnail.size, CGSize(width: 12, height: 12))
    }

    func testListThumbnailRuleIsEightyPoints() {
        // iosBlurUpThumbnail.test.ts checks call sites against the same 80.
        XCTAssertEqual(BlurUpThumbnail.listThumbnailMaxSide, 80)
    }
}
