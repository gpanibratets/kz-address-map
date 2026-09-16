export interface Coordinates {
  lat: number;
  lng: number;
}

interface NominatimResult {
  lat: string;
  lon: string;
}

/**
 * Geocodes a free-form address via OpenStreetMap's Nominatim, restricted to
 * Kazakhstan. Nominatim's public instance is free but rate-limited (~1
 * request/sec) and meant for light use - fine for a single lookup per user
 * action, not for bulk/автocomplete-on-every-keystroke traffic.
 */
export async function geocodeAddress(
  query: string,
  signal?: AbortSignal,
): Promise<Coordinates | null> {
  const params = new URLSearchParams({
    format: "json",
    q: query,
    countrycodes: "kz",
    limit: "1",
  });

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    { headers: { Accept: "application/json" }, signal },
  );

  if (!response.ok) {
    throw new Error("Не удалось найти адрес. Попробуйте ещё раз.");
  }

  const results = (await response.json()) as NominatimResult[];
  const first = results[0];
  if (!first) return null;

  return { lat: parseFloat(first.lat), lng: parseFloat(first.lon) };
}
