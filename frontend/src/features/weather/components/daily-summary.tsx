import type { DailySummary as DailySummaryData } from '@/features/weather/api/get-weather';

type DailySummaryProps = { summary: DailySummaryData };

const formatTemp = (value: number | null): string =>
  value === null ? 'n/a' : `${value}°F`;

export const DailySummary = ({ summary }: DailySummaryProps) => (
  <p className="text-lg">
    <strong>{summary.name}:</strong> {summary.shortForecast}
    <br />
    High: <strong className="text-red-700">{formatTemp(summary.high)}</strong>
    {' / '}
    Low: <strong className="text-blue-800">{formatTemp(summary.low)}</strong>
  </p>
);
