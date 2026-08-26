export type RadioCardIndicator = 'radio' | 'checkbox';

export const radioCardBaseClass =
  'group relative flex w-full cursor-pointer items-start gap-3.5 rounded-(--ui-radius-lg) border-(length:--ui-border-width) p-4 text-left transition duration-(--ui-motion-fast) ease-(--ui-ease) disabled:cursor-not-allowed disabled:opacity-60';

export const radioCardSelectedClass =
  'border-(--ui-accent) bg-(--ui-accent)/10 ring-2 ring-(--ui-accent)/20';

export const radioCardUnselectedClass =
  'border-(--ui-border-strong) bg-(--ui-input-background) hover:border-(--ui-border-hover)';

export const radioCardIndicatorBaseClass =
  'mt-0.5 flex size-5 shrink-0 items-center justify-center border-(length:--ui-border-width) transition';

export const radioCardIndicatorShapeClasses = {
  radio: 'rounded-full',
  checkbox: 'rounded-(--ui-radius-sm)',
} satisfies Record<RadioCardIndicator, string>;

export const radioCardIndicatorSelectedClass =
  'border-(--ui-accent) bg-(--ui-accent) text-(--ui-accent-contrast)';

export const radioCardIndicatorUnselectedClass = 'border-(--ui-border-strong) bg-transparent';
