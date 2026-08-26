export const inputBaseClass = [
  'w-full appearance-none rounded-(--ui-radius-lg) border-(length:--ui-border-width) border-(--ui-border-strong)',
  'bg-(--ui-input-background) px-4 py-3',
  'font-(family-name:--ui-font-body) text-sm text-(--ui-text-body)',
  'outline-none transition-[border-color,background-color,color]',
  'placeholder:text-(--ui-text-muted)',
  'hover:border-(--ui-border-hover)',
  'focus:bg-(--ui-input-background-focus)',
  'focus-visible:border-(--ui-focus-ring)',
  'ui-field',
  'disabled:cursor-not-allowed disabled:opacity-60',
  'aria-invalid:border-(--ui-border-invalid) aria-invalid:bg-(--ui-input-background-invalid)',
].join(' ');
