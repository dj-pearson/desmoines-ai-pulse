import { Link } from 'react-router-dom';
import type { OutdoorsTopic } from '@/data/outdoorsGuide';

interface OutdoorsTopicSectionProps {
  topic: OutdoorsTopic;
}

/**
 * One activity answer on /outdoors - dog parks, disc golf, paddling, fishing,
 * camping, waterfalls, scenic drives, state parks, winter (SEO-024).
 *
 * Each maps to a row in docs/seo/keyword-research/keyword-opportunities.csv.
 * They are plain prose because the query behind each one is a question, and a
 * question is answered in sentences.
 */
export default function OutdoorsTopicSection({ topic }: OutdoorsTopicSectionProps) {
  return (
    <section id={topic.id} className="scroll-mt-24">
      <h3 className="text-xl font-semibold mb-3">{topic.heading}</h3>
      <div className="max-w-[70ch] space-y-4 leading-relaxed text-muted-foreground">
        {topic.body.map((paragraph) => (
          <p key={paragraph.slice(0, 40)}>{paragraph}</p>
        ))}
      </div>
      {topic.links && topic.links.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
          {topic.links.map((link) => (
            <li key={link.to}>
              <Link to={link.to} className="text-primary underline underline-offset-4">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
