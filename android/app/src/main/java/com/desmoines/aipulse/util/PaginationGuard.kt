package com.desmoines.aipulse.util

/**
 * Detects a desynced paginated response before it can corrupt a list (ANDP-062).
 *
 * A page is rejected when it exceeds the requested limit, or (when appending)
 * repeats an id that's already been loaded — either one signals server/offset
 * drift, so the caller should surface an error + reload affordance instead of
 * appending bad data. Pure and unit-testable.
 */
object PaginationGuard {

    sealed interface Result {
        data object Valid : Result
        data class Invalid(val reason: String) : Result

        val isValid: Boolean get() = this is Valid
    }

    /**
     * @param page the freshly fetched page (raw server rows, before client filtering)
     * @param limit the requested page size; a response larger than this is invalid
     * @param existingIds ids already shown — empty for a first page/reset, the
     *        accumulated list's ids for a load-more (to catch offset overlap)
     * @param id extracts a stable id from a row
     */
    fun <T> validatePage(
        page: List<T>,
        limit: Int,
        existingIds: Set<String>,
        id: (T) -> String,
    ): Result {
        if (limit > 0 && page.size > limit) {
            return Result.Invalid("page of ${page.size} exceeds requested limit $limit")
        }
        val duplicate = page.firstOrNull { id(it) in existingIds }
        if (duplicate != null) {
            return Result.Invalid("page repeats already-loaded id ${id(duplicate)}")
        }
        return Result.Valid
    }
}
