import { CheckCircle } from "lucide-react";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

interface LastUpdatedBadgeProps {
  updatedAt?: string;
  className?: string;
}

function getRelativeTime(dateStr: string): string {
  const now = Date.now();
  const updated = new Date(dateStr).getTime();
  const diffMs = now - updated;
  const diffMin = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffWeeks === 1) return "Last week";
  if (diffWeeks < 5) return `${diffWeeks} weeks ago`;
  if (diffMonths === 1) return "Last month";
  return `${diffMonths} months ago`;
}

export function LastUpdatedBadge({ updatedAt, className = "" }: LastUpdatedBadgeProps) {
  if (!updatedAt) return null;

  const daysSinceUpdate = (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24);
  const isRecent = daysSinceUpdate <= 7;

  return (
    <div className={`flex items-center gap-1.5 text-xs text-muted-foreground ${className}`}>
      {isRecent ? (
        <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <SpriteIcon name="clock" className="h-3.5 w-3.5" />
      )}
      <span>
        {isRecent && <span className="text-emerald-600 font-medium">Verified</span>}
        {isRecent ? " · " : ""}Last updated: {getRelativeTime(updatedAt)}
      </span>
    </div>
  );
}
