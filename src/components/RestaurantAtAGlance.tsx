import { Link } from "react-router-dom";
import { DollarSign, Phone, Utensils } from "lucide-react";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import type { AreaLink } from "@/lib/restaurantAtAGlance";

export interface RestaurantMenuLink {
  href: string;
  label: string;
  external: boolean;
}

export interface RestaurantAtAGlanceProps {
  /** scheduleHoursSentence(): "Open 11 AM to 9 PM on Fridays". Null hides the row: hours are never guessed. */
  hoursSentence: string | null;
  /** "$" to "$$$$", or null. */
  priceTier: string | null;
  /** restaurants.location as stored. */
  address: string | null;
  /** The suburb or city, appended when the stored address does not already name it. */
  locality: string | null;
  phone: string | null;
  phoneHref: string | null;
  menu: RestaurantMenuLink | null;
  /** The neighbourhood/suburb page, then the published cuisine x area pages that list this place. */
  areaLinks: AreaLink[];
  /** lastUpdatedLabel(updated_at). */
  lastUpdated: string | null;
}

/**
 * The answers to "<name> hours / menu / phone / address", directly under the
 * restaurant's name and before any long copy (SEO-034). Server-rendered by the
 * prerender: every value is a fact from the row, phrased so it stays true
 * after the build that captured it (see restaurantAtAGlance.ts).
 *
 * A description list, so a screen reader announces each label with its
 * value. Rows the restaurant has no data for are left out rather than shown
 * empty.
 */
export function RestaurantAtAGlance({
  hoursSentence,
  priceTier,
  address,
  locality,
  phone,
  phoneHref,
  menu,
  areaLinks,
  lastUpdated,
}: RestaurantAtAGlanceProps) {
  const addressText =
    address && locality && !address.toLowerCase().includes(locality.toLowerCase())
      ? `${address}, ${locality}`
      : address;
  const linkClass = "font-medium text-[#2D1B69] underline-offset-2 hover:underline dark:text-violet-300";
  const hasFacts = hoursSentence || priceTier || addressText || (phone && phoneHref) || menu;
  if (!hasFacts && areaLinks.length === 0 && !lastUpdated) return null;

  return (
    <section aria-label="At a glance" className="border-b bg-card px-4 py-4 md:px-6">
      {hasFacts ? (
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          {hoursSentence && (
            <div className="flex items-start gap-3">
              <SpriteIcon name="clock" className="mt-0.5 h-4 w-4 shrink-0 text-[#2D1B69] dark:text-violet-300" />
              <div>
                <dt className="sr-only">Hours</dt>
                <dd className="text-foreground">
                  {hoursSentence}{" "}
                  <a href="#hours" className={linkClass}>
                    All hours
                  </a>
                </dd>
              </div>
            </div>
          )}
          {addressText && (
            <div className="flex items-start gap-3">
              <SpriteIcon name="map-pin" className="mt-0.5 h-4 w-4 shrink-0 text-[#2D1B69] dark:text-violet-300" />
              <div>
                <dt className="sr-only">Address</dt>
                <dd className="text-foreground">{addressText}</dd>
              </div>
            </div>
          )}
          {phone && phoneHref && (
            <div className="flex items-start gap-3">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-[#2D1B69] dark:text-violet-300" aria-hidden="true" />
              <div>
                <dt className="sr-only">Phone</dt>
                <dd>
                  <a href={phoneHref} className={linkClass}>
                    {phone}
                  </a>
                </dd>
              </div>
            </div>
          )}
          {priceTier && (
            <div className="flex items-start gap-3">
              <DollarSign className="mt-0.5 h-4 w-4 shrink-0 text-[#2D1B69] dark:text-violet-300" aria-hidden="true" />
              <div>
                <dt className="sr-only">Price</dt>
                <dd className="text-foreground">
                  {priceTier} <span className="text-muted-foreground">price level on Google</span>
                </dd>
              </div>
            </div>
          )}
          {menu && (
            <div className="flex items-start gap-3">
              <Utensils className="mt-0.5 h-4 w-4 shrink-0 text-[#2D1B69] dark:text-violet-300" aria-hidden="true" />
              <div>
                <dt className="sr-only">Menu</dt>
                <dd>
                  <a
                    href={menu.href}
                    className={linkClass}
                    {...(menu.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  >
                    {menu.label}
                  </a>
                </dd>
              </div>
            </div>
          )}
        </dl>
      ) : null}
      {areaLinks.length > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          More nearby:{" "}
          {areaLinks.map((link, i) => (
            <span key={link.href}>
              {i > 0 ? ", " : ""}
              <Link to={link.href} className={linkClass}>
                {link.label}
              </Link>
            </span>
          ))}
        </p>
      )}
      {lastUpdated && <p className="mt-2 text-xs text-muted-foreground">Listing last updated {lastUpdated}</p>}
    </section>
  );
}
