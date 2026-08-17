type MarqueeProps = { text: string };

// The <marquee> tag is long gone; a CSS animation stands in for it.
export const Marquee = ({ text }: MarqueeProps) => (
  <div className="bevel-in overflow-hidden bg-black py-1" role="presentation">
    {/* pl-[100%] only alongside the animation: with reduced motion the text
        must stay in view as a static banner. */}
    <div className="motion-safe:animate-marquee motion-safe:pl-[100%] inline-block px-2 whitespace-nowrap font-retro-mono text-sm font-bold text-lime-400">
      {text}
    </div>
  </div>
);
