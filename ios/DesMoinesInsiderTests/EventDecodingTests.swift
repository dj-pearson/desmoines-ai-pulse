import XCTest
@testable import DesMoinesInsider

/// IOS-DD-EVENTS-21 / 23: tolerant decoding.
@MainActor
final class EventDecodingTests: XCTestCase {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    func testMalformedGeoFaqBecomesNilAndTheRowSurvives() throws {
        let e = try decode(Event.self, #"{"id":"e1","title":"A","date":"2026-10-01","geo_faq":{"question":"q"}}"#)
        XCTAssertEqual(e.id, "e1")
        XCTAssertNil(e.geoFaq)
    }

    func testAProperFaqDecodes() throws {
        let e = try decode(Event.self, #"""
        {"id":"e1","title":"A","date":"2026-10-01",
         "geo_faq":[{"question":"Parking?","answer":"Yes"},{"question":"Kids?","answer":"All ages"}],
         "geo_key_facts":["Outdoors"],"geo_summary":"s","end_date":"2026-10-02T03:00:00Z","time_tbd":false}
        """#)
        XCTAssertEqual(e.geoFaq?.count, 2)
        XCTAssertEqual(e.geoKeyFacts, ["Outdoors"])
        XCTAssertEqual(e.endDate, "2026-10-02T03:00:00Z")
        XCTAssertEqual(e.timeTbd, false)
    }

    func testOneBadRowDoesNotFailThePage() throws {
        let page = try decode(LossyEventArray.self, #"""
        [
          {"id":"e1","title":"A","date":"2026-10-01"},
          {"id":"e2","title":null,"date":"2026-10-02"},
          {"title":"no id","date":"2026-10-03"}
        ]
        """#)
        XCTAssertEqual(page.events.map(\.id), ["e1", "e2"])
        XCTAssertEqual(page.events[1].title, "Untitled event")
        XCTAssertEqual(page.droppedCount, 1)
    }

    func testANullDateDecodesAsNoDate() throws {
        let e = try decode(Event.self, #"{"id":"e1","title":"A","date":null}"#)
        XCTAssertNil(e.parsedDate)
    }

    func testAnEncodedEventRoundTrips() throws {
        // The on-disk cache writes with the synthesized encoder and reads with
        // the custom decoder; they must agree.
        var e = Event(id: "e1", title: "A", date: "2026-10-01T00:00:00Z")
        e.geoFaq = [EventFAQ(question: "q", answer: "a")]
        e.endDate = "2026-10-02T00:00:00Z"
        let back = try JSONDecoder().decode(Event.self, from: JSONEncoder().encode(e))
        XCTAssertFalse(EventDetailViewModel.contentDiffers(back, from: e))
    }
}
