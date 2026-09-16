import type { LngLatBoundsLike, LngLatLike } from "maplibre-gl";

// Loose bounding box around Kazakhstan (with padding), used to keep the
// map focused on the country. MapLibre uses [lng, lat] order.
export const KAZAKHSTAN_BOUNDS: LngLatBoundsLike = [
  [44, 38], // southwest
  [90, 58], // northeast
];

export const KAZAKHSTAN_CENTER: LngLatLike = [66.9237, 48.0196];

export const KAZAKHSTAN_DEFAULT_ZOOM = 4.5;

export const KAZAKHSTAN_FOUND_ZOOM = 16;
