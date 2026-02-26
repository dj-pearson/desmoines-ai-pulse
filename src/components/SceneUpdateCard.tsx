import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { SceneUpdate } from '@/hooks/useSceneUpdates';

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  new_opening: { label: 'New!', color: 'bg-green-500' },
  closing: { label: 'Closing', color: 'bg-red-500' },
  renovation: { label: 'Under Renovation', color: 'bg-yellow-500' },
  expansion: { label: 'Expanding', color: 'bg-blue-500' },
  news: { label: 'News', color: 'bg-purple-500' },
};

function getEntityLink(update: SceneUpdate): string | null {
  if (!update.entity_id || !update.entity_type) return null;
  const routes: Record<string, string> = {
    restaurant: '/restaurants',
    attraction: '/attractions',
  };
  const base = routes[update.entity_type];
  return base ? `${base}/${update.entity_id}` : null;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function SceneUpdateCard({ update }: { update: SceneUpdate }) {
  const typeConfig = TYPE_CONFIG[update.update_type] || TYPE_CONFIG.news;
  const entityLink = getEntityLink(update);

  const content = (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4 flex gap-4">
        {update.image_url && (
          <img
            src={update.image_url}
            alt=""
            className="w-20 h-20 rounded object-cover flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge className={`${typeConfig.color} text-white text-xs`}>
              {typeConfig.label}
            </Badge>
            {update.neighborhood && (
              <span className="text-xs text-muted-foreground">{update.neighborhood}</span>
            )}
            <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
              {timeAgo(update.publish_date)}
            </span>
          </div>
          <h3 className="font-medium text-sm line-clamp-1">{update.title}</h3>
          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{update.body}</p>
        </div>
      </CardContent>
    </Card>
  );

  if (entityLink) {
    return <Link to={entityLink}>{content}</Link>;
  }

  return content;
}
