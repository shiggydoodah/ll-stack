import { useCallback } from 'react';

import { useFormBusyContext } from './FormBusyProvider';

export type UseFormTaskResult = {
  busyCount: number;
  isBusy: boolean;
  runTask: <T>(promise: Promise<T>) => Promise<T>;
};

export const useFormTask = (): UseFormTaskResult => {
  const { busyCount, decrementBusyCount, incrementBusyCount, isBusy } = useFormBusyContext();

  const runTask = useCallback(
    async <T>(promise: Promise<T>): Promise<T> => {
      incrementBusyCount();

      try {
        return await promise;
      } finally {
        decrementBusyCount();
      }
    },
    [decrementBusyCount, incrementBusyCount],
  );

  return {
    busyCount,
    isBusy,
    runTask,
  };
};
