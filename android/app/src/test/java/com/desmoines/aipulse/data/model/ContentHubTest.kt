package com.desmoines.aipulse.data.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ContentHubTest {

    @Test
    fun `byId resolves known hubs and rejects unknown`() {
        assertEquals(ContentHub.MUSIC, ContentHub.byId("music"))
        assertEquals(ContentHub.OUTDOORS, ContentHub.byId("outdoors"))
        assertNull(ContentHub.byId("nope"))
    }

    @Test
    fun `matchesEvent matches by category term, case-insensitively`() {
        val music = ContentHub.MUSIC
        assertTrue(music.matchesEvent(Event(id = "1", title = "Quiet night", date = "", category = "Live Music")))
        // Title-term match also counts.
        assertTrue(music.matchesEvent(Event(id = "2", title = "Jazz concert downtown", date = "", category = "General")))
        assertFalse(music.matchesEvent(Event(id = "3", title = "Farmers market", date = "", category = "Food")))
    }

    @Test
    fun `matchesAttraction matches the hub's attraction types`() {
        val outdoors = ContentHub.OUTDOORS
        assertTrue(outdoors.matchesAttraction(Attraction(id = "p", name = "City Park", type = "Park")))
        assertTrue(outdoors.matchesAttraction(Attraction(id = "z", name = "Blank Zoo", type = "Zoo")))
        assertFalse(outdoors.matchesAttraction(Attraction(id = "m", name = "Art Museum", type = "Museum")))
    }

    @Test
    fun `each hub declares terms and a stable id`() {
        ContentHub.entries.forEach { hub ->
            assertTrue(hub.eventTerms.isNotEmpty())
            assertTrue(hub.id.isNotBlank())
        }
    }
}
