import { Construction } from "lucide-react";
import AdminNav from "@/components/admin/AdminNav";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface AdminPlaceholderProps {
  title: string;
  storyId: string;
  description: string;
}

/**
 * Stub used by admin routes registered in App.tsx ahead of their full
 * implementation. Each placeholder names the Ralph story that will
 * replace it so it's obvious what's coming.
 */
export default function AdminPlaceholder({
  title,
  storyId,
  description,
}: AdminPlaceholderProps) {
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Construction className="h-5 w-5 text-amber-600 dark:text-amber-500" />
              {title}
            </CardTitle>
            <CardDescription>
              Tracked by story <code className="font-mono text-xs">{storyId}</code>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{description}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
