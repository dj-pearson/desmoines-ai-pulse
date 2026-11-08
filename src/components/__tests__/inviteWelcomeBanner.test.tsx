import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Link, Route, Routes } from "react-router-dom";

const rpc = vi.fn();
let authState: { user: { id: string } | null; isLoading: boolean } = { user: null, isLoading: false };

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuthState: () => authState }));

import { ReferralCapture } from "@/components/ReferralCapture";
import { storage } from "@/lib/safeStorage";
import { INVITE_BANNER_DISMISSED_KEY, REFERRAL_STORAGE_KEY, storeReferral } from "@/lib/referralStorage";

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ReferralCapture />
      <Routes>
        <Route path="*" element={<Link to="/restaurants">Restaurants</Link>} />
      </Routes>
    </MemoryRouter>,
  );
}

const strip = () => screen.queryByRole("complementary", { name: "Invitation" });

describe("invite welcome strip (WEB-ADS-034)", () => {
  beforeEach(() => {
    storage.remove(INVITE_BANNER_DISMISSED_KEY);
    storage.remove(REFERRAL_STORAGE_KEY);
    rpc.mockReset();
    rpc.mockResolvedValue({ data: null, error: null });
    authState = { user: null, isLoading: false };
  });

  it("greets a signed-out visitor who opened an invite link and links to sign-up back to this page", async () => {
    renderAt("/events?ref=abcd2345&utm_source=referral&utm_medium=invite");
    expect(await screen.findByRole("complementary", { name: "Invitation" })).toBeInTheDocument();
    expect(screen.getByText(/A friend sent you to Des Moines Insider/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create a free account" })).toHaveAttribute(
      "href",
      "/auth?mode=signup&redirect=%2Fevents",
    );
  });

  it("stays up after in-app navigation drops the ?ref", async () => {
    renderAt("/?ref=ABCD2345");
    await screen.findByRole("complementary", { name: "Invitation" });
    fireEvent.click(screen.getByRole("link", { name: "Restaurants" }));
    expect(await screen.findByRole("link", { name: "Create a free account" })).toHaveAttribute(
      "href",
      "/auth?mode=signup&redirect=%2Frestaurants",
    );
  });

  it("does not greet a visit with only a stored code, a malformed ref, or no ref", async () => {
    storeReferral("ABCD2345");
    renderAt("/");
    renderAt("/?ref=<script>");
    renderAt("/events");
    // Give a lazy chunk the chance to resolve before asserting absence.
    await new Promise((r) => setTimeout(r, 20));
    expect(strip()).toBeNull();
  });

  it("does not show to a signed-in member, while auth is resolving, or on the auth page", async () => {
    authState = { user: { id: "u1" }, isLoading: false };
    const a = renderAt("/?ref=ABCD2345");
    await new Promise((r) => setTimeout(r, 20));
    expect(strip()).toBeNull();
    a.unmount();

    authState = { user: null, isLoading: true };
    const b = renderAt("/?ref=ABCD2345");
    await new Promise((r) => setTimeout(r, 20));
    expect(strip()).toBeNull();
    b.unmount();

    authState = { user: null, isLoading: false };
    renderAt("/auth?mode=signup&ref=ABCD2345");
    await new Promise((r) => setTimeout(r, 20));
    expect(strip()).toBeNull();
  });

  it("'Not now' closes it and it stays closed on the next invite visit", async () => {
    const first = renderAt("/?ref=ABCD2345");
    await screen.findByRole("complementary", { name: "Invitation" });
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(strip()).toBeNull());
    expect(storage.get(INVITE_BANNER_DISMISSED_KEY)).toBe(true);
    first.unmount();

    renderAt("/?ref=ABCD2345");
    await new Promise((r) => setTimeout(r, 20));
    expect(strip()).toBeNull();
  });

  it("still stores the code for attribution whether or not the strip shows", () => {
    storage.set(INVITE_BANNER_DISMISSED_KEY, true);
    renderAt("/?ref=abcd2345");
    expect(storage.get<{ code: string }>(REFERRAL_STORAGE_KEY)?.code).toBe("ABCD2345");
  });
});
