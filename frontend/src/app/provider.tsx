import { useState, type ReactNode } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';

import { createQueryClient } from '@/lib/react-query';

type AppProviderProps = { children: ReactNode };

export const AppProvider = ({ children }: AppProviderProps) => {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};
