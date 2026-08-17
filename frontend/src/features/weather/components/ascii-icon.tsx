import { asciiArtFor } from '@/features/weather/ascii-icons';

type AsciiIconProps = {
  iconCode: string;
  isDaytime: boolean;
  shortForecast: string;
};

export const AsciiIcon = ({
  iconCode,
  isDaytime,
  shortForecast,
}: AsciiIconProps) => (
  <pre
    aria-label={shortForecast}
    className="font-retro-mono text-xs leading-3 font-bold"
  >
    {asciiArtFor(iconCode, isDaytime, shortForecast)}
  </pre>
);
