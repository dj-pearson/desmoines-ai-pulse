import { Link } from "react-router-dom";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { AdminKpiTile } from "@/hooks/useAdminHomeStats";

interface AdminKpiStripProps {
  tiles: AdminKpiTile[] | undefined;
  isLoading: boolean;
}

function DeltaIndicator({ value }: { value: number }) {
  if (value === 0) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <ArrowRight className="h-3 w-3" />
        0
      </span>
    );
  }
  const isPositive = value > 0;
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-xs font-medium",
        isPositive ? "text-green-600 dark:text-green-500" : "text-red-600 dark:text-red-500",
      )}
    >
      {isPositive ? (
        <ArrowUp className="h-3 w-3" />
      ) : (
        <ArrowDown className="h-3 w-3" />
      )}
      {isPositive ? "+" : ""}{value}
    </span>
  );
}

function KpiTile({ tile }: { tile: AdminKpiTile }) {
  return (
    <Link to={tile.href} className="block">
      <Card className="hover:bg-accent/50 transition-colors h-full">
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground mb-1 truncate">
            {tile.label}
          </div>
          <div className="text-2xl font-bold tabular-nums">
            {tile.total.toLocaleString()}
          </div>
          <div className="mt-2">
            <DeltaIndicator value={tile.deltaSevenDay} />
            <span className="ml-1 text-xs text-muted-foreground">7d</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function KpiSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <Skeleton className="h-3 w-20 mb-2" />
        <Skeleton className="h-7 w-16 mb-2" />
        <Skeleton className="h-3 w-12" />
      </CardContent>
    </Card>
  );
}

export function AdminKpiStrip({ tiles, isLoading }: AdminKpiStripProps) {
  if (isLoading || !tiles) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <KpiSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
      {tiles.map((tile) => (
        <KpiTile key={tile.key} tile={tile} />
      ))}
    </div>
  );
}
