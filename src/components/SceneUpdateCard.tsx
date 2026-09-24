import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { OptimizedImage } from '@/components/OptimizedImage';
import { formatSceneUpdateTime, type SceneUpdate, type SceneUpdateType } from '@/hooks/useSceneUpdates';
import { safeWebUrl } from '@/lib/hotelBooking';

/**
 * Tinted -100/-900 pairs. The old badges were white text on green-500 and
 * yellow-500, about 2.1-2.3:1 (WP6 item 4). Each pair here clears 4.5:1 in
 * both themes. News is neutral slate rather than purple.
 */
const TYPE_CONFIG: Record<SceneUpdateType, { label: string; className: string }> = {
  new_opening: {
    label: 'New',
    className: 'bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100',
  },
  closing: {
    label: 'Closing',
    className: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100',
  },
  renovation: {
    label: 'Under renovation',
    className: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100',
  },
  expansion: {
    label: 'Expanding',
    className: 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-100',
  },
  news: {
    label: 'News',
    className: 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100',
  },
};

function getEntityLink(update: SceneUpdate): string | null {
  if (!update.entity_id || !update.entity_type) return null;
  if (update.entity_type === 'restaurant') {
    return `/restaurants/${update.entity_slug || update.entity_id}`;
  }
  if (update.entity_type === 'attraction') {
    return `/attractions/${update.entity_id}`;
  }
  return null;
}

interface SceneUpdateCardProps {
  update: SceneUpdate;
}

export function SceneUpdateCard({ update }: SceneUpdateCardProps) {
  const typeConfig = TYPE_CONFIG[update.update_type] ?? TYPE_CONFIG.news;
  const entityLink = getEntityLink(update);
  const sourceUrl = safeWebUrl(update.source_url);

  return (
    <Card className="relative transition-colors hover:border-foreground/30">
      <CardContent className="p-4 flex gap-4">
        {update.image_url && (
          <OptimizedImage
            src={update.image_url}
            alt=""
            width={80}
            height={80}
            containerClassName="w-20 h-20 rounded flex-shrink-0"
            className="object-cover"
            sizes="80px"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
            <Badge variant="outline" className={`border-transparent text-xs ${typeConfig.className}`}>
              {typeConfig.label}
            </Badge>
            {update.neighborhood && (
              <span className="text-xs text-muted-foreground">{update.neighborhood}</span>
            )}
            <time
              dateTime={update.publish_date}
              className="text-xs text-muted-foreground ml-auto flex-shrink-0"
            >
              {formatSceneUpdateTime(update.publish_date)}
            </time>
          </div>
          <h3 className="font-medium text-sm line-clamp-2">
            {entityLink ? (
              // The link lives on the heading and its ::after covers the card,
              // so the whole card is clickable while the accessible name is
              // just the title, not the title plus body plus date.
              <Link
                to={entityLink}
                className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-offset-2 focus-visible:after:ring-offset-background hover:underline"
              >
                {update.title}
              </Link>
            ) : (
              update.title
            )}
          </h3>
          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{update.body}</p>
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="relative z-10 mt-2 inline-flex min-h-6 items-center text-xs font-medium text-foreground underline underline-offset-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Source<span className="sr-only"> for {update.title} (opens in a new tab)</span>
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
