import path from 'node:path';

// Dependency-free env parsing: six flat vars don't justify a schema library.
// Revisit (e.g. Zod) once env needs unions, refinement, or grows past a screen.
// Set-but-empty vars (Environment=PORT= in a unit file) count as missing.
const read = (name: string): string | undefined => {
  const raw = process.env[name];
  return raw === undefined || raw.trim() === '' ? undefined : raw;
};

const str = (name: string, fallback?: string): string => {
  const value = read(name) ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
};

const num = (name: string, fallback?: number): number => {
  const raw = read(name);
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

const staticDirRaw = read('STATIC_DIR');

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
  // Absolute path required by res.sendFile; resolve once here.
  staticDir: staticDirRaw === undefined ? undefined : path.resolve(staticDirRaw),
};
