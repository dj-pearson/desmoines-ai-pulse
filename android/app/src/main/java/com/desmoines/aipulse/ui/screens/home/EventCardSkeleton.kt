package com.desmoines.aipulse.ui.screens.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.ui.components.rememberShimmerBrush
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import com.desmoines.aipulse.ui.theme.Dimens

/**
 * Skeleton placeholder for event cards with shimmer animation.
 * Matches the EventCardView layout for smooth loading transitions.
 * Mirrors iOS EventCardSkeleton (inline in HomeView.swift).
 * Respects system "reduce animations" setting (ANIMATOR_DURATION_SCALE).
 */
@Composable
fun EventCardSkeleton(
    modifier: Modifier = Modifier
) {
    val brush = rememberShimmerBrush()

    Card(
        modifier = modifier
            .fillMaxWidth()
            .semantics { contentDescription = "Loading event" },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column {
            // Image area
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(180.dp)
                    .background(brush)
            ) {
                // Category badge placeholder
                Box(
                    modifier = Modifier
                        .padding(10.dp)
                        .width(70.dp)
                        .height(22.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(brush)
                )

                // Favorite button placeholder
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(10.dp)
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(brush)
                )

                // Date badge placeholder
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(10.dp)
                        .width(48.dp)
                        .height(52.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(brush)
                )
            }

            // Content area
            Column(modifier = Modifier.padding(14.dp)) {
                // Title
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.75f)
                        .height(18.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(brush)
                )
                Spacer(modifier = Modifier.height(Dimens.SpacingSm))

                // Time row
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(12.dp)
                            .clip(CircleShape)
                            .background(brush)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Box(
                        modifier = Modifier
                            .width(160.dp)
                            .height(12.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(brush)
                    )
                }
                Spacer(modifier = Modifier.height(4.dp))

                // Location row
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(12.dp)
                            .clip(CircleShape)
                            .background(brush)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Box(
                        modifier = Modifier
                            .width(120.dp)
                            .height(12.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(brush)
                    )
                }
                Spacer(modifier = Modifier.height(Dimens.SpacingSm))

                // Price badge placeholder
                Box(
                    modifier = Modifier
                        .width(60.dp)
                        .height(22.dp)
                        .clip(RoundedCornerShape(11.dp))
                        .background(brush)
                )
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun EventCardSkeletonPreview() {
    DesMoinesInsiderTheme {
        EventCardSkeleton(modifier = Modifier.padding(16.dp))
    }
}
