import type { HourlyEntry } from '@/features/weather/api/get-weather';
import { asciiGlyphFor } from '@/features/weather/ascii-icons';

type HourlyRowProps = { entry: HourlyEntry; timeZone: string };

const formatHour = (iso: string, timeZone: string): string =>
  new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    timeZone,
  });

export const HourlyRow = ({ entry, timeZone }: HourlyRowProps) => (
  <tr className="odd:bg-[#d4d0c8]" title={entry.shortForecast}>
    <td className="px-2 py-0.5">{formatHour(entry.time, timeZone)}</td>
    <td className="px-2 py-0.5 font-retro-mono font-bold">
      <span aria-hidden="true">
        {asciiGlyphFor(entry.iconCode, entry.shortForecast)}
      </span>
      <span className="sr-only">{entry.shortForecast}</span>
    </td>
    <td className="px-2 py-0.5 text-right font-bold">{entry.temperature}°F</td>
    <td className="px-2 py-0.5 text-right text-blue-800">
      {entry.precipChance}%
    </td>
  </tr>
);
