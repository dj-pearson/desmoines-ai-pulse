import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useEffect } from "react";

/**
 * WEB-UX-008 — a verified page must never be swapped back out for a spinner.
 *
 * The auth layers re-report "loading" for reasons that have nothing to do with
 * the user: supabase-js re-announces the session every time the browser tab
 * regains focus, and permissions get re-fetched. Unmounting the page for those
 * re-checks destroys the open tab, the scroll position and any half-filled
 * form — which is exactly what users hit when switching tabs and coming back.
 */

let mockAuth = {
  user: { id: "u1" } as { id: string } | null,
  isLoading: false,
  isAdmin: true,
  isAdminLoading: false,
};

const mockPermission = {
  hasPermission: () => true,
  hasAnyPermission: () => true,
  hasMinimumRole: () => true,
  isLoading: false,
};

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mockAuth }));
vi.mock("@/hooks/usePermission", () => ({ usePermission: () => mockPermission }));

import { ProtectedRoute } from "@/components/ProtectedRoute";

let mountCount = 0;

function AdminPage() {
  useEffect(() => {
    mountCount++;
  }, []);
  return <div data-testid="admin-page">Admin page</div>;
}

// Mirrors the real route table: a redirect has to land somewhere, otherwise
// ProtectedRoute would re-render and redirect forever.
// A fresh element each time: re-using one element makes React bail out of
// reconciliation, so the component would never see the changed auth state.
const routedTree = () => (
  <MemoryRouter initialEntries={["/admin/content"]}>
    <Routes>
      <Route
        path="/admin/content"
        element={
          <ProtectedRoute requireAdmin>
            <AdminPage />
          </ProtectedRoute>
        }
      />
      <Route path="/auth" element={<div data-testid="auth-page">Sign in</div>} />
    </Routes>
  </MemoryRouter>
);

function renderRoute() {
  return render(routedTree());
}

describe("ProtectedRoute (WEB-UX-008)", () => {
  beforeEach(() => {
    mountCount = 0;
    mockAuth = {
      user: { id: "u1" },
      isLoading: false,
      isAdmin: true,
      isAdminLoading: false,
    };
  });

  it("keeps a verified page mounted while auth re-checks in the background", () => {
    const { rerender } = renderRoute();
    expect(screen.getByTestId("admin-page")).toBeInTheDocument();
    expect(mountCount).toBe(1);

    // Tab regains focus: supabase re-announces the session, admin is re-checked.
    mockAuth = { ...mockAuth, isAdminLoading: true };
    rerender(routedTree());

    expect(screen.getByTestId("admin-page")).toBeInTheDocument();
    expect(screen.queryByText(/verifying admin access/i)).not.toBeInTheDocument();
    expect(mountCount).toBe(1); // never remounted, so page state survives
  });

  it("still shows the loading state on a cold load", () => {
    mockAuth = { ...mockAuth, isAdminLoading: true };
    renderRoute();

    expect(screen.queryByTestId("admin-page")).not.toBeInTheDocument();
    expect(screen.getByText(/verifying admin access/i)).toBeInTheDocument();
  });

  it("still denies access when the admin role is actually revoked", () => {
    const { rerender } = renderRoute();
    expect(screen.getByTestId("admin-page")).toBeInTheDocument();

    mockAuth = { ...mockAuth, isAdmin: false };
    rerender(routedTree());

    expect(screen.queryByTestId("admin-page")).not.toBeInTheDocument();
    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
  });

  it("still redirects once the user signs out", () => {
    const { rerender } = renderRoute();
    expect(screen.getByTestId("admin-page")).toBeInTheDocument();

    mockAuth = { ...mockAuth, user: null };
    rerender(routedTree());

    expect(screen.queryByTestId("admin-page")).not.toBeInTheDocument();
    expect(screen.getByTestId("auth-page")).toBeInTheDocument();
  });
});
