import { Users } from 'lucide-react';

interface PseoAudienceCalloutProps {
  content: string;
  heading?: string;
}

export function PseoAudienceCallout({ content, heading }: PseoAudienceCalloutProps) {
  if (!content) return null;

  return (
    <section className="rounded-lg border-l-4 border-l-primary bg-primary/5 p-6">
      <div className="flex items-center gap-2 mb-3">
        <Users className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">{heading ?? 'Just for You'}</h2>
      </div>
      <p className="text-muted-foreground leading-relaxed">{content}</p>
    </section>
  );
}
