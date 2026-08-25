/**
 * Single source of truth for the display-cased label treatment (case/tracking ride the --ui-display-* tokens).
 *
 * Consumed by {@link FieldLabel} (the field-context-bound `<label>`),
 * {@link FieldGroupLabel} (the standalone group heading), and the inline label
 * `<span>` of the bound group fields (`CheckboxButtonGroupField`,
 * `ChipSelectField`) so the class string lives in exactly one place.
 */
export const fieldLabelBaseClass =
  'text-xs flex items-center gap-1 font-(family-name:--ui-font-display) ui-display-text font-bold text-(--ui-text-subtle)';
