package com.desmoines.aipulse.data.remote

import com.desmoines.aipulse.data.model.Hotel
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Count
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

/** Ordering options for the hotels hub. */
enum class HotelSort {
    FEATURED,
    RATING,
    NAME,
    PRICE_LOW,
    PRICE_HIGH,
}

/** Query for the hotels hub. Area and price are multi-select. */
data class HotelsQuery(
    val searchText: String? = null,
    val areas: List<String> = emptyList(),
    val priceRanges: List<String> = emptyList(),
    val minRating: Double? = null,
    val sort: HotelSort = HotelSort.FEATURED,
    val limit: Int = 20,
    val offset: Int = 0,
)

/** Paginated hotels response. */
data class HotelsResponse(
    val hotels: List<Hotel>,
    val totalCount: Int,
    val hasMore: Boolean,
)

/** Reads active hotels. Mirrors iOS HotelsService. */
@Singleton
class HotelsRemoteDataSource @Inject constructor(
    private val supabaseClient: SupabaseClient?,
) {
    private fun db(): SupabaseClient =
        supabaseClient ?: throw IllegalStateException("Supabase client is not configured.")

    suspend fun fetchHotels(query: HotelsQuery = HotelsQuery()): HotelsResponse {
        val result = db().from("hotels").select {
            count(Count.EXACT)
            filter { eq("is_active", true) }
            if (query.areas.isNotEmpty()) {
                filter { isIn("area", query.areas) }
            }
            if (query.priceRanges.isNotEmpty()) {
                filter { isIn("price_range", query.priceRanges) }
            }
            query.minRating?.let { min ->
                filter { gte("star_rating", min) }
            }
            if (!query.searchText.isNullOrBlank()) {
                filter {
                    or {
                        ilike("name", "%${query.searchText}%")
                        ilike("description", "%${query.searchText}%")
                        ilike("area", "%${query.searchText}%")
                        ilike("chain_name", "%${query.searchText}%")
                    }
                }
            }
            when (query.sort) {
                HotelSort.FEATURED -> {
                    order("is_featured", Order.DESCENDING)
                    order("sort_order", Order.ASCENDING)
                    order("name", Order.ASCENDING)
                }
                HotelSort.RATING -> {
                    order("star_rating", Order.DESCENDING)
                    order("name", Order.ASCENDING)
                }
                HotelSort.NAME -> order("name", Order.ASCENDING)
                HotelSort.PRICE_LOW -> {
                    order("price_range", Order.ASCENDING)
                    order("name", Order.ASCENDING)
                }
                HotelSort.PRICE_HIGH -> {
                    order("price_range", Order.DESCENDING)
                    order("name", Order.ASCENDING)
                }
            }
            range(query.offset.toLong(), (query.offset + query.limit - 1).toLong())
        }
        val hotels = result.decodeList<Hotel>()
        val total = result.countOrNull()?.toInt() ?: hotels.size
        return HotelsResponse(
            hotels = hotels,
            totalCount = total,
            hasMore = query.offset + query.limit < total,
        )
    }

    suspend fun fetchById(id: String): Hotel? =
        db().from("hotels").select {
            filter { eq("id", id) }
            limit(1L)
        }.decodeSingleOrNull<Hotel>()

    @Serializable
    private data class AreaRow(val area: String? = null)

    /** Distinct active-hotel areas, for the chip bar. */
    suspend fun fetchAreas(): List<String> =
        db().from("hotels").select(Columns.list("area")) {
            filter { eq("is_active", true) }
        }.decodeList<AreaRow>()
            .mapNotNull { it.area?.trim()?.takeIf { a -> a.isNotEmpty() } }
            .distinct()
            .sorted()
}
