/**
 * Build a Google Maps *directions* URL to a place. Uses exact coordinates when
 * available (most precise), falling back to address/name text only when
 * coordinates are missing.
 */
export function getDirectionsUrl(opts: {
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
}): string {
  const { latitude, longitude, address } = opts;
  const destination =
    latitude != null && longitude != null
      ? `${latitude},${longitude}`
      : encodeURIComponent(address ?? '');
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}
