import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type FormBusyContextValue = {
  busyCount: number;
  decrementBusyCount: () => void;
  incrementBusyCount: () => void;
  isBusy: boolean;
};

export const FormBusyContext = createContext<FormBusyContextValue | null>(null);

export interface FormBusyProviderProps {
  children: ReactNode;
}

export const FormBusyProvider = ({ children }: FormBusyProviderProps) => {
  const [busyCount, setBusyCount] = useState(0);

  const incrementBusyCount = useCallback(() => {
    setBusyCount((count) => count + 1);
  }, []);

  const decrementBusyCount = useCallback(() => {
    setBusyCount((count) => Math.max(0, count - 1));
  }, []);

  const value = useMemo<FormBusyContextValue>(
    () => ({
      busyCount,
      decrementBusyCount,
      incrementBusyCount,
      isBusy: busyCount > 0,
    }),
    [busyCount, decrementBusyCount, incrementBusyCount],
  );

  return <FormBusyContext.Provider value={value}>{children}</FormBusyContext.Provider>;
};

export const useFormBusyContext = () => {
  const context = useContext(FormBusyContext);

  if (context === null) {
    throw new Error('useFormBusyContext must be used within a FormBusyProvider.');
  }

  return context;
};
