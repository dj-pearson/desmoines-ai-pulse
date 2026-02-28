import { Helmet } from 'react-helmet-async';

interface TouristTripSchemaProps {
  name: string;
  description: string;
  url: string;
  itinerary?: { name: string; description: string }[];
}

export default function TouristTripSchema({ name, description, url, itinerary }: TouristTripSchemaProps) {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    name,
    description,
    url,
    touristType: 'Leisure',
    ...(itinerary && itinerary.length > 0 && {
      itinerary: {
        '@type': 'ItemList',
        itemListElement: itinerary.map((stop, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: stop.name,
          description: stop.description,
        })),
      },
    }),
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
}
