import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * WEB-ADS-048: the owner's hours form, photo upload, status report and the
 * text form without the old "Photo link" box.
 */

// Radix Checkbox measures itself; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const toast = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast }));

const handleError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/errorHandler", () => ({ handleError }));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ isAuthenticated: true, user: { id: "u1" } }) }));

const updateMutate = vi.hoisted(() => vi.fn());
const reportMutate = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useMyBusinessClaims", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useMyBusinessClaims")>();
  return {
    ...actual,
    useUpdateClaimedListing: () => ({ mutateAsync: updateMutate, isPending: false }),
    useReportListingStatus: () => ({ mutateAsync: reportMutate, isPending: false }),
  };
});

const upload = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload,
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/media/${path}` } }),
      }),
    },
  },
}));

import { OwnerHoursForm } from "@/components/business/OwnerHoursForm";
import { OwnerPhotoUpload } from "@/components/business/OwnerPhotoUpload";
import { OwnerStatusReport } from "@/components/business/OwnerStatusReport";
import { ClaimedListingEditForm } from "@/components/business/ClaimedListingEditForm";

const GOOGLE_HOURS = {
  source: "google-places",
  periods: [{ open: { day: 1, hour: 11, minute: 0 }, close: { day: 1, hour: 21, minute: 0 } }],
};

beforeEach(() => {
  vi.clearAllMocks();
  updateMutate.mockResolvedValue(true);
  reportMutate.mockResolvedValue("queued");
  upload.mockResolvedValue({ data: { path: "p" }, error: null });
});

describe("OwnerHoursForm", () => {
  it("starts from Google's hours and saves structured periods, including a late night", async () => {
    render(<OwnerHoursForm listingId="r1" listingName="Lucca" hoursJson={GOOGLE_HOURS} />);
    expect(screen.getByLabelText("Monday opens")).toHaveValue("11:00");
    expect(screen.getByText(/hours Google has for you/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: "Friday" }));
    fireEvent.change(screen.getByLabelText("Friday opens"), { target: { value: "17:00" } });
    fireEvent.change(screen.getByLabelText("Friday closes"), { target: { value: "01:30" } });
    await userEvent.click(screen.getByRole("button", { name: "Save hours" }));

    expect(updateMutate).toHaveBeenCalledWith({
      listingType: "restaurant",
      listingId: "r1",
      patch: {
        hours_json: {
          periods: [
            { open: { day: 1, hour: 11, minute: 0 }, close: { day: 1, hour: 21, minute: 0 } },
            { open: { day: 5, hour: 17, minute: 0 }, close: { day: 6, hour: 1, minute: 30 } },
          ],
        },
      },
    });
    expect(toast.success).toHaveBeenCalled();
  });

  it("does not send a week with overlapping times, and says which day", async () => {
    render(<OwnerHoursForm listingId="r1" listingName="Lucca" hoursJson={GOOGLE_HOURS} />);
    await userEvent.click(screen.getByRole("button", { name: "Add a second time on Monday" }));
    const opens = screen.getAllByLabelText("Monday opens");
    fireEvent.change(opens[1], { target: { value: "20:00" } });
    await userEvent.click(screen.getByRole("button", { name: "Save hours" }));
    expect(updateMutate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("The opening times on Monday overlap.");
  });

  it("shows the database's refusal without its function name", async () => {
    updateMutate.mockRejectedValue({ message: "update_claimed_listing: two opening times overlap" });
    render(<OwnerHoursForm listingId="r1" listingName="Lucca" hoursJson={GOOGLE_HOURS} />);
    await userEvent.click(screen.getByRole("button", { name: "Save hours" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Those hours didn't save: two opening times overlap.");
  });

  it("owner hours offer handing the hours back to Google, which sends null", async () => {
    render(<OwnerHoursForm listingId="r1" listingName="Lucca" hoursJson={{ ...GOOGLE_HOURS, source: "owner" }} />);
    await userEvent.click(screen.getByRole("button", { name: "Use Google's hours instead" }));
    expect(updateMutate).toHaveBeenCalledWith({ listingType: "restaurant", listingId: "r1", patch: { hours_json: null } });
  });
});

describe("OwnerPhotoUpload", () => {
  const pick = (file: File) => fireEvent.change(screen.getByLabelText("Photo"), { target: { files: [file] } });

  it("uploads a JPEG to the owner's listing-photos folder and saves its storage URL", async () => {
    render(<OwnerPhotoUpload listingType="restaurant" listingId="r1" listingName="Lucca" currentUrl={null} />);
    pick(new File(["x".repeat(100)], "front.jpg", { type: "image/jpeg" }));
    await waitFor(() => expect(updateMutate).toHaveBeenCalled());
    const [path, , options] = upload.mock.calls[0];
    expect(path).toMatch(/^u1\/listing-photos\/r1\/\d+\.jpg$/);
    expect(options).toMatchObject({ contentType: "image/jpeg", upsert: false });
    expect(updateMutate).toHaveBeenCalledWith({
      listingType: "restaurant",
      listingId: "r1",
      patch: { image_url: `https://x.supabase.co/storage/v1/object/public/media/${path}` },
    });
  });

  it("refuses a GIF and a file over 5 MB before anything is uploaded", async () => {
    render(<OwnerPhotoUpload listingType="restaurant" listingId="r1" listingName="Lucca" currentUrl={null} />);
    pick(new File(["x"], "a.gif", { type: "image/gif" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Use a JPEG, PNG or WebP photo.");
    const big = new File(["x"], "big.png", { type: "image/png" });
    Object.defineProperty(big, "size", { value: 6 * 1024 * 1024 });
    pick(big);
    expect(await screen.findByRole("alert")).toHaveTextContent(/over 5 MB/);
    expect(upload).not.toHaveBeenCalled();
    expect(updateMutate).not.toHaveBeenCalled();
  });
});

describe("OwnerStatusReport", () => {
  it("closed for good asks once more, then sends the report with the note", async () => {
    render(<OwnerStatusReport listingId="r1" listingName="Lucca" businessStatus="OPERATIONAL" status="open" />);
    await userEvent.click(screen.getByRole("button", { name: "We've closed for good" }));
    expect(reportMutate).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText(/Anything we should know/), "Last night was Saturday");
    await userEvent.click(screen.getByRole("button", { name: "Yes, we've closed for good" }));
    expect(reportMutate).toHaveBeenCalledWith({
      listingId: "r1",
      status: "closed_permanently",
      note: "Last night was Saturday",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Your closure report is with our team.");
  });

  it("temporarily closed offers reopening; a listing closed for good points to email", async () => {
    const { unmount } = render(
      <OwnerStatusReport listingId="r1" listingName="Lucca" businessStatus="CLOSED_TEMPORARILY" status="open" />,
    );
    await userEvent.click(screen.getByRole("button", { name: "We've reopened" }));
    expect(reportMutate).toHaveBeenCalledWith({ listingId: "r1", status: "reopened", note: undefined });
    unmount();

    render(<OwnerStatusReport listingId="r1" listingName="Lucca" businessStatus="OPERATIONAL" status="closed" />);
    expect(screen.getByText("This listing is marked closed for good.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("an open listing can be reported temporarily closed in one press", async () => {
    render(<OwnerStatusReport listingId="r1" listingName="Lucca" businessStatus="OPERATIONAL" status="open" />);
    await userEvent.click(screen.getByRole("button", { name: "We're temporarily closed" }));
    expect(reportMutate).toHaveBeenCalledWith({ listingId: "r1", status: "temporarily_closed", note: undefined });
  });
});

describe("ClaimedListingEditForm", () => {
  it("no longer offers a typed photo link; the text fields still save as a diff", async () => {
    render(
      <ClaimedListingEditForm
        listingType="restaurant"
        listingId="r1"
        listingName="Lucca"
        initialValues={{ phone: "(515) 555-0000", image_url: "https://elsewhere.example/p.jpg" }}
      />,
    );
    expect(screen.queryByLabelText(/Photo/)).not.toBeInTheDocument();
    const phone = screen.getByLabelText("Phone");
    await userEvent.clear(phone);
    await userEvent.type(phone, "(515) 555-1234");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(updateMutate).toHaveBeenCalledWith({ listingType: "restaurant", listingId: "r1", patch: { phone: "(515) 555-1234" } });
  });
});
