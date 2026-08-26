import type { UiSize, UiTone } from '../../../types/ui.types';
import type { IconSize } from '../icon';

export type ListItemIconTone = UiTone;
export type ListItemIconSize = Exclude<UiSize, 'xsmall' | 'xlarge'>;

export const listRootBaseClass = 'm-0 flex list-none flex-col gap-2 p-0';

export const listItemBaseClass = 'flex items-center gap-2 text-sm text-(--ui-foreground)';

export const listItemIconBaseClass =
  'inline-flex shrink-0 items-center justify-center rounded-full';

/** Icon colour + soft tint applied when no `tone` is provided (brand accent). */
export const listItemIconAccentClass = 'text-(--ui-accent) bg-(--ui-accent)/10';

/** Icon colour + soft `/10` tinted background per tone (matches the Badge soft idiom). */
export const listItemIconToneClasses = {
  neutral: 'text-(--ui-foreground) bg-(--ui-foreground)/10',
  red: 'text-tone-red bg-tone-red/10',
  green: 'text-tone-green bg-tone-green/10',
  amber: 'text-tone-amber bg-tone-amber/10',
  blue: 'text-tone-blue bg-tone-blue/10',
  purple: 'text-tone-purple bg-tone-purple/10',
  magenta: 'text-tone-magenta bg-tone-magenta/10',
} satisfies Record<ListItemIconTone, string>;

/** Chip box size per `size` (`medium` aligns with the `text-sm` item text). */
export const listItemIconSizeClasses = {
  small: 'size-5',
  medium: 'size-6',
  large: 'size-8',
} satisfies Record<ListItemIconSize, string>;

/** Inner Lucide icon size per `size`, mapped onto the shared `Icon` size scale. */
export const listItemIconInnerSize = {
  small: 'xs',
  medium: 'sm',
  large: 'md',
} satisfies Record<ListItemIconSize, IconSize>;
