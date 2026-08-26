export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export const avatarBaseClass = 'ui-avatar relative inline-flex shrink-0';

export const avatarSizeClasses = {
  xs: 'size-7 text-2xs',
  sm: 'size-9 text-xs',
  md: 'size-12 text-base',
  lg: 'size-16 text-xl',
  xl: 'size-24 text-3xl',
} satisfies Record<AvatarSize, string>;

export const avatarInitialsClass =
  'font-display flex size-full items-center justify-center overflow-hidden rounded-full border-(length:--ui-border-width) border-(--ui-border) bg-(--ui-input-background) font-black uppercase text-(--ui-foreground)';

export const avatarRingClass =
  'ring-2 ring-(--ui-accent) ring-offset-2 ring-offset-(--ui-background)';
