import type { HourlyEntry } from '@/features/weather/api/get-weather';
import { HourlyRow } from '@/features/weather/components/hourly-row';

type HourlyForecastTableProps = { hourly: HourlyEntry[]; timeZone: string };

export const HourlyForecastTable = ({
  hourly,
  timeZone,
}: HourlyForecastTableProps) => (
  <div className="bevel-in max-h-72 overflow-y-auto bg-white">
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-[#000080] text-left text-white">
        <tr>
          <th className="px-2 py-1">Hour</th>
          <th className="px-2 py-1">Sky</th>
          <th className="px-2 py-1 text-right">Temp</th>
          <th className="px-2 py-1 text-right">Rain</th>
        </tr>
      </thead>
      <tbody>
        {hourly.map((entry) => (
          <HourlyRow key={entry.time} entry={entry} timeZone={timeZone} />
        ))}
      </tbody>
    </table>
  </div>
);
