import { Marquee } from '@/components/marquee';
import { SiteHeader } from '@/components/site-header';
import { UnderConstruction } from '@/components/under-construction';
import { VisitorCounter } from '@/components/visitor-counter';
import { WeatherBoard } from '@/features/weather/components/weather-board';

export const HomeRoute = () => (
  <div className="mx-auto w-[1280px] max-w-full px-4 pb-8">
    <SiteHeader />
    <Marquee text="+++ WELCOME HOME +++ your weather, fresh off the wire +++ more channels coming soon +++ dial-up users: please allow 30 seconds +++" />
    <div className="mt-4 flex flex-col gap-4 md:flex-row">
      <main className="md:flex-[2]">
        <WeatherBoard />
      </main>
      <aside className="flex flex-col gap-4 md:flex-1">
        <UnderConstruction title="NEWS" />
        <UnderConstruction title="LINKS" />
        <VisitorCounter />
      </aside>
    </div>
    <footer className="mt-6 text-center font-retro-mono text-xs">
      Best viewed at 1024x768 in Netscape Navigator 4.0 · (c) 2026
    </footer>
  </div>
);
