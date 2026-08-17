type HumidityBadgeProps = { humidity: number };

export const HumidityBadge = ({ humidity }: HumidityBadgeProps) => (
  <p className="font-retro-mono text-sm font-bold">
    [ Humidity: {humidity}% ]
  </p>
);
