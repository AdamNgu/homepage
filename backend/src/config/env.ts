// Dependency-free env parsing: six flat vars don't justify a schema library.
// Revisit (e.g. Zod) once env needs unions, refinement, or grows past a screen.
const str = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
};

const num = (name: string, fallback?: number): number => {
  const raw = process.env[name];
  if (raw === undefined) {
    if (fallback === undefined) {
      throw new Error(`Missing required env var ${name}`);
    }
    return fallback;
  }
  const value = Number(raw);
  if (Number.isNaN(value)) {
    throw new Error(`Env var ${name} must be a number, got "${raw}"`);
  }
  return value;
};

export const env = {
  port: num('PORT', 3000),
  redisUrl: str('REDIS_URL', 'redis://localhost:6379'),
  homeLat: num('HOME_LAT', 40.6936),
  homeLon: num('HOME_LON', -73.9902),
  homeLabel: str('HOME_LABEL', 'Brooklyn, NY 11201'),
  weatherUserAgent: str(
    'WEATHER_USER_AGENT',
    '(homepage, adamtnguyen@icloud.com)',
  ),
  staticDir: process.env['STATIC_DIR'],
};
