import { Calendar } from 'lucide-react';

interface PseoSeasonalContextProps {
  content: string;
  heading?: string;
}

export function PseoSeasonalContext({ content, heading }: PseoSeasonalContextProps) {
  if (!content) return null;

  return (
    <section className="rounded-lg border bg-gradient-to-br from-blue-50 to-green-50 dark:from-blue-950/20 dark:to-green-950/20 p-6">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">{heading ?? 'Seasonal Guide'}</h2>
      </div>
      <p className="text-muted-foreground leading-relaxed">{content}</p>
    </section>
  );
}
