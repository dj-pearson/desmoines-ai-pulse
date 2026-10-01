import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

/**
 * WEB-QUAL-008. /admin/security told an operator things that were not true.
 *
 * AdminSecurityManager rendered five tabs and four were mock-ups on a real
 * admin route: a maintenance toggle that flipped useState and confirmed "Site
 * is now in maintenance mode. Only admins can access"; a Save that wrote to
 * localStorage and said "All security settings have been saved successfully";
 * "Active Threats" and "Blocked IPs" counters computed from hardcoded arrays;
 * and three invented security-log rows. Nothing in App.tsx or
 * functions/_middleware.ts reads any of it.
 *
 * A security control that reports success without acting is worse than no
 * control - it is the screen someone checks during an incident. The tabs are
 * removed rather than implemented; this keeps them removed.
 */
const PAGE = readFileSync("src/pages/AdminSecurity.tsx", "utf8");
const CODE = PAGE.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/(?<!:)\/\/.*$/, ""))
  .join("\n");

describe("the admin security page claims only what it does", () => {
  it("the mock manager is gone", () => {
    expect(existsSync("src/components/AdminSecurityManager.tsx")).toBe(false);
    expect(CODE).not.toContain("AdminSecurityManager");
  });

  it("renders the one control that is real", () => {
    // blocked_email_domains exists and is enforced at signup; it was the only
    // tab querying anything.
    expect(CODE).toContain("BlockedEmailDomainsManager");
  });

  it("makes no maintenance-mode or IP-blocking claim", () => {
    expect(CODE).not.toMatch(/maintenanceMode/);
    expect(CODE).not.toMatch(/blockIP|blockedIPs/);
    expect(CODE).not.toMatch(/localStorage|storage\.set/);
  });

  it("still gates on the admin roles", () => {
    expect(CODE).toMatch(/root_admin/);
    expect(CODE).toContain("useAdminAuth");
  });
});

describe("there is one 404 page, and it is the routed one", () => {
  it("Enhanced404 is deleted rather than left as a second implementation", () => {
    expect(existsSync("src/pages/Enhanced404.tsx")).toBe(false);
  });

  it("NotFound is what the catch-all route renders", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).not.toContain("Enhanced404");
    expect(app).toMatch(/path="\*" element=\{<NotFound \/>\}/);
  });

  it("the surviving 404 noindexes exactly once", () => {
    // Enhanced404 rendered SEOHead - which emits `index, follow` - AND its own
    // Helmet `noindex`, so swapping it in would have reintroduced the two
    // conflicting robots metas fixed under WEB-SEO-040.
    const nf = readFileSync("src/pages/NotFound.tsx", "utf8");
    expect(nf).toContain('name="robots"');
    expect(nf).not.toContain("SEOHead");
  });
});
