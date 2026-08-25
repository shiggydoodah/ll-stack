const focusableSelector = 'input, textarea, select, button, [tabindex]:not([tabindex="-1"])';

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
