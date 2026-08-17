import type { LocationWeather } from '@/features/weather/api/get-weather';
import { AsciiIcon } from '@/features/weather/components/ascii-icon';
import { DailySummary } from '@/features/weather/components/daily-summary';
import { HourlyForecastTable } from '@/features/weather/components/hourly-forecast-table';
import { HumidityBadge } from '@/features/weather/components/humidity-badge';
import { RetroPanel } from '@/components/retro-panel';

type LocationCardProps = { location: LocationWeather };

export const LocationCard = ({ location }: LocationCardProps) => {
  const current = location.hourly[0];
  return (
    <RetroPanel
      title={`${location.label}${location.isHome ? ' (HOME)' : ''}`}
    >
      <div className="flex items-center gap-4">
        {current !== undefined && (
          <AsciiIcon
            iconCode={current.iconCode}
            isDaytime={current.isDaytime}
            shortForecast={current.shortForecast}
          />
        )}
        <div>
          <DailySummary summary={location.today} />
          <HumidityBadge humidity={location.currentHumidity} />
        </div>
      </div>
      <div className="mt-2">
        <HourlyForecastTable
          hourly={location.hourly}
          timeZone={location.timeZone}
        />
      </div>
    </RetroPanel>
  );
};
