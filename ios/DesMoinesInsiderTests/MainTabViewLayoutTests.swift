import XCTest
@testable import DesMoinesInsider

/// IOS-DD-PLATFORM-06: iPad keeps every visited sidebar pane mounted, in a
/// stable order, so each needs a distinct position.
@MainActor
final class MainTabViewLayoutTests: XCTestCase {

    func testSidebarIndexIsUniqueAcrossAllSelections() {
        let all = MainTabView.allSidebarSelections
        let indexes = all.map(MainTabView.sidebarIndex)
        XCTAssertEqual(Set(indexes).count, all.count)
        XCTAssertEqual(all.count, MainTabView.Tab.allCases.count + 3)
    }

    func testTabsSortBeforeTheExploreSection() {
        let lastTab = MainTabView.Tab.allCases.map { MainTabView.sidebarIndex(.tab($0)) }.max() ?? 0
        XCTAssertLessThan(lastTab, MainTabView.sidebarIndex(.discover))
    }
}
