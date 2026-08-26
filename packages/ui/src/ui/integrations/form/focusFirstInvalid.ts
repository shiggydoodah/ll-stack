/**
 * Disabled controls are excluded: a group wrapper carries `aria-invalid`, so the
 * fallback below walks into it and would otherwise land on a disabled option that
 * cannot take focus (e.g. the first radio in a `RadioButtonGroupField`).
 */
const focusableSelector = [
  'input:not(:disabled)',
  'textarea:not(:disabled)',
  'select:not(:disabled)',
  'button:not(:disabled)',
  '[tabindex]:not([tabindex="-1"]):not([aria-disabled="true"])',
].join(', ');

const getFocusableTarget = (element: HTMLElement) => {
  if (element.matches(focusableSelector)) {
    return element;
  }

  return element.querySelector<HTMLElement>(focusableSelector);
};

export const focusFirstInvalid = (formEl: HTMLFormElement | null): void => {
  const invalidElement = formEl?.querySelector<HTMLElement>('[aria-invalid="true"]');
  const focusableElement = invalidElement ? getFocusableTarget(invalidElement) : null;

  focusableElement?.focus();
};
