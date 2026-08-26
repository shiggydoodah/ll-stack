import 'server-only';

export const isDevModeEnabled = (): boolean => {
  return process.env.NODE_ENV === 'development' && process.env.DEV_MODE === 'true';
};
