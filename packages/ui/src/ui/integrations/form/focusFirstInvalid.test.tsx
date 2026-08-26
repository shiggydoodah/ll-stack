// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { focusFirstInvalid } from './index';
import { requireElement } from './test-utils';

describe('focusFirstInvalid', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('focuses the matched focusable element', () => {
    const form = document.createElement('form');
    form.innerHTML = '<input name="email" aria-invalid="true" />';
    document.body.append(form);
    const input = requireElement(form.querySelector<HTMLInputElement>('input'), 'input');

    focusFirstInvalid(form);

    expect(document.activeElement).toBe(input);
  });

  it('focuses the first focusable descendant when the invalid element is a wrapper', () => {
    const form = document.createElement('form');
    form.innerHTML =
      '<div aria-invalid="true"><span>Invalid field</span><button type="button">Fix</button></div>';
    document.body.append(form);
    const button = requireElement(form.querySelector<HTMLButtonElement>('button'), 'button');

    focusFirstInvalid(form);

    expect(document.activeElement).toBe(button);
  });

  it('skips disabled descendants when the invalid element is a wrapper', () => {
    const form = document.createElement('form');
    form.innerHTML =
      '<div aria-invalid="true">' +
      '<button type="button" value="small" disabled>Small</button>' +
      '<button type="button" value="large">Large</button>' +
      '</div>';
    document.body.append(form);
    const enabled = requireElement(
      form.querySelector<HTMLButtonElement>('button[value="large"]'),
      'enabled button',
    );

    focusFirstInvalid(form);

    expect(document.activeElement).toBe(enabled);
  });

  it('does nothing when no invalid element exists', () => {
    const before = document.activeElement;
    const form = document.createElement('form');
    form.innerHTML = '<input name="email" />';
    document.body.append(form);

    focusFirstInvalid(form);

    expect(document.activeElement).toBe(before);
  });
});
