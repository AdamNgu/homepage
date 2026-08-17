// ASCII art keyed by weather.gov icon slugs (the segment after /land/day|night/
// in the icon URL). See https://api.weather.gov/icons for the full slug list.
const ICON_ART: Record<string, string> = {
  skc: String.raw`    \ | /
  -- ( ) --
    / | \ `,
  few: String.raw`   \ | /
 -- ( ) --
   / |.--.
    (    )`,
  sct: String.raw`   \ | /
 -- ( .--.
   /(    ).
    (___(__)`,
  bkn: String.raw`     .--.
  .-(    ).
 (___.__)__)
            `,
  ovc: String.raw`   .--..--.
 .(    (    ).
 (___(___(__)`,
  fog: String.raw` _ - _ - _ -
  _ - _ - _
 _ - _ - _ -`,
  rain: String.raw`     .--.
  .-(    ).
 (___(___(__)
  / / / / / `,
  rain_showers: String.raw`     .--.
  .-(    ).
 (___(___(__)
   ' ' ' '  `,
  rain_showers_hi: String.raw`     .--.
  .-(    ).
 (___(___(__)
   '  '  '  `,
  tsra: String.raw`     .--.
  .-(    ).
 (___(___(__)
   /_ /_ /_ `,
  tsra_sct: String.raw`     .--.
  .-(    ).
 (___(___(__)
   /_ ' /_  `,
  tsra_hi: String.raw`     .--.
  .-(    ).
 (___(___(__)
    /_  /_  `,
  snow: String.raw`     .--.
  .-(    ).
 (___(___(__)
  * * * * * `,
  sleet: String.raw`     .--.
  .-(    ).
 (___(___(__)
  ' * ' * ' `,
  wind: String.raw` ~ ~ ~ ~ ~
~ ~ ~ ~ ~ ~
 ~ ~ ~ ~ ~ `,
  hot: String.raw`    \ | /
  -- (!) --
    / | \ `,
  cold: String.raw`   * BRR *
  -- (~) --
   * BRR * `,
};

const NIGHT_ART_OVERRIDES: Record<string, string> = {
  skc: String.raw`    _.._
   /  . \
  |   ,  |  *
   \ __ /
  *        `,
  few: String.raw`    _.._
   /  . \  *
  |   , .--.
   \ _(    )`,
};

const UNKNOWN_ART = String.raw`  .-----.
  |  ?  |
  '-----'`;

// Compact single-line variants for table rows.
const ICON_GLYPH: Record<string, string> = {
  skc: String.raw`\o/`,
  few: String.raw`\o(`,
  sct: String.raw`o()`,
  bkn: '(__)',
  ovc: '(__)',
  fog: '===',
  rain: '////',
  rain_showers: ",,'",
  rain_showers_hi: ",,'",
  tsra: '/_/!',
  tsra_sct: '/_/!',
  tsra_hi: '/_/!',
  snow: '****',
  sleet: "*'*",
  wind: '~~~',
  hot: '(!)',
  cold: '(~)',
};

const UNKNOWN_GLYPH = '(?)';

const KEYWORD_FALLBACKS: [RegExp, string][] = [
  [/thunder|storm/i, 'tsra'],
  [/rain|shower|drizzle/i, 'rain_showers'],
  [/snow|flurr/i, 'snow'],
  [/sleet|ice|freezing/i, 'sleet'],
  [/fog|haze|smoke/i, 'fog'],
  [/cloud/i, 'bkn'],
  [/wind|breez/i, 'wind'],
  [/sun|clear/i, 'skc'],
];

// Lookup chain: exact slug → "wind_" prefix stripped → shortForecast keywords.
const resolveCode = (iconCode: string, shortForecast: string): string => {
  if (iconCode in ICON_ART) {
    return iconCode;
  }
  const unwinded = iconCode.replace(/^wind_/, '');
  if (unwinded in ICON_ART) {
    return unwinded;
  }
  return (
    KEYWORD_FALLBACKS.find(([pattern]) => pattern.test(shortForecast))?.[1] ??
    'unknown'
  );
};

export const asciiArtFor = (
  iconCode: string,
  isDaytime: boolean,
  shortForecast: string,
): string => {
  const code = resolveCode(iconCode, shortForecast);
  if (!isDaytime && code in NIGHT_ART_OVERRIDES) {
    return NIGHT_ART_OVERRIDES[code] ?? UNKNOWN_ART;
  }
  return ICON_ART[code] ?? UNKNOWN_ART;
};

export const asciiGlyphFor = (
  iconCode: string,
  shortForecast: string,
): string => ICON_GLYPH[resolveCode(iconCode, shortForecast)] ?? UNKNOWN_GLYPH;
