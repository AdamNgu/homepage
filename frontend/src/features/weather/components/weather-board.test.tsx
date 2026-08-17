import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WeatherResponse } from '@/features/weather/api/get-weather';
import { WeatherBoard } from '@/features/weather/components/weather-board';
import { renderWithProviders } from '@/testing/test-utils';

const weatherFixture: WeatherResponse = {
  locations: [
    {
      label: 'Brooklyn, NY 11201',
      isHome: true,
      timeZone: 'America/New_York',
      updatedAt: '2026-08-16T12:00:00.000Z',
      currentHumidity: 68,
      hourly: [
        {
          time: '2026-08-16T12:00:00-04:00',
          temperature: 84,
          precipChance: 15,
          iconCode: 'skc',
          isDaytime: true,
          shortForecast: 'Sunny',
        },
      ],
      today: {
        high: 84,
        low: 71,
        name: 'Today',
        shortForecast: 'Sunny',
      },
    },
  ],
};

describe('WeatherBoard', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(weatherFixture)),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders label, temperatures, humidity, and rain chance', async () => {
    renderWithProviders(<WeatherBoard />);

    expect(
      await screen.findByText('Brooklyn, NY 11201 (HOME)'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('84°F').length).toBeGreaterThan(0);
    expect(screen.getByText('71°F')).toBeInTheDocument();
    expect(screen.getByText(/Humidity: 68%/)).toBeInTheDocument();
    expect(screen.getByText('15%')).toBeInTheDocument();
  });

  it('shows the retro error panel when the API fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );

    renderWithProviders(<WeatherBoard />);

    expect(await screen.findByText(/ERROR 500/)).toBeInTheDocument();
  });
});
