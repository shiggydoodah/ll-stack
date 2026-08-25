'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { Button } from '@repo/ui/primitives';
import { cn } from '@repo/ui';

type ModePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'll-mode';
const CYCLE: Record<ModePreference, ModePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};
const LABELS: Record<ModePreference, string> = {
  system: 'Auto',
  light: 'Light',
  dark: 'Dark',
};

// Module-level store over localStorage so useSyncExternalStore drives the
// component instead of a setState-in-effect (react-hooks/set-state-in-effect).
const listeners = new Set<() => void>();

const subscribeToMode = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const readStoredPreference = (): ModePreference => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
};

// The pre-hydration server snapshot; the stored preference is applied on the
// client immediately after. The page first paints in light mode — an accepted
// flash for these example pages, traded for keeping the static shell free of
// per-request inline scripts (see the CSP notes in proxy.ts).
const getServerPreference = (): ModePreference => 'system';

const applyMode = (preference: ModePreference): void => {
  const root = document.documentElement;
  const dark =
    preference === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : preference === 'dark';
  root.dataset['mode'] = dark ? 'dark' : 'light';
};

const storePreference = (next: ModePreference): void => {
  try {
    if (next === 'system') {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  } catch {
    // Private-mode storage failures only lose persistence, not the toggle.
  }
  for (const listener of listeners) listener();
};

/**
 * Cycles the colour mode System → Light → Dark by stamping `data-mode` on
 * `<html>` (the ll-ui themes scope their dark values to it) and persisting the
 * choice in localStorage.
 */
const ModeToggle = ({ className }: { className?: string }) => {
  const preference = useSyncExternalStore(
    subscribeToMode,
    readStoredPreference,
    getServerPreference,
  );

  // Sync the external system (the <html> data-mode attribute) with the current
  // preference, and track OS scheme changes while in system mode.
  useEffect(() => {
    applyMode(preference);
    if (preference !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyMode('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  const cycle = useCallback(() => {
    storePreference(CYCLE[readStoredPreference()]);
  }, []);

  return (
    <Button
      type="button"
      variant="outline"
      tone="neutral"
      size="xsmall"
      onClick={cycle}
      title="Colour mode"
      className={cn('text-2xs font-mono font-bold tracking-widest uppercase', className)}
    >
      {LABELS[preference]}
    </Button>
  );
};

export default ModeToggle;
