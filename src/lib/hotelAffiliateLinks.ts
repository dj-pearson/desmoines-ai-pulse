/**
 * Client-side mirror of the `build_hotel_affiliate_url` SQL function
 * (migration 20260730000001_hotel_affiliate_programs.sql).
 *
 * Used only to preview a link in the admin UI before saving. The database
 * remains the single source of truth for what actually gets written to
 * hotels.affiliate_url — keep the two in sync when either changes.
 */

import type { Database } from "@/integrations/supabase/types";

export type HotelAffiliateProgram =
  Database["public"]["Tables"]["hotel_affiliate_programs"]["Row"];

export type AffiliateNetwork =
  | "impact"
  | "partnerize"
  | "cj"
  | "awin"
  | "sovrn"
  | "custom";

export const AFFILIATE_NETWORKS: AffiliateNetwork[] = [
  "impact",
  "partnerize",
  "cj",
  "awin",
  "sovrn",
  "custom",
];

export const PROGRAM_STATUSES = [
  "not_applied",
  "applied",
  "approved",
  "rejected",
  "paused",
] as const;

export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

/** Sentinel brand_parent for the catch-all program. */
export const FALLBACK_BRAND = "*";

interface NetworkFieldSpec {
  /** Which credential columns this network uses, and what to call them. */
  label: string;
  /** Placeholder/help text shown under the field. */
  hint: string;
  required: boolean;
}

/**
 * Per-network field labelling. The columns are generic (account_id, ad_id,
 * campaign_id, tracking_domain) because every network names them differently;
 * this maps them back to the vocabulary the network's own dashboard uses.
 */
export const NETWORK_FIELDS: Record<
  AffiliateNetwork,
  Partial<
    Record<
      "account_id" | "ad_id" | "campaign_id" | "tracking_domain" | "link_template",
      NetworkFieldSpec
    >
  >
> = {
  impact: {
    tracking_domain: {
      label: "Tracking domain",
      hint: "The brand's vanity domain from your link, e.g. marriott.pxf.io",
      required: true,
    },
    account_id: {
      label: "Account ID",
      hint: "First number in the /c/ path of your impact.com tracking link",
      required: true,
    },
    ad_id: {
      label: "Ad ID",
      hint: "Second number in the /c/ path",
      required: true,
    },
    campaign_id: {
      label: "Campaign ID",
      hint: "Third number in the /c/ path",
      required: true,
    },
  },
  partnerize: {
    account_id: {
      label: "Camref",
      hint: "Your campaign reference, e.g. 1011l35Cv",
      required: true,
    },
  },
  cj: {
    account_id: {
      label: "PID (Publisher ID)",
      hint: "Your CJ website/publisher ID",
      required: true,
    },
    ad_id: {
      label: "AID (Advertiser link ID)",
      hint: "The advertiser's link ID from the CJ link you were given",
      required: true,
    },
  },
  awin: {
    account_id: {
      label: "awinaffid",
      hint: "Your Awin publisher ID",
      required: true,
    },
    ad_id: {
      label: "awinmid",
      hint: "The merchant ID for this brand's Awin programme",
      required: true,
    },
  },
  sovrn: {
    account_id: {
      label: "API key",
      hint: "Your Sovrn Commerce (VigLink) key",
      required: true,
    },
  },
  custom: {
    link_template: {
      label: "Link template",
      hint: "Use {destination_encoded} where the hotel URL goes. {destination} and {subid} are also available.",
      required: true,
    },
  },
};

/**
 * RFC 3986 percent-encoding. `encodeURIComponent` already leaves the
 * unreserved set (A-Z a-z 0-9 - . _ ~) alone, matching the SQL helper, except
 * for ! ' ( ) * which it also leaves — encode those explicitly so preview and
 * database agree byte for byte.
 */
export function urlEncode(input: string): string {
  return encodeURIComponent(input).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

type ProgramLike = Pick<
  HotelAffiliateProgram,
  | "network"
  | "account_id"
  | "ad_id"
  | "campaign_id"
  | "tracking_domain"
  | "link_template"
  | "sub_id"
>;

/**
 * Builds the affiliate redirect URL for a destination, or null when the
 * program is missing the credentials its network requires.
 */
export function buildAffiliateUrl(
  program: ProgramLike,
  destination: string,
  subIdOverride?: string,
): string | null {
  if (!destination) return null;

  const enc = urlEncode(destination);
  const subId = urlEncode(
    subIdOverride || program.sub_id || "desmoines-insider",
  );

  switch (program.network as AffiliateNetwork) {
    case "impact": {
      const { tracking_domain, account_id, ad_id, campaign_id } = program;
      if (!tracking_domain || !account_id || !ad_id || !campaign_id) return null;
      return `https://${tracking_domain}/c/${account_id}/${ad_id}/${campaign_id}?u=${enc}&subId1=${subId}`;
    }
    case "partnerize": {
      if (!program.account_id) return null;
      return `https://prf.hn/click/camref:${program.account_id}/pubref:${subId}/destination:${enc}`;
    }
    case "cj": {
      if (!program.account_id || !program.ad_id) return null;
      return `https://www.anrdoezrs.net/click-${program.account_id}-${program.ad_id}?sid=${subId}&url=${enc}`;
    }
    case "awin": {
      if (!program.account_id || !program.ad_id) return null;
      return `https://www.awin1.com/cread.php?awinmid=${program.ad_id}&awinaffid=${program.account_id}&clickref=${subId}&ued=${enc}`;
    }
    case "sovrn": {
      if (!program.account_id) return null;
      return `https://redirect.viglink.com/?key=${program.account_id}&u=${enc}&cuid=${subId}`;
    }
    default: {
      if (!program.link_template) return null;
      return program.link_template
        .replace(/\{destination_encoded\}/g, enc)
        .replace(/\{destination\}/g, destination)
        .replace(/\{subid\}/g, subId);
    }
  }
}

/**
 * True when every field the selected network marks as required is filled in.
 * Drives the "can this program be enabled" check in the admin UI.
 */
export function isProgramComplete(program: ProgramLike): boolean {
  const spec = NETWORK_FIELDS[program.network as AffiliateNetwork] ?? {};
  return Object.entries(spec).every(([field, meta]) => {
    if (!meta?.required) return true;
    const value = program[field as keyof ProgramLike];
    return typeof value === "string" && value.trim().length > 0;
  });
}
