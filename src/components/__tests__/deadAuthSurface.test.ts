import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

/**
 * WEB-AUTH-011. Three auth components were mounted by nothing.
 *
 * AdminLogin.tsx was the one worth deleting on its own merits, not just for
 * tidiness: it did `const success = await login(email, password)` and branched
 * on it, while login() returns `{ success, error }`. An object is always
 * truthy, so a FAILED login took the success branch and called navigate(0) - a
 * full page reload - and the error message it set was unreachable. Nobody ever
 * saw it because nothing imported the file; wiring it up was the bug.
 *
 * This test exists so the deletion is a decision rather than a gap somebody
 * fills back in. /admin/* already goes through ProtectedRoute requireAdmin and
 * /auth, so a second admin login form is a second thing to keep correct.
 */
describe("the dead auth surface stays deleted", () => {
  it.each([
    "src/components/AdminLogin.tsx",
    "src/components/auth/LoginActivityList.tsx",
    "src/hooks/useLoginActivity.ts",
  ])("%s is gone", (path) => {
    expect(existsSync(path)).toBe(false);
  });

  it("nothing imports what was removed", () => {
    // Belt and braces: a re-added file would fail above, but an import of one
    // that never comes back is a build error nobody needs to debug twice.
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).not.toContain("AdminLogin");
    expect(app).not.toContain("LoginActivityList");
  });

  it("the one admin gate is ProtectedRoute, and it is still wired", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).toContain("ProtectedRoute");
    expect(app).toMatch(/requireAdmin/);
  });
});
