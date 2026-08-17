import { useWeather } from '@/features/weather/api/get-weather';
import { LocationCard } from '@/features/weather/components/location-card';

export const WeatherBoard = () => {
  const { data, isPending, isError } = useWeather();

  if (isPending) {
    return (
      <p className="bevel-out bg-[#c0c0c0] p-4 font-retro-mono font-bold">
        Dialing up weather... ░░▒▒▓▓
      </p>
    );
  }

  if (isError) {
    return (
      <p className="bevel-in bg-[#c0c0c0] p-4 font-retro-mono font-bold text-red-700">
        *** ERROR 500: weather modem is busy — try again later ***
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {data.locations.map((location) => (
        <LocationCard key={location.label} location={location} />
      ))}
    </div>
  );
};
