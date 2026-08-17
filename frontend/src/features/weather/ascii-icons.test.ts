import { describe, expect, it } from 'vitest';

import { asciiArtFor, asciiGlyphFor } from './ascii-icons';

describe('asciiArtFor', () => {
  it('returns dedicated art for a known slug', () => {
    expect(asciiArtFor('rain_showers', true, 'Chance Rain Showers')).toContain(
      "'",
    );
  });

  it('uses the night override for clear skies', () => {
    const day = asciiArtFor('skc', true, 'Sunny');
    const night = asciiArtFor('skc', false, 'Clear');
    expect(night).not.toEqual(day);
  });

  it('strips the wind_ prefix', () => {
    expect(asciiArtFor('wind_skc', true, 'Sunny and Breezy')).toEqual(
      asciiArtFor('skc', true, 'Sunny'),
    );
  });

  it('falls back to shortForecast keywords for unknown slugs', () => {
    expect(asciiArtFor('mystery', true, 'Slight Chance Snow')).toEqual(
      asciiArtFor('snow', true, ''),
    );
  });

  it('returns placeholder art when nothing matches', () => {
    expect(asciiArtFor('mystery', true, 'Vibes')).toContain('?');
  });
});

describe('asciiGlyphFor', () => {
  it('maps known slugs and falls back to (?)', () => {
    expect(asciiGlyphFor('snow', 'Snow')).toBe('****');
    expect(asciiGlyphFor('mystery', 'Vibes')).toBe('(?)');
  });
});
