export type Coords = { lat: number; lon: number };

// Rectangle over the five boroughs' extreme points. Deliberately crude: this
// only decides "should the page also show NYC weather", not anything precise.
const NYC_BOUNDS = {
  minLat: 40.4774,
  maxLat: 40.9176,
  minLon: -74.2591,
  maxLon: -73.7004,
};

export const isInsideNyc = ({ lat, lon }: Coords): boolean =>
  lat >= NYC_BOUNDS.minLat &&
  lat <= NYC_BOUNDS.maxLat &&
  lon >= NYC_BOUNDS.minLon &&
  lon <= NYC_BOUNDS.maxLon;

export const NYC_FALLBACK = {
  lat: 40.7128,
  lon: -74.006,
  label: 'New York, NY',
};
