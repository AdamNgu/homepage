import { RetroPanel } from '@/components/retro-panel';

type UnderConstructionProps = { title: string };

export const UnderConstruction = ({ title }: UnderConstructionProps) => (
  <RetroPanel title={title}>
    <div className="h-3 bg-[repeating-linear-gradient(45deg,#000_0_10px,#fde047_10px_20px)]" />
    <p className="py-3 text-center font-retro-mono text-sm font-bold">
      /!\ UNDER CONSTRUCTION /!\
    </p>
    <div className="h-3 bg-[repeating-linear-gradient(45deg,#000_0_10px,#fde047_10px_20px)]" />
  </RetroPanel>
);
