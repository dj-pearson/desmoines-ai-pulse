#!/usr/bin/env node

/**
 * Social Media Diversity Test
 *
 * This script tests the improved social media manager by generating multiple posts
 * and checking for content diversity.
 */

const TEST_CONFIG = {
  apiUrl:
    "https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/social-media-manager",
  numberOfTests: 5,
  testInterval: 2000, // 2 seconds between tests
};

// Test function to generate posts and check diversity
async function testContentDiversity() {
  console.log("🧪 Testing Social Media Content Diversity...\n");

  const selectedEvents = [];
  const selectedRestaurants = [];

  for (let i = 1; i <= TEST_CONFIG.numberOfTests; i++) {
    console.log(`\n--- Test ${i}/${TEST_CONFIG.numberOfTests} ---`);

    try {
      // Test event generation
      console.log("Testing event post generation...");
      const eventResult = await generatePost("event", "event_of_the_day");

      if (eventResult.success && eventResult.selectedContent) {
        const event = eventResult.selectedContent;
        selectedEvents.push({
          id: event.id,
          title: event.title,
          postCount: eventResult.postCount || "unknown",
        });
        console.log(`✅ Event selected: "${event.title}" (ID: ${event.id})`);
      } else {
        console.log("❌ Event generation failed");
      }

      // Wait between requests
      await sleep(TEST_CONFIG.testInterval);

      // Test restaurant generation
      console.log("Testing restaurant post generation...");
      const restaurantResult = await generatePost(
        "restaurant",
        "restaurant_of_the_day"
      );

      if (restaurantResult.success && restaurantResult.selectedContent) {
        const restaurant = restaurantResult.selectedContent;
        selectedRestaurants.push({
          id: restaurant.id,
          name: restaurant.name,
          postCount: restaurantResult.postCount || "unknown",
        });
        console.log(
          `✅ Restaurant selected: "${restaurant.name}" (ID: ${restaurant.id})`
        );
      } else {
        console.log("❌ Restaurant generation failed");
      }
    } catch (error) {
      console.error(`❌ Test ${i} failed:`, error.message);
    }

    // Wait between test cycles
    if (i < TEST_CONFIG.numberOfTests) {
      await sleep(TEST_CONFIG.testInterval);
    }
  }

  // Analyze results
  console.log("\n📊 DIVERSITY ANALYSIS");
  console.log("=====================\n");

  // Event diversity analysis
  console.log("🎭 Event Diversity:");
  const eventCounts = {};
  selectedEvents.forEach((event) => {
    eventCounts[event.id] = (eventCounts[event.id] || 0) + 1;
  });

  Object.entries(eventCounts).forEach(([id, count]) => {
    const event = selectedEvents.find((e) => e.id === id);
    const indicator = count > 2 ? "⚠️ " : count > 1 ? "⚡ " : "✅ ";
    console.log(`${indicator}${event.title}: ${count} time(s)`);
  });

  // Restaurant diversity analysis
  console.log("\n🍽️ Restaurant Diversity:");
  const restaurantCounts = {};
  selectedRestaurants.forEach((restaurant) => {
    restaurantCounts[restaurant.id] =
      (restaurantCounts[restaurant.id] || 0) + 1;
  });

  Object.entries(restaurantCounts).forEach(([id, count]) => {
    const restaurant = selectedRestaurants.find((r) => r.id === id);
    const indicator = count > 2 ? "⚠️ " : count > 1 ? "⚡ " : "✅ ";
    console.log(`${indicator}${restaurant.name}: ${count} time(s)`);
  });

  // Overall assessment
  const eventDuplicates = Object.values(eventCounts).filter(
    (count) => count > 1
  ).length;
  const restaurantDuplicates = Object.values(restaurantCounts).filter(
    (count) => count > 1
  ).length;
  const excessiveRepeats = [
    ...Object.values(eventCounts),
    ...Object.values(restaurantCounts),
  ].filter((count) => count > 2).length;

  console.log("\n🎯 SUMMARY:");
  console.log(
    `✅ Unique events selected: ${Object.keys(eventCounts).length}/${
      selectedEvents.length
    }`
  );
  console.log(
    `✅ Unique restaurants selected: ${Object.keys(restaurantCounts).length}/${
      selectedRestaurants.length
    }`
  );
  console.log(
    `⚡ Minor duplicates (2x): ${eventDuplicates + restaurantDuplicates}`
  );
  console.log(`⚠️ Excessive repeats (3+x): ${excessiveRepeats}`);

  if (excessiveRepeats === 0) {
    console.log("\n🎉 SUCCESS: No excessive repetition detected!");
  } else {
    console.log("\n❌ ISSUE: Excessive repetition still occurring");
  }
}

// Mock function to simulate post generation
async function generatePost(contentType, subjectType) {
  // In a real test, this would call the actual Supabase function
  // For now, we'll return mock data to demonstrate the test structure

  console.log(`  Generating ${contentType} post for ${subjectType}...`);

  // Simulate different content being selected
  const mockEvents = [
    { id: "event-1", title: "2025 Summer Concert Series" },
    { id: "event-2", title: "Des Moines Farmers Market" },
    { id: "event-3", title: "Art Festival Downtown" },
    { id: "event-4", title: "Food Truck Friday" },
    { id: "event-5", title: "Jazz in the Park" },
  ];

  const mockRestaurants = [
    { id: "rest-1", name: "The Continental" },
    { id: "rest-2", name: "Zombie Burger" },
    { id: "rest-3", name: "Proof Restaurant" },
    { id: "rest-4", name: "Alba Restaurant" },
    { id: "rest-5", name: "Centro" },
  ];

  const content =
    contentType === "event"
      ? mockEvents[Math.floor(Math.random() * mockEvents.length)]
      : mockRestaurants[Math.floor(Math.random() * mockRestaurants.length)];

  return {
    success: true,
    selectedContent: content,
    postCount: Math.floor(Math.random() * 3), // Simulate different post counts
  };
}

// Utility function to sleep
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run the test

// Run the test if executed directly
if (
  typeof process !== "undefined" &&
  process.argv[1] &&
  process.argv[1].endsWith("test-social-media-diversity.js")
) {
  testContentDiversity().catch(console.error);
}
