import type { ReactNode } from 'react';

type RetroPanelProps = {
  title: string;
  children: ReactNode;
};

export const RetroPanel = ({ title, children }: RetroPanelProps) => (
  <section className="bevel-out bg-[#c0c0c0]">
    <h2 className="bg-gradient-to-r from-blue-900 to-blue-500 px-2 py-1 text-sm font-bold text-white">
      {title}
    </h2>
    <div className="p-2">{children}</div>
  </section>
);
