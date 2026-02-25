import { useAuditLogEntries } from '@/hooks/useAuditLog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ClipboardList } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function AuditLogPanel() {
  const { data: entries, isLoading } = useAuditLogEntries(100);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Audit Log
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" />
          Admin Audit Log
        </CardTitle>
      </CardHeader>
      <CardContent>
        {(!entries || entries.length === 0) ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No admin actions recorded yet.
          </p>
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="space-y-3">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {entry.action || 'unknown'}
                      </Badge>
                      <span className="text-sm font-medium truncate">
                        {entry.resource}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {entry.identifier}
                      </span>
                    </div>
                    {entry.details && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {typeof entry.details === 'object'
                          ? JSON.stringify(entry.details).slice(0, 120)
                          : String(entry.details)}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                      </span>
                      {entry.user_id && (
                        <span className="text-xs text-muted-foreground">
                          by {entry.user_id.slice(0, 8)}...
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
