import { MapPin } from 'lucide-react';

interface PseoNeighborhoodProfileProps {
  content: string;
  heading?: string;
}

export function PseoNeighborhoodProfile({ content, heading }: PseoNeighborhoodProfileProps) {
  if (!content) return null;

  return (
    <section className="rounded-lg border p-6 bg-card">
      <div className="flex items-center gap-2 mb-3">
        <MapPin className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">{heading ?? 'About This Neighborhood'}</h2>
      </div>
      <p className="text-muted-foreground leading-relaxed">{content}</p>
    </section>
  );
}
