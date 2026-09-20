import { Users } from 'lucide-react';

interface PseoAudienceCalloutProps {
  content: string;
  heading?: string;
}

export function PseoAudienceCallout({ content, heading }: PseoAudienceCalloutProps) {
  if (!content) return null;

  // WEB-UX-034: was `rounded-lg border-l-4 border-l-primary`. CLAUDE.md calls a
  // thick coloured border on one side of a card the single most recognizable
  // tell, and the detector agrees - it also clashes with the rounded corner it
  // sits on. The tinted surface already separates this block from the prose
  // around it, on every pSEO page, so the bar was doing nothing the background
  // was not.
  return (
    <section className="rounded-lg bg-primary/5 p-6">
      <div className="flex items-center gap-2 mb-3">
        <Users className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">{heading ?? 'Just for You'}</h2>
      </div>
      <p className="text-muted-foreground leading-relaxed">{content}</p>
    </section>
  );
}
