export type CardTone = 'default' | 'danger';

export const cardBaseClass =
  'ui-card rounded-(--ui-radius-lg) border-(length:--ui-border-width) bg-(--ui-input-background)';

export const cardToneClasses = {
  default: 'border-(--ui-border)',
  danger: 'border-tone-red',
} satisfies Record<CardTone, string>;
