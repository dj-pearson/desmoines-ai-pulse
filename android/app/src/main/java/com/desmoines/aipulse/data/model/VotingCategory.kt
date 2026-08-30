package com.desmoines.aipulse.data.model

import androidx.compose.runtime.Immutable
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * A "Best Of" community voting category from `voting_categories` (web useVoting
 * parity). [voteCount] is injected from an aggregate over `votes` — it is not a
 * column, so it stays 0 on a bare decode until the repository fills it in.
 * Mirrors iOS BestOf VotingCategory.
 */
@Immutable
@Serializable
data class VotingCategory(
    val id: String,
    val name: String,
    val slug: String = "",
    val description: String? = null,
    val icon: String = "trophy",
    @SerialName("is_active") val isActive: Boolean = true,
    @SerialName("voting_start") val votingStart: String? = null,
    @SerialName("voting_end") val votingEnd: String? = null,
    @SerialName("vote_count") val voteCount: Int = 0,
) {
    /** "12 votes" / "1 vote" / "No votes yet". */
    val voteCountLabel: String
        get() = when (voteCount) {
            0 -> "No votes yet"
            1 -> "1 vote"
            else -> "$voteCount votes"
        }
}
