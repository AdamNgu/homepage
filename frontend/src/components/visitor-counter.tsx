// Every 90s homepage had one. Ours is honest about being decorative.
const VISITOR_COUNT = '00133742';

export const VisitorCounter = () => (
  <div className="bevel-out bg-[#c0c0c0] p-2 text-center">
    <p className="text-sm font-bold">You are visitor number</p>
    <p className="bevel-in mx-auto mt-1 inline-block bg-black px-2 py-1 font-retro-mono text-xl font-bold tracking-widest text-lime-400">
      {VISITOR_COUNT}
    </p>
  </div>
);
