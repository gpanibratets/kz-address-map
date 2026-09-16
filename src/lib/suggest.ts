import type { Coordinates } from "./geocode";

export interface AddressSuggestion {
  id: string;
  label: string;
  city?: string;
  district?: string;
  street?: string;
  house?: string;
  /** Only set for precise, house-level matches - safe to drop a pin on directly. */
  coordinates?: Coordinates;
}

interface PhotonProperties {
  name?: string;
  type?: string;
  street?: string;
  housenumber?: string;
  city?: string;
  district?: string;
  county?: string;
  state?: string;
  osm_type?: string;
  osm_id?: number;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: PhotonProperties;
}

interface PhotonResponse {
  features: PhotonFeature[];
}

function uniqueJoin(parts: Array<string | undefined>): string {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of parts) {
    if (part && !seen.has(part)) {
      seen.add(part);
      result.push(part);
    }
  }
  return result.join(", ");
}

// Photon only puts the street name under `street` for house-level hits; a
// street-level hit is itself the street, so its name lives under `name`.
function resolveStreetName(props: PhotonProperties): string | undefined {
  return props.street ?? (props.type === "street" ? props.name : undefined);
}

function buildLabel(props: PhotonProperties): string {
  if (props.type === "house") {
    const streetPart = uniqueJoin([props.street, props.housenumber]).replace(
      ", ",
      " ",
    );
    return uniqueJoin([streetPart, props.city]);
  }

  if (props.type === "street") {
    return uniqueJoin([props.name, props.city]);
  }

  return uniqueJoin([props.name, props.district ?? props.county, props.state]);
}

/**
 * Suggests Kazakhstan addresses as the user types, via Photon
 * (https://photon.komoot.io) - a free, key-less geocoder built by komoot
 * specifically for autocomplete/typeahead use, unlike Nominatim's plain
 * search. The public demo instance is meant for light/moderate traffic;
 * self-host Photon for serious production volume.
 */
export async function suggestAddress(
  query: string,
  options: { layers?: string[]; signal?: AbortSignal } = {},
): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const params = new URLSearchParams({ q: trimmed, limit: "6" });
  params.append("countrycode", "kz");
  for (const layer of options.layers ?? []) {
    params.append("layer", layer);
  }

  const response = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, {
    headers: { Accept: "application/json" },
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error("Не удалось получить подсказки адреса.");
  }

  const data = (await response.json()) as PhotonResponse;

  return data.features
    .map((feature, index): AddressSuggestion | null => {
      const props = feature.properties;
      const label = buildLabel(props);
      if (!label) return null;

      const [lng, lat] = feature.geometry.coordinates;

      return {
        id: `${props.osm_type ?? "f"}-${props.osm_id ?? index}`,
        label,
        city: props.city,
        district: props.district ?? props.county,
        street: resolveStreetName(props),
        house: props.housenumber,
        coordinates: props.housenumber ? { lat, lng } : undefined,
      };
    })
    .filter((suggestion): suggestion is AddressSuggestion => suggestion !== null);
}
