import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataQualityDashboard } from "@/components/DataQualityDashboard";

/**
 * WEB-UX-066. Each content-type section header on the admin data-quality
 * dashboard was a CardHeader with onClick and no button, so a keyboard user
 * could not expand or collapse it. The events section was also meant to start
 * open but was keyed 'events' against a content type of 'event'.
 */

// A row with no name and no description produces at least one issue.
const events = [{ id: "e1" }];
const restaurants = [{ id: "r1" }];

function renderDashboard() {
  return render(
    <DataQualityDashboard
      events={events}
      restaurants={restaurants}
      attractions={[]}
      playgrounds={[]}
    />,
  );
}

describe("DataQualityDashboard section toggles (WEB-UX-066)", () => {
  it("gives each section header a real button with aria-expanded", () => {
    renderDashboard();
    const eventsToggle = screen.getByRole("button", { name: /^events/i });
    const restaurantsToggle = screen.getByRole("button", { name: /^restaurants/i });
    // Events is the section that starts open.
    expect(eventsToggle).toHaveAttribute("aria-expanded", "true");
    expect(restaurantsToggle).toHaveAttribute("aria-expanded", "false");
    // aria-controls points at the open region.
    const regionId = eventsToggle.getAttribute("aria-controls");
    expect(regionId).toBeTruthy();
    expect(document.getElementById(regionId as string)).not.toBeNull();
  });

  it("toggles a section from the keyboard", async () => {
    const user = userEvent.setup();
    renderDashboard();
    const restaurantsToggle = screen.getByRole("button", { name: /^restaurants/i });

    restaurantsToggle.focus();
    await user.keyboard("{Enter}");
    expect(restaurantsToggle).toHaveAttribute("aria-expanded", "true");
    const regionId = restaurantsToggle.getAttribute("aria-controls") as string;
    expect(document.getElementById(regionId)).not.toBeNull();

    await user.keyboard(" ");
    expect(restaurantsToggle).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById(regionId)).toBeNull();
  });

  it("labels the severity filter", () => {
    renderDashboard();
    expect(screen.getByRole("combobox", { name: "Severity" })).toBeInTheDocument();
  });
});
