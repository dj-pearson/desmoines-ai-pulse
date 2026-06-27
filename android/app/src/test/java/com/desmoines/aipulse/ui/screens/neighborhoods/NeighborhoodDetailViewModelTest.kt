package com.desmoines.aipulse.ui.screens.neighborhoods

import com.desmoines.aipulse.data.model.Neighborhood
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class NeighborhoodDetailViewModelTest {

    @Test
    fun `neighborhood matches a location containing its name, case-insensitively`() {
        val ankeny = Neighborhood.bySlug("ankeny")!!
        assertTrue(ankeny.matches("123 Main St, Ankeny, IA"))
        assertTrue(ankeny.matches("ankeny"))
        assertFalse(ankeny.matches("Des Moines"))
        assertFalse(ankeny.matches(null))
        assertFalse(ankeny.matches(""))
    }

    @Test
    fun `all eight neighborhoods are present and unique by slug`() {
        val slugs = Neighborhood.all.map { it.slug }
        assertEquals(8, slugs.size)
        assertEquals(slugs.toSet().size, slugs.size)
        assertTrue(slugs.containsAll(listOf("east-village", "west-des-moines", "altoona")))
    }

    @Test
    fun `haversine distance is zero for identical points and grows with separation`() {
        val zero = NeighborhoodDetailViewModel.haversineMeters(41.6, -93.6, 41.6, -93.6)
        assertTrue(zero < 1.0)

        // Downtown DM → Ankeny is roughly 16 km; sanity-check the order of magnitude.
        val dmToAnkeny = NeighborhoodDetailViewModel.haversineMeters(41.5868, -93.6250, 41.7298, -93.6058)
        assertTrue(dmToAnkeny in 10_000.0..25_000.0)
    }

    @Test
    fun `haversine orders nearer points before farther ones`() {
        val origin = doubleArrayOf(41.5868, -93.6250)
        val near = NeighborhoodDetailViewModel.haversineMeters(origin[0], origin[1], 41.5900, -93.6200)
        val far = NeighborhoodDetailViewModel.haversineMeters(origin[0], origin[1], 41.7298, -93.6058)
        assertTrue(near < far)
    }
}
