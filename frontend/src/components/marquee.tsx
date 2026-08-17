type MarqueeProps = { text: string };

// The <marquee> tag is long gone; a CSS animation stands in for it.
export const Marquee = ({ text }: MarqueeProps) => (
  <div className="bevel-in overflow-hidden bg-black py-1" role="presentation">
    <div className="motion-safe:animate-marquee inline-block pl-[100%] whitespace-nowrap font-retro-mono text-sm font-bold text-lime-400">
      {text}
    </div>
  </div>
);
