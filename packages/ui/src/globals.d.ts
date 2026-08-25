export {};

declare global {
  type UiSize = '3xl' | '2xl' | 'xl' | 'large' | 'medium' | 'small' | 'xs' | '2xs';

  type UiFontSize = Exclude<UiSize, '3xl'> | 'default';

  /**
   * @description Semantic colors for typography.
   * @param primary: var(--ui-foreground)
   * @param secondary: var(--ui-text-subtle)
   * @param tertiary: var(--ui-text-muted)
   */
  type UiFontColor = 'primary' | 'secondary' | 'tertiary';

  type UiTone =
    | 'neutral'
    | 'red'
    | 'red-dark'
    | 'green'
    | 'green-dark'
    | 'amber'
    | 'amber-dark'
    | 'blue'
    | 'blue-dark'
    | 'teal'
    | 'teal-dark'
    | 'purple'
    | 'purple-dark'
    | 'magenta'
    | 'magenta-dark'
    | 'slate'
    | 'slate-dark'
    | 'black'
    | 'white';

  type UiUtilityTone = 'danger' | 'success' | 'warning' | 'info' | 'disabled';
}
