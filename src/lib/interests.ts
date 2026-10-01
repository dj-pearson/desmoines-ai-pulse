/**
 * The interest ids a profile can carry, and the words shown for them.
 *
 * These ids are stored in `profiles.interests` (text[]), so they are a schema:
 * renaming one orphans every row that already holds it. Add new ids; do not
 * rename or remove old ones.
 *
 * Sign-up no longer asks for interests (account plan WP1 item 5). The first
 * dashboard visit does, and so do AuthVerified and PreferencesManager, which is
 * why the list lives here rather than in a page.
 */
export interface Interest {
  id: string;
  label: string;
}

export const INTERESTS: Interest[] = [
  { id: "food", label: "Food & Dining" },
  { id: "music", label: "Music & Concerts" },
  { id: "sports", label: "Sports & Recreation" },
  { id: "arts", label: "Arts & Culture" },
  { id: "nightlife", label: "Nightlife & Entertainment" },
  { id: "outdoor", label: "Outdoor Activities" },
  { id: "family", label: "Family Events" },
  { id: "networking", label: "Business & Networking" },
];

const LABELS = new Map(INTERESTS.map((interest) => [interest.id, interest.label]));

/**
 * The label for an interest id. An id this build does not know (written by a
 * newer client, or by hand) comes back as itself rather than as nothing, so a
 * saved interest never silently disappears from a list.
 */
export function interestLabel(id: string): string {
  return LABELS.get(id) ?? id;
}
