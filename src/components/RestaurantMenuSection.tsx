import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Utensils, ChevronDown, ChevronUp, Flame, Leaf, WheatOff, Star, History } from "lucide-react";
import { useRestaurantMenu, useRestaurantMenuVersions, type MenuSection } from '@/hooks/useRestaurantMenu';
import { MenuSchema } from '@/components/schema/MenuSchema';
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { safeWebUrl } from '@/lib/reservations';

interface RestaurantMenuSectionProps {
  restaurantId: string;
  restaurantName: string;
  restaurantSlug?: string;
  restaurantDescription?: string;
  city?: string;
  cuisine?: string;
  /**
   * restaurants.menu_url. When no menu has been captured, a card linking to it
   * stands in, so the page's Menu link never lands on nothing.
   */
  menuUrl?: string | null;
}

const LARGE_MENU_THRESHOLD = 30;

const dietaryIcons: Record<string, { icon: typeof Leaf; color: string; label: string }> = {
  vegan: { icon: Leaf, color: 'text-green-600', label: 'Vegan' },
  vegetarian: { icon: Leaf, color: 'text-green-500', label: 'Vegetarian' },
  'gluten-free': { icon: WheatOff, color: 'text-amber-600', label: 'GF' },
  spicy: { icon: Flame, color: 'text-red-500', label: 'Spicy' },
};

function DietaryBadge({ tag }: { tag: string }) {
  const config = dietaryIcons[tag];
  if (config) {
    const Icon = config.icon;
    return (
      <Badge variant="outline" className={`text-xs px-1.5 py-0 ${config.color} border-current`}>
        <Icon className="w-3 h-3 mr-0.5" aria-hidden="true" />
        {config.label}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs px-1.5 py-0">
      {tag}
    </Badge>
  );
}

interface MenuSectionBlockProps {
  section: MenuSection;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}

function MenuSectionBlock({ section, index, expanded, onToggle }: MenuSectionBlockProps) {
  const contentId = `menu-section-${index}`;
  return (
    <div id={`menu-section-head-${index}`} className="scroll-mt-24 space-y-1">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-h-11 w-full items-center justify-between rounded-lg px-1 py-2 transition-colors hover:bg-muted/50"
        aria-expanded={expanded}
        aria-controls={contentId}
      >
        <h3 className="text-base font-semibold">{section.name}</h3>
        <span className="flex items-center gap-2 text-muted-foreground">
          <span className="text-xs">{section.items.length} items</span>
          {expanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
        </span>
      </button>

      {expanded && (
        <ul id={contentId} className="space-y-0" aria-label={`${section.name} menu items`}>
          {section.items.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3 border-b border-dashed border-muted px-1 py-2.5 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium">{item.item_name}</span>
                  {item.is_popular && (
                    <Badge className="bg-amber-100 px-1 py-0 text-[11px] leading-tight text-amber-800">
                      <Star className="mr-0.5 h-2.5 w-2.5 fill-current" aria-hidden="true" />
                      Popular
                    </Badge>
                  )}
                </div>
                {item.item_description && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.item_description}</p>
                )}
                {item.dietary_tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {item.dietary_tags.map((tag) => (
                      <DietaryBadge key={tag} tag={tag} />
                    ))}
                  </div>
                )}
              </div>
              {item.price && (
                <span className="whitespace-nowrap text-sm font-medium text-foreground tabular-nums">{item.price}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "August 3, 2026", in Central time. */
function formatCapturedDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "an unknown date";
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Chicago',
  });
}

interface MenuSectionNavProps {
  sections: MenuSection[];
  onJump: (index: number) => void;
}

/**
 * Quick-jump buttons for a large menu. A collapsed section has no item list
 * to scroll to, so a jump opens the section first and scrolls to its header,
 * which always exists (WP3.11).
 */
function MenuSectionNav({ sections, onJump }: MenuSectionNavProps) {
  return (
    <nav aria-label="Menu sections" className="mb-4 flex flex-wrap items-center gap-1.5 border-b pb-3">
      <span className="mr-1 text-xs text-muted-foreground">Jump to:</span>
      {sections.map((section, index) => (
        <button
          type="button"
          key={section.name}
          onClick={() => onJump(index)}
          className="inline-flex min-h-11 items-center rounded-full bg-muted px-3 text-xs text-foreground transition-colors hover:bg-muted/80"
        >
          {section.name} ({section.items.length})
        </button>
      ))}
    </nav>
  );
}

function MenuHistory({ restaurantId }: { restaurantId: string }) {
  const { data: versions, isLoading } = useRestaurantMenuVersions(restaurantId, true);
  if (isLoading) return <p className="mb-4 text-xs text-muted-foreground">Loading menu history...</p>;
  if (!versions || versions.length <= 1) {
    return <p className="mb-4 text-xs text-muted-foreground">This is the only version of the menu we have.</p>;
  }
  return (
    <ul className="mb-4 space-y-1.5 rounded-lg bg-muted/50 p-3" aria-label="Menu history">
      {versions.map((v) => (
        <li
          key={v.id}
          className={`flex items-center justify-between rounded px-2 py-1 text-xs ${v.is_current ? 'bg-primary/10 font-medium' : ''}`}
        >
          <span>
            Captured {formatCapturedDate(v.captured_at)}
            {v.is_current && (
              <Badge variant="secondary" className="ml-1.5 px-1 py-0 text-[11px]">
                Current
              </Badge>
            )}
          </span>
          <span className="capitalize text-muted-foreground">{v.source_type}</span>
        </li>
      ))}
    </ul>
  );
}

export function RestaurantMenuSection({
  restaurantId,
  restaurantName,
  restaurantSlug,
  restaurantDescription,
  city,
  cuisine,
  menuUrl,
}: RestaurantMenuSectionProps) {
  const { data, isLoading } = useRestaurantMenu(restaurantId, { includeVersions: false });
  const [showVersions, setShowVersions] = useState(false);
  // Which sections are open. null until the reader touches one, so the
  // default (all open on a short menu, all shut on a long one) follows the
  // data when it arrives.
  const [openSections, setOpenSections] = useState<Set<number> | null>(null);

  if (isLoading) {
    return (
      <section id="menu" aria-labelledby="menu-heading" aria-busy="true" className="scroll-mt-20">
        <h2 id="menu-heading" className="flex items-center gap-2 text-xl font-bold text-foreground">
          <Utensils className="h-5 w-5" aria-hidden="true" />
          Menu
        </h2>
        <div className="mt-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse motion-reduce:animate-none">
              <div className="mb-2 h-4 w-1/3 rounded bg-muted" />
              <div className="h-3 w-2/3 rounded bg-muted" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!data?.menu || data.sections.length === 0) {
    const externalMenu = safeWebUrl(menuUrl);
    if (!externalMenu) return null;
    return (
      <section id="menu" aria-labelledby="menu-heading" className="scroll-mt-20">
        <h2 id="menu-heading" className="flex items-center gap-2 text-xl font-bold text-foreground">
          <Utensils className="h-5 w-5" aria-hidden="true" />
          Menu
        </h2>
        <p className="mt-2 text-muted-foreground">
          We haven't captured {restaurantName}'s menu. They publish one on their own site.
        </p>
        <Button asChild variant="outline" className="mt-3 min-h-11">
          <a href={externalMenu} target="_blank" rel="noopener noreferrer">
            Menu (on their site)
            <SpriteIcon name="external-link" className="ml-2 h-4 w-4" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </Button>
      </section>
    );
  }

  const menu = data.menu;
  const menuSource = safeWebUrl(menu.source_url);
  const fromTheirSite = menu.source_type === 'scraped' || !!menuSource;
  const isLargeMenu = data.totalItems >= LARGE_MENU_THRESHOLD;
  const open = openSections ?? new Set(isLargeMenu ? [] : data.sections.map((_, i) => i));

  const toggle = (index: number) => {
    const next = new Set(open);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setOpenSections(next);
  };

  const jumpTo = (index: number) => {
    setOpenSections(new Set(open).add(index));
    // After the section has rendered open.
    requestAnimationFrame(() => {
      document
        .getElementById(`menu-section-head-${index}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <section id="menu" aria-labelledby="menu-heading" className="scroll-mt-20">
      {/* Menu JSON-LD, only when a menu with sections has been captured */}
      {restaurantSlug && (
        <MenuSchema
          restaurantName={restaurantName}
          restaurantSlug={restaurantSlug}
          restaurantDescription={restaurantDescription}
          city={city}
          cuisine={cuisine}
          sections={data.sections}
          capturedAt={menu.captured_at}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="menu-heading" className="flex items-center gap-2 text-xl font-bold text-foreground">
          <Utensils className="h-5 w-5" aria-hidden="true" />
          {restaurantName} menu
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowVersions((v) => !v)}
            className="min-h-11 text-xs"
            aria-expanded={showVersions}
          >
            <History className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            History
          </Button>
          {menuSource && (
            <a
              href={menuSource}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Their menu
              <SpriteIcon name="external-link" className="ml-1 h-3.5 w-3.5" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </div>
      </div>

      <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
        <SpriteIcon name="clock" className="h-3.5 w-3.5" aria-hidden="true" />
        <span>
          Menu captured{fromTheirSite ? ' from their site' : ''} on {formatCapturedDate(menu.captured_at)}.
          Dishes and prices may have changed since.
        </span>
      </p>

      <div className="mt-4">
        {showVersions && <MenuHistory restaurantId={restaurantId} />}

        {isLargeMenu && data.sections.length > 2 && (
          <MenuSectionNav sections={data.sections} onJump={jumpTo} />
        )}

        <div className="space-y-4">
          {data.sections.map((section, idx) => (
            <div key={section.name}>
              {idx > 0 && <Separator className="mb-3" />}
              <MenuSectionBlock
                section={section}
                index={idx}
                expanded={open.has(idx)}
                onToggle={() => toggle(idx)}
              />
            </div>
          ))}
        </div>

        <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
          {data.totalItems} items across {data.sections.length} sections
        </p>
      </div>
    </section>
  );
}
