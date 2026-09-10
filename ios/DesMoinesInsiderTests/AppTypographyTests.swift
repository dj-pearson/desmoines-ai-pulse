import XCTest
import SwiftUI
@testable import DesMoinesInsider

/// AppTypography's header comment claimed every style scaled with Dynamic Type
/// while every style used a fixed `Font.system(size:)`, which never scales. The
/// claim survived because nothing asserted it.
final class AppTypographyTests: XCTestCase {

    private let allStyles: [AppTextStyle] = [
        .displayLg, .displayMd, .headline, .title, .subtitle,
        .body, .bodyEmphasized, .bodySmall, .caption, .label,
    ]

    func testEveryStyleGrowsWithDynamicType() {
        for style in allStyles {
            let atDefault = style.pointSize(for: .large)
            let atLarger = style.pointSize(for: .accessibility1)
            XCTAssertGreaterThan(atLarger, atDefault,
                                 "\(style) does not scale with Dynamic Type")
        }
    }

    func testEveryStyleShrinksBelowDefault() {
        for style in allStyles {
            XCTAssertLessThan(style.pointSize(for: .xSmall),
                              style.pointSize(for: .large),
                              "\(style) ignores the smallest text setting")
        }
    }

    /// The declared size is what the style renders at the default setting, so
    /// turning scaling on doesn't silently resize the whole app.
    func testDefaultSettingRendersTheDeclaredSize() {
        for style in allStyles {
            XCTAssertEqual(style.pointSize(for: .large), style.spec.size, accuracy: 0.5,
                           "\(style) drifted from its declared point size")
        }
    }

    /// A hero number that keeps growing past its ceiling pushes the layout
    /// apart, which is what maxTypeSize exists to prevent.
    func testScalingStopsAtTheStyleCeiling() {
        let hero = AppTextStyle.displayLg // ceiling: .accessibility3
        XCTAssertEqual(hero.pointSize(for: .accessibility3),
                       hero.pointSize(for: .accessibility5), accuracy: 0.01)
        XCTAssertGreaterThan(hero.pointSize(for: .accessibility3),
                             hero.pointSize(for: .accessibility1))
    }

    func testContentSizeCategoryMapsEverySwiftUISize() {
        XCTAssertEqual(DynamicTypeSize.large.contentSizeCategory, .large)
        XCTAssertEqual(DynamicTypeSize.xSmall.contentSizeCategory, .extraSmall)
        XCTAssertEqual(DynamicTypeSize.accessibility5.contentSizeCategory,
                       .accessibilityExtraExtraExtraLarge)
        // No two sizes may collapse onto the same category, or the curve flattens.
        let categories = DynamicTypeSize.allCases.map(\.contentSizeCategory)
        XCTAssertEqual(Set(categories).count, DynamicTypeSize.allCases.count)
    }
}
