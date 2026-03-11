import { Lightbulb } from 'lucide-react';

interface PseoLocalTipsProps {
  heading: string;
  tips: string[];
}

export function PseoLocalTips({ heading, tips }: PseoLocalTipsProps) {
  if (!tips.length) return null;

  return (
    <section>
      <h2 className="text-2xl font-bold mb-4">{heading}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {tips.map((tip, index) => (
          <div
            key={index}
            className="flex items-start gap-3 rounded-lg border p-4 bg-card"
          >
            <Lightbulb className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <p className="text-sm">{tip}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
