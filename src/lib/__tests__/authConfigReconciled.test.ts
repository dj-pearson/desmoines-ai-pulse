import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PASSWORD_MIN_LENGTH, PASSWORD_RULES } from "../passwordStrength";

/**
 * WEB-AUTH-009. supabase/config.toml now carries the auth rules that used to
 * live only in the dashboard. These cases hold the file and the clients to
 * each other: a password the sign-up form accepts is one GoTrue accepts, and
 * every redirect a web, iOS or Android caller sends is on the allow-list.
 *
 * There is no TOML parser in the repo, so this reads the two tables it needs
 * by line. If [auth] is renamed or split the reads come back empty and the
 * cases fail rather than pass on nothing.
 */

const CONFIG = readFileSync("supabase/config.toml", "utf8");

/** The body of one [table] header, up to the next header. */
function table(name: string): string {
  const lines = CONFIG.split("\n");
  const start = lines.findIndex((line) => line.trim() === `[${name}]`);
  if (start < 0) return "";
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*\[/.test(line)) break;
    body.push(line);
  }
  return body.join("\n");
}

function value(body: string, key: string): string | undefined {
  return body.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, "m"))?.[1].trim();
}

function redirectList(body: string): string[] {
  const raw = body.match(/^additional_redirect_urls\s*=\s*\[([\s\S]*?)\]/m)?.[1] ?? "";
  return [...raw.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** GoTrue's allow-list glob, reduced to what this file uses: ** matches anything. */
function globMatches(pattern: string, url: string): boolean {
  const escaped = pattern
    .split("**")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`).test(url);
}

const AUTH = table("auth");
const AUTH_EMAIL = table("auth.email");
const REDIRECTS = redirectList(AUTH);

describe("supabase/config.toml [auth] matches the clients (WEB-AUTH-009)", () => {
  it("has an [auth] table with a site_url on the production host", () => {
    expect(AUTH).not.toBe("");
    expect(value(AUTH, "site_url")).toBe('"https://desmoinesinsider.com"');
  });

  it("requires the same minimum length the sign-up form does", () => {
    expect(Number(value(AUTH, "minimum_password_length"))).toBe(PASSWORD_MIN_LENGTH);
  });

  it("requires the same character classes the sign-up form does", () => {
    const ids = PASSWORD_RULES.map((rule) => rule.id).filter((id) => id !== "length").sort();
    // GoTrue's levels are cumulative; this is the only one that matches the
    // client's four rules. Dropping a client rule without lowering this level
    // means the form would accept passwords the server refuses.
    expect(ids).toEqual(["lowercase", "number", "symbol", "uppercase"]);
    expect(value(AUTH, "password_requirements")).toBe('"lower_upper_letters_digits_symbols"');
  });

  it("keeps email confirmation on", () => {
    expect(value(AUTH_EMAIL, "enable_confirmations")).toBe("true");
  });

  const sent: Array<[string, string]> = [
    // src/lib/authActions.ts confirmationRedirectUrl()
    ["web sign-up confirmation", "https://desmoinesinsider.com/auth/callback?redirect=%2Fauth%2Fverified"],
    ["web sign-up on www", "https://www.desmoinesinsider.com/auth/callback?redirect=%2Fauth%2Fverified"],
    ["web OAuth callback", "https://desmoinesinsider.com/auth/callback?redirect=%2Fprofile"],
    // src/lib/authActions.ts resetPassword()
    ["web password reset", "https://desmoinesinsider.com/auth/reset-password"],
    ["local dev confirmation", "http://localhost:8080/auth/callback?redirect=%2Fauth%2Fverified"],
    ["local dev password reset", "http://localhost:8080/auth/reset-password"],
    // ios SupabaseService.swift redirectToURL
    ["iOS PKCE callback", "com.desmoines.aipulse://auth-callback"],
    // android AuthCallbackRouter.OAUTH_REDIRECT_URL and RECOVERY_REDIRECT_URL
    ["Android OAuth callback", "com.desmoines.aipulse://auth-callback?flow=oauth"],
    ["Android password recovery", "com.desmoines.aipulse://auth-callback?flow=recovery"],
  ];

  it.each(sent)("allows the %s redirect", (_label, url) => {
    expect(REDIRECTS.some((pattern) => globMatches(pattern, url))).toBe(true);
  });

  it("does not allow an unrelated host or an open path on the app scheme", () => {
    const refused = [
      "https://evil.example/auth/callback",
      "https://desmoinesinsider.com.evil.example/auth/callback",
      "com.desmoines.aipulse://event/123",
    ];
    for (const url of refused) {
      expect(REDIRECTS.some((pattern) => globMatches(pattern, url))).toBe(false);
    }
  });

  it("still names the redirect sources the list was built from", () => {
    // If a caller changes its redirect, these reads go stale first.
    expect(readFileSync("src/lib/authActions.ts", "utf8")).toContain("/auth/callback?redirect=");
    expect(readFileSync("src/lib/authActions.ts", "utf8")).toContain("/auth/reset-password");
    expect(readFileSync("ios/DesMoinesInsider/Services/SupabaseService.swift", "utf8")).toContain(
      "://auth-callback",
    );
    expect(
      readFileSync("android/app/src/main/java/com/desmoines/aipulse/data/remote/AuthRemoteDataSource.kt", "utf8"),
    ).toContain('RECOVERY_REDIRECT_URL = "com.desmoines.aipulse://auth-callback?flow=recovery"');
  });
});
