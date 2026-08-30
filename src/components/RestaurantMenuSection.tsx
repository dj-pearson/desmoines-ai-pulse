import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Utensils, ChevronDown, ChevronUp, Flame, Leaf, WheatOff, Star, History, Search } from "lucide-react";
import { useRestaurantMenu, MenuSection } from '@/hooks/useRestaurantMenu';
import { CollapsibleSection } from '@/components/CollapsibleSection';
import { MenuSchema } from '@/components/schema/MenuSchema';
import { SpriteIcon } from "@/components/ui/SpriteIcon";

interface RestaurantMenuSectionProps {
  restaurantId: string;
  restaurantName: string;
  restaurantSlug?: string;
  restaurantDescription?: string;
  city?: string;
  cuisine?: string;
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
        <Icon className="w-3 h-3 mr-0.5" />
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

function MenuSectionCard({ section, defaultExpanded }: { section: MenuSection; defaultExpanded: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="space-y-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full py-2 px-1 hover:bg-muted/50 rounded-lg transition-colors"
        aria-expanded={expanded}
        aria-controls={`menu-section-${section.name.replace(/\s+/g, '-').toLowerCase()}`}
      >
        <h4 className="font-semibold text-base">{section.name}</h4>
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="text-xs">{section.items.length} items</span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div
          id={`menu-section-${section.name.replace(/\s+/g, '-').toLowerCase()}`}
          className="space-y-0"
          role="list"
          aria-label={`${section.name} menu items`}
        >
          {section.items.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 py-2.5 px-1 border-b border-dashed border-muted last:border-0"
              role="listitem"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium text-sm">{item.item_name}</span>
                  {item.is_popular && (
                    <Badge className="bg-amber-100 text-amber-800 text-[10px] px-1 py-0 leading-tight">
                      <Star className="w-2.5 h-2.5 mr-0.5 fill-current" />
                      Popular
                    </Badge>
                  )}
                </div>
                {item.item_description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {item.item_description}
                  </p>
                )}
                {item.dietary_tags.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {item.dietary_tags.map((tag) => (
                      <DietaryBadge key={tag} tag={tag} />
                    ))}
                  </div>
                )}
              </div>
              {item.price && (
                <span className="text-sm font-medium text-primary whitespace-nowrap">
                  {item.price}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatCapturedDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Quick-jump buttons for menu sections when menu is large */
function MenuSectionNav({ sections }: { sections: MenuSection[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-4 pb-3 border-b">
      <span className="text-xs text-muted-foreground mr-1 self-center">Jump to:</span>
      {sections.map((section) => (
        <button
          key={section.name}
          onClick={() => {
            const el = document.getElementById(
              `menu-section-${section.name.replace(/\s+/g, '-').toLowerCase()}`
            );
            el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          className="text-xs px-2.5 py-1 bg-muted hover:bg-muted/80 rounded-full transition-colors text-muted-foreground hover:text-foreground"
        >
          {section.name} ({section.items.length})
        </button>
      ))}
    </div>
  );
}

export function RestaurantMenuSection({
  restaurantId,
  restaurantName,
  restaurantSlug,
  restaurantDescription,
  city,
  cuisine,
}: RestaurantMenuSectionProps) {
  const { data, isLoading } = useRestaurantMenu(restaurantId);
  const [showVersions, setShowVersions] = useState(false);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Utensils className="w-5 h-5" />
            Menu
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-muted rounded w-1/3 mb-2" />
                <div className="h-3 bg-muted rounded w-2/3" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data?.menu || data.sections.length === 0) {
    return null;
  }

  const isLargeMenu = data.totalItems >= LARGE_MENU_THRESHOLD;

  return (
    <>
      {/* Menu Schema.org structured data for "[restaurant] + menu" SEO */}
      {restaurantSlug && (
        <MenuSchema
          restaurantName={restaurantName}
          restaurantSlug={restaurantSlug}
          restaurantDescription={restaurantDescription}
          city={city}
          cuisine={cuisine}
          sections={data.sections}
          capturedAt={data.menu.captured_at}
        />
      )}

      <Card id="menu">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Utensils className="w-5 h-5" />
              <span>{restaurantName} Menu</span>
            </CardTitle>
            <div className="flex items-center gap-2">
              {data.versions.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowVersions(!showVersions)}
                  className="text-xs h-7"
                >
                  <History className="w-3.5 h-3.5 mr-1" />
                  {data.versions.length} versions
                </Button>
              )}
              {data.menu.source_url && (
                <a
                  href={data.menu.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="View original menu source"
                >
                  <SpriteIcon name="external-link" className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>

          {/* SEO-friendly subtitle for menu */}
          <p className="text-sm text-muted-foreground">
            Browse the full {restaurantName} menu with {data.totalItems} items across{' '}
            {data.sections.length} categories
            {cuisine ? ` — ${cuisine} cuisine` : ''}
            {city ? ` in ${city}, Iowa` : ''}.
          </p>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <SpriteIcon name="clock" className="w-3 h-3" />
            <span>
              Menu from {formatCapturedDate(data.menu.captured_at)}
              {' — '}may have changed since then
            </span>
          </div>

          {data.menu.source_type === 'scraped' && (
            <p className="text-[11px] text-muted-foreground/70">
              Automatically collected from {restaurantName}&apos;s website
            </p>
          )}
        </CardHeader>

        <CardContent className="pt-0">
          {/* Version history dropdown */}
          {showVersions && data.versions.length > 1 && (
            <div className="mb-4 p-3 bg-muted/50 rounded-lg space-y-1.5">
              <p className="text-xs font-medium mb-2">Menu History</p>
              {data.versions.map((v) => (
                <div
                  key={v.id}
                  className={`flex items-center justify-between text-xs py-1 px-2 rounded ${
                    v.is_current ? 'bg-primary/10 font-medium' : ''
                  }`}
                >
                  <span>
                    v{v.version} — {formatCapturedDate(v.captured_at)}
                    {v.is_current && (
                      <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0">
                        Current
                      </Badge>
                    )}
                  </span>
                  <span className="text-muted-foreground capitalize">{v.source_type}</span>
                </div>
              ))}
            </div>
          )}

          {/* Section quick-jump nav for large menus */}
          {isLargeMenu && data.sections.length > 2 && (
            <MenuSectionNav sections={data.sections} />
          )}

          {/* Menu sections — collapse individual sections by default on large menus */}
          <div className="space-y-4">
            {data.sections.map((section, idx) => (
              <div key={section.name}>
                {idx > 0 && <Separator className="mb-3" />}
                <MenuSectionCard
                  section={section}
                  defaultExpanded={!isLargeMenu}
                />
              </div>
            ))}
          </div>

          {/* Footer stats */}
          <div className="mt-4 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
            <span>{data.totalItems} items across {data.sections.length} categories</span>
            <span>v{data.menu.version}</span>
          </div>

          {/* SEO content block — hidden visually but readable by crawlers */}
          <div className="sr-only" aria-hidden="true">
            <h3>{restaurantName} Menu Prices and Items</h3>
            <p>
              View the complete {restaurantName} menu with prices.{' '}
              {restaurantName} offers {data.totalItems} menu items
              {cuisine ? ` featuring ${cuisine} cuisine` : ''}
              {city ? ` in ${city}, Iowa` : ''}.
              Menu categories include {data.sections.map((s) => s.name).join(', ')}.
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
