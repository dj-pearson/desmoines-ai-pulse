import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("@/lib/errorHandler", () => ({ handleError: vi.fn() }));

import { ReportClosedControl } from "../ReportClosedControl";

function open() {
  render(<ReportClosedControl restaurantId="r1" restaurantName="Fong's Pizza" />);
  fireEvent.click(screen.getByRole("button", { name: /report it/i }));
}

describe("ReportClosedControl (WEB-FEAT-102)", () => {
  beforeEach(() => rpc.mockReset());

  it("sends the report and says it was received without claiming the listing changed", async () => {
    rpc.mockResolvedValue({ data: { received: true }, error: null });
    open();
    fireEvent.change(screen.getByLabelText(/what did you see/i), { target: { value: " sign on door " } });
    fireEvent.click(screen.getByRole("button", { name: /send report/i }));
    await waitFor(() => expect(screen.getByTestId("report-closed-sent")).toBeInTheDocument());
    expect(rpc).toHaveBeenCalledWith("report_restaurant_closed", { p_restaurant_id: "r1", p_note: "sign on door" });
    expect(screen.getByTestId("report-closed-sent").textContent).toMatch(/hasn't been changed/);
  });

  it("shows the rate-limit message from the server", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "54000", message: "You already reported this restaurant today" } });
    open();
    fireEvent.click(screen.getByRole("button", { name: /send report/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/already reported/));
    expect(screen.queryByTestId("report-closed-sent")).toBeNull();
  });

  it("a network failure is an error, not a confirmation", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST000", message: "boom" } });
    open();
    fireEvent.click(screen.getByRole("button", { name: /send report/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/couldn't send/));
  });
});
