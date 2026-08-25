import { cva } from 'class-variance-authority';

import type { UiSize, UiTone, UiVariant } from '../../../types/ui.types';

export type FileUploadTone = UiTone;
// Variant applies to the default button trigger, which has no `soft` treatment.
export type FileUploadVariant = Exclude<UiVariant, 'soft'>;
export type FileUploadSize = UiSize;

/**
 * Per-tone accent classes for the dropzone's active (dragging) state. The idle
 * dropzone uses neutral `--ui-*` border-(length:--ui-border-width) tokens; while a drag is in progress the
 * tone accent takes over so the active state is conveyed by border-(length:--ui-border-width) weight and a
 * tinted fill, not colour alone.
 */
export const fileUploadDropzoneToneClasses = {
  neutral: 'border-(--ui-foreground) bg-(--ui-foreground)/8 text-(--ui-foreground)',
  red: 'border-tone-red bg-tone-red/10 text-tone-red',
  green: 'border-tone-green bg-tone-green/10 text-tone-green',
  amber: 'border-tone-amber bg-tone-amber/10 text-tone-amber',
  blue: 'border-tone-blue bg-tone-blue/10 text-tone-blue',
  purple: 'border-tone-purple bg-tone-purple/10 text-tone-purple',
  magenta: 'border-tone-magenta bg-tone-magenta/10 text-tone-magenta',
} satisfies Record<FileUploadTone, string>;

/**
 * Layout for the drag-and-drop zone. `size` scales padding/text, `fullWidth`
 * controls inline fill, and `state` switches the static border-(length:--ui-border-width) treatment for
 * idle / active-drag / invalid (also signalled via ARIA, never colour alone).
 */
export const fileUploadDropzoneLayout = cva(
  'flex flex-col items-center justify-center gap-2 rounded-(--ui-radius-lg) border-(length:--ui-border-width) border-dashed text-center transition-[border-color,background-color] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ui-focus-ring)',
  {
    variants: {
      size: {
        xsmall: 'px-3 py-4 text-2xs',
        small: 'px-4 py-5 text-xs',
        medium: 'px-6 py-8 text-sm',
        large: 'px-8 py-10 text-base',
        xlarge: 'px-10 py-12 text-base',
      },
      fullWidth: { true: 'w-full' },
      state: {
        idle: 'border-(--ui-border-strong) bg-(--ui-background) text-(--ui-text-subtle) hover:border-(--ui-border-hover)',
        active: '',
        invalid: 'border-tone-red bg-tone-red/5 text-(--ui-text-subtle)',
        disabled: 'border-(--ui-border) bg-(--ui-background) text-(--ui-text-subtle)',
      },
    },
    defaultVariants: { size: 'medium', fullWidth: false, state: 'idle' },
  },
);

/** Wrapper layout for the trigger-only (non-dropzone) mode. */
export const fileUploadRootLayout = cva('flex flex-col gap-2', {
  variants: {
    fullWidth: { true: 'w-full' },
  },
  defaultVariants: { fullWidth: false },
});
