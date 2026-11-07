/**
 * Share-target URLs and button colours for ShareDialog.
 *
 * Every user-supplied value goes through encodeURIComponent. The mailto body
 * used to carry the description and url raw, so "Food & Drink" ended the body
 * at the "&" and the link never reached the email.
 */

export type SharePlatform = "facebook" | "x" | "linkedin" | "whatsapp" | "email" | "sms";

export interface ShareUrlInput {
  /** Subject line for email, e.g. "Jazz Night - Des Moines Events" */
  shareTitle: string;
  /** Short plain-text description (already truncated) */
  shareDescription: string;
  /** One-line message, e.g. "Check out this event: Jazz Night" */
  shareText: string;
  /** "event" | "article" */
  noun: string;
  url: string;
}

export function buildShareUrls({
  shareTitle,
  shareDescription,
  shareText,
  noun,
  url,
}: ShareUrlInput): Record<SharePlatform, string> {
  const u = encodeURIComponent(url);
  const text = encodeURIComponent(shareText);
  const emailBody = `${shareDescription}\n\nView ${noun}: ${url}`;
  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}&quote=${text}`,
    x: `https://twitter.com/intent/tweet?text=${text}&url=${u}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}`,
    email: `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(emailBody)}`,
    sms: `sms:?body=${encodeURIComponent(`${shareText} ${url}`)}`,
  };
}

/**
 * Fill colours for the share buttons, all with white text. Tailwind only
 * generates arbitrary-value classes it can see as literal strings, so the
 * hexes live inside the class names; shareLinks.test.ts parses them back out
 * and asserts every fill (resting and hover) is at least 4.5:1 against white.
 *
 * WCAG contrast against #FFFFFF, resting / hover:
 *   Facebook  #1464D2 5.55 / #0F5BC4 6.34   (brand #1877F2 was 4.23)
 *   X         #000000 21.0 / #1F2937 14.68
 *   LinkedIn  #0A66C2 5.69 / #004182 10.10
 *   WhatsApp  #075E54 7.67 / #054A42 10.17  (brand #25D366 was 1.98)
 *   Email     #C5221F 5.80 / #A51C1A 7.55   (#EA4335 was 3.92)
 *   SMS       #6B46C1 6.42 / #5B21B6 8.98
 */
export const SHARE_BUTTON_CLASSES: Record<SharePlatform, string> = {
  facebook: "bg-[#1464D2] hover:bg-[#0F5BC4] text-white",
  x: "bg-[#000000] hover:bg-[#1F2937] text-white",
  linkedin: "bg-[#0A66C2] hover:bg-[#004182] text-white",
  whatsapp: "bg-[#075E54] hover:bg-[#054A42] text-white",
  email: "bg-[#C5221F] hover:bg-[#A51C1A] text-white",
  sms: "bg-[#6B46C1] hover:bg-[#5B21B6] text-white",
};
