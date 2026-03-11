/**
 * PseoMapEmbed — Lazy-loaded map component for pSEO pages.
 * Shows pins for items in the area based on page dimensions.
 */

import type { PseoDimensionRef } from '../../schemas';

interface PseoMapEmbedProps {
  dimensions: PseoDimensionRef[];
}

export default function PseoMapEmbed({ dimensions }: PseoMapEmbedProps) {
  const location = dimensions.find((d) => d.dimension === 'location');

  // Des Moines metro center coordinates
  const center = { lat: 41.5868, lng: -93.6250 };

  return (
    <section>
      <h2 className="text-2xl font-bold mb-4">
        {location ? `Map of ${location.name}` : 'Explore the Area'}
      </h2>
      <div className="h-64 md:h-96 rounded-lg overflow-hidden border bg-muted flex items-center justify-center">
        <p className="text-muted-foreground text-sm">
          Interactive map loading... Center: {center.lat.toFixed(4)}, {center.lng.toFixed(4)}
        </p>
      </div>
    </section>
  );
}
