import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Utensils,
  Clock,
  ChevronDown,
  ChevronUp,
  Flame,
  Leaf,
  WheatOff,
  Star,
  History,
  ExternalLink,
} from 'lucide-react';
import { useRestaurantMenu, MenuSection } from '@/hooks/useRestaurantMenu';

interface RestaurantMenuSectionProps {
  restaurantId: string;
  restaurantName: string;
}

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

function MenuSectionCard({ section }: { section: MenuSection }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="space-y-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full py-2 px-1 hover:bg-muted/50 rounded-lg transition-colors"
      >
        <h4 className="font-semibold text-base">{section.name}</h4>
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="text-xs">{section.items.length} items</span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="space-y-0">
          {section.items.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 py-2.5 px-1 border-b border-dashed border-muted last:border-0"
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

export function RestaurantMenuSection({ restaurantId, restaurantName }: RestaurantMenuSectionProps) {
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
    return null; // Don't show empty menu section
  }

  return (
    <Card id="menu">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Utensils className="w-5 h-5" />
            Menu
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
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
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

        {/* Menu sections */}
        <div className="space-y-4">
          {data.sections.map((section, idx) => (
            <div key={section.name}>
              {idx > 0 && <Separator className="mb-3" />}
              <MenuSectionCard section={section} />
            </div>
          ))}
        </div>

        {/* Footer stats */}
        <div className="mt-4 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
          <span>{data.totalItems} items across {data.sections.length} categories</span>
          <span>v{data.menu.version}</span>
        </div>
      </CardContent>
    </Card>
  );
}
