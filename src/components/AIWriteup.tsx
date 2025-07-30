import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Calendar } from "lucide-react";

interface AIWriteupProps {
  writeup: string;
  generatedAt?: string | null;
  prompt?: string | null;
  className?: string;
}

export default function AIWriteup({
  writeup,
  generatedAt,
  prompt,
  className,
}: AIWriteupProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Card
      className={`border-blue-100 bg-gradient-to-br from-blue-50/50 to-purple-50/50 ${className}`}
    >
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-semibold text-gray-800 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            Enhanced Overview
          </CardTitle>
        </div>
        {generatedAt && (
          <div className="flex items-center gap-1 text-sm text-gray-500">
            <Calendar className="h-3 w-3" />
            Generated on {formatDate(generatedAt)}
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="prose prose-gray max-w-none">
          <div
            className="text-gray-700 leading-relaxed text-lg whitespace-pre-wrap"
            style={{
              lineHeight: "1.7",
              fontFamily:
                'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
            }}
          >
            {writeup}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
