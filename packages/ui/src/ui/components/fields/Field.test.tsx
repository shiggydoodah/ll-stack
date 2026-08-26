// @vitest-environment jsdom

import { Fragment, type ReactElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  Field,
  FieldControl,
  FieldContextProvider,
  FieldError,
  FieldGroupLabel,
  FieldHint,
  FieldLabel,
  FieldRequiredIndicator,
  useFieldContext,
  type FieldContextValue,
} from './index';
import { hasRenderableChildren } from './renderableChildren';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const roots: ReturnType<typeof createRoot>[] = [];

afterEach(() => {
  act(() => {
    for (const root of roots) root.unmount();
  });
  roots.length = 0;
  document.body.replaceChildren();
});

const createFieldContextValue = (
  overrides: Partial<FieldContextValue> = {},
): FieldContextValue => ({
  id: 'email-control',
  labelId: 'email-control-label',
  labelAssociation: 'for',
  name: 'email',
  invalid: false,
  required: false,
  disabled: false,
  describedBy: '',
  registerHintId: () => () => undefined,
  registerErrorId: () => () => undefined,
  ...overrides,
});

const ContextProbe = () => {
  const { disabled, id, invalid, name, required } = useFieldContext();

  return (
    <input
      id={id}
      name={name}
      aria-invalid={invalid}
      aria-required={required}
      disabled={disabled}
    />
  );
};

const renderWithEffects = async (element: ReactElement) => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(element);
  });
  return container;
};

// ─── Field ─────────────────────────────────────────────────────────────────────

describe('Field', () => {
  it('provides context with a generated id', () => {
    const html = renderToStaticMarkup(
      <Field name="email">
        <ContextProbe />
      </Field>,
    );

    expect(html).toContain('<input');
    expect(html).toContain('name="email"');
    expect(html).toMatch(/id="[^"]+"/);
  });

  it('lets FieldLabel read htmlFor from context', () => {
    const html = renderToStaticMarkup(
      <Field id="email-control" name="email" required>
        <FieldLabel>Email</FieldLabel>
      </Field>,
    );

    expect(html).toContain('for="email-control"');
    expect(html).toContain('Email');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('*');
  });

  it('lets explicit FieldLabel htmlFor override context', () => {
    const html = renderToStaticMarkup(
      <Field id="email-control" name="email">
        <FieldLabel htmlFor="custom-email">Email</FieldLabel>
      </Field>,
    );

    expect(html).toContain('for="custom-email"');
    expect(html).not.toContain('for="email-control"');
  });

  it('wires hint and error ids into aria-describedby', () => {
    const html = renderToStaticMarkup(
      <FieldContextProvider
        value={createFieldContextValue({ describedBy: 'email-hint email-error' })}
      >
        <FieldControl>
          <input />
        </FieldControl>
        <FieldHint id="email-hint">Use your work email.</FieldHint>
        <FieldError id="email-error">Email is required.</FieldError>
      </FieldContextProvider>,
    );

    expect(html).toContain('aria-describedby="email-hint email-error"');
    expect(html).toContain('id="email-hint"');
    expect(html).toContain('id="email-error"');
  });

  it('injects accessibility props into FieldControl children', () => {
    const html = renderToStaticMarkup(
      <FieldContextProvider
        value={createFieldContextValue({
          describedBy: 'email-hint email-error',
          disabled: true,
          invalid: true,
          required: true,
        })}
      >
        <FieldControl>
          <input />
        </FieldControl>
      </FieldContextProvider>,
    );

    expect(html).toContain('id="email-control"');
    expect(html).toContain('name="email"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="email-hint email-error"');
    expect(html).toContain('aria-required="true"');
    expect(html).toContain('disabled=""');
  });

  it('lets explicit FieldControl child props override context', () => {
    const html = renderToStaticMarkup(
      <FieldContextProvider
        value={createFieldContextValue({
          describedBy: 'email-hint',
          disabled: true,
          invalid: true,
          required: true,
        })}
      >
        <FieldControl>
          <input
            id="custom-control"
            name="custom-email"
            aria-invalid="false"
            aria-describedby="custom-description"
            aria-required="false"
            disabled={false}
          />
        </FieldControl>
      </FieldContextProvider>,
    );

    expect(html).toContain('id="custom-control"');
    expect(html).toContain('name="custom-email"');
    expect(html).toContain('aria-invalid="false"');
    expect(html).toContain('aria-describedby="custom-description"');
    expect(html).toContain('aria-required="false"');
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain('id="email-control"');
  });

  it('applies the shared vertical rhythm by default', async () => {
    const container = await renderWithEffects(
      <Field name="email" id="field">
        <ContextProbe />
      </Field>,
    );

    expect(container.querySelector('div')?.className).toContain('space-y-2');
  });

  it('renders no FieldError element when empty', () => {
    const html = renderToStaticMarkup(
      <FieldContextProvider value={createFieldContextValue()}>
        <FieldError />
      </FieldContextProvider>,
    );

    expect(html).toBe('');
  });

  it('keeps FieldError rendering independent from invalid state', () => {
    const validHtml = renderToStaticMarkup(
      <FieldContextProvider value={createFieldContextValue({ describedBy: 'email-error' })}>
        <FieldControl>
          <input />
        </FieldControl>
        <FieldError id="email-error">Email is required.</FieldError>
      </FieldContextProvider>,
    );

    const invalidHtml = renderToStaticMarkup(
      <FieldContextProvider
        value={createFieldContextValue({ describedBy: 'email-error', invalid: true })}
      >
        <FieldControl>
          <input />
        </FieldControl>
        <FieldError id="email-error">Email is required.</FieldError>
      </FieldContextProvider>,
    );

    expect(validHtml).toContain('id="email-error"');
    expect(validHtml).toContain('aria-describedby="email-error"');
    expect(validHtml).not.toContain('aria-invalid="true"');
    expect(invalidHtml).toContain('id="email-error"');
    expect(invalidHtml).toContain('aria-describedby="email-error"');
    expect(invalidHtml).toContain('aria-invalid="true"');
  });
});

// ─── FieldRequiredIndicator ────────────────────────────────────────────────────

describe('FieldRequiredIndicator', () => {
  it('renders an asterisk with aria-hidden', () => {
    const html = renderToStaticMarkup(<FieldRequiredIndicator />);

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('*');
  });

  it('applies a custom className alongside the default styles', () => {
    const html = renderToStaticMarkup(<FieldRequiredIndicator className="extra" />);

    expect(html).toContain('extra');
    expect(html).toContain('*');
  });
});

// ─── FieldLabel ────────────────────────────────────────────────────────────────

describe('FieldLabel', () => {
  it('applies the invalid class when the field is invalid', () => {
    const validHtml = renderToStaticMarkup(
      <FieldContextProvider value={createFieldContextValue({ invalid: false })}>
        <FieldLabel>Email</FieldLabel>
      </FieldContextProvider>,
    );
    const invalidHtml = renderToStaticMarkup(
      <FieldContextProvider value={createFieldContextValue({ invalid: true })}>
        <FieldLabel>Email</FieldLabel>
      </FieldContextProvider>,
    );

    expect(invalidHtml).not.toBe(validHtml);
    expect(invalidHtml).toContain('--ui-text-invalid');
    expect(validHtml).not.toContain('--ui-text-invalid');
  });

  it('does not render a required indicator when not required', () => {
    const html = renderToStaticMarkup(
      <FieldContextProvider value={createFieldContextValue({ required: false })}>
        <FieldLabel>Email</FieldLabel>
      </FieldContextProvider>,
    );

    expect(html).not.toContain('aria-hidden="true"');
  });

  it('applies a custom className', () => {
    const html = renderToStaticMarkup(
      <FieldContextProvider value={createFieldContextValue()}>
        <FieldLabel className="custom-label">Email</FieldLabel>
      </FieldContextProvider>,
    );

    expect(html).toContain('custom-label');
  });

  it('renders a span pinned to labelId in labelledby mode, ignoring an id override', () => {
    // Composite controls name themselves via `aria-labelledby={labelId}`, so the label
    // span must keep `labelId` as its id — a caller id override must not move the
    // association target out from under the control.
    const html = renderToStaticMarkup(
      <FieldContextProvider value={createFieldContextValue({ labelAssociation: 'labelledby' })}>
        <FieldLabel id="custom-label-id">Build</FieldLabel>
      </FieldContextProvider>,
    );

    expect(html).toContain('<span');
    expect(html).not.toContain('<label');
    expect(html).toContain('id="email-control-label"');
    expect(html).not.toContain('custom-label-id');
  });

  it('honours an id override on the native label in for mode', () => {
    // In `for` mode the label associates via htmlFor, so its own id is not the
    // association target and a caller override is safe.
    const html = renderToStaticMarkup(
      <FieldContextProvider value={createFieldContextValue({ labelAssociation: 'for' })}>
        <FieldLabel id="custom-label-id">Email</FieldLabel>
      </FieldContextProvider>,
    );

    expect(html).toContain('<label');
    expect(html).toContain('id="custom-label-id"');
  });
});

// ─── FieldGroupLabel ─────────────────────────────────────────────────────────────

describe('FieldGroupLabel', () => {
  it('renders its children inside a paragraph', () => {
    const html = renderToStaticMarkup(<FieldGroupLabel>Interests</FieldGroupLabel>);

    expect(html).toContain('<p');
    expect(html).toContain('Interests');
  });

  it('renders the hint in a normal-case span when provided', () => {
    const html = renderToStaticMarkup(
      <FieldGroupLabel hint="· pick or add your own">Interests</FieldGroupLabel>,
    );

    expect(html).toContain('· pick or add your own');
    expect(html).toContain('normal-case');
  });

  it('omits the hint span when no hint is provided', () => {
    const html = renderToStaticMarkup(<FieldGroupLabel>Interests</FieldGroupLabel>);

    expect(html).not.toContain('normal-case');
  });

  it('applies a custom className alongside the base styles', () => {
    const html = renderToStaticMarkup(
      <FieldGroupLabel className="custom-group-label">Interests</FieldGroupLabel>,
    );

    expect(html).toContain('custom-group-label');
    expect(html).toContain('ui-display-text');
  });
});

// ─── FieldHint ─────────────────────────────────────────────────────────────────

describe('FieldHint', () => {
  it('renders nothing when children is undefined', () => {
    const html = renderToStaticMarkup(
      <FieldContextProvider value={createFieldContextValue()}>
        <FieldHint />
      </FieldContextProvider>,
    );

    expect(html).toBe('');
  });

  it('renders nothing when children is an empty string', () => {
    const html = renderToStaticMarkup(
      <FieldContextProvider value={createFieldContextValue()}>
        <FieldHint>{''}</FieldHint>
      </FieldContextProvider>,
    );

    expect(html).toBe('');
  });

  it('renders the hint text when content is provided', () => {
    const html = renderToStaticMarkup(
      <FieldContextProvider value={createFieldContextValue()}>
        <FieldHint id="my-hint">Use your work email.</FieldHint>
      </FieldContextProvider>,
    );

    expect(html).toContain('id="my-hint"');
    expect(html).toContain('Use your work email.');
  });

  it('applies a custom className', () => {
    const html = renderToStaticMarkup(
      <FieldContextProvider value={createFieldContextValue()}>
        <FieldHint className="extra">A hint.</FieldHint>
      </FieldContextProvider>,
    );

    expect(html).toContain('extra');
  });

  it('registers its id in aria-describedby on the FieldControl when content is present', async () => {
    const container = await renderWithEffects(
      <Field name="email" id="field">
        <FieldControl>
          <input />
        </FieldControl>
        <FieldHint id="email-hint">Use your work email.</FieldHint>
      </Field>,
    );

    expect(container.querySelector('input')?.getAttribute('aria-describedby')).toBe('email-hint');
  });

  it('does not set aria-describedby when content is absent', async () => {
    const container = await renderWithEffects(
      <Field name="email" id="field">
        <FieldControl>
          <input />
        </FieldControl>
        <FieldHint />
      </Field>,
    );

    expect(container.querySelector('input')?.getAttribute('aria-describedby')).toBeNull();
  });
});

// ─── FieldError ────────────────────────────────────────────────────────────────

describe('FieldError', () => {
  it('renders nothing when children is undefined', () => {
    const html = renderToStaticMarkup(
      <FieldContextProvider value={createFieldContextValue()}>
        <FieldError />
      </FieldContextProvider>,
    );

    expect(html).toBe('');
  });

  it('renders nothing when children is an empty string', () => {
    const html = renderToStaticMarkup(
      <FieldContextProvider value={createFieldContextValue()}>
        <FieldError>{''}</FieldError>
      </FieldContextProvider>,
    );

    expect(html).toBe('');
  });

  it('renders the error text when content is provided', () => {
    const html = renderToStaticMarkup(
      <FieldContextProvider value={createFieldContextValue()}>
        <FieldError id="my-error">Email is required.</FieldError>
      </FieldContextProvider>,
    );

    expect(html).toContain('id="my-error"');
    expect(html).toContain('Email is required.');
  });

  it('applies a custom className', () => {
    const html = renderToStaticMarkup(
      <FieldContextProvider value={createFieldContextValue()}>
        <FieldError className="extra">An error.</FieldError>
      </FieldContextProvider>,
    );

    expect(html).toContain('extra');
  });

  it('announces itself with role="alert" so blur-triggered errors reach AT', async () => {
    const container = await renderWithEffects(
      <Field name="email" id="field">
        <FieldError id="email-error">Email is required.</FieldError>
      </Field>,
    );

    const error = container.querySelector('#email-error');
    expect(error?.getAttribute('role')).toBe('alert');
  });

  it('carries the badge class hook and keeps the glyph out of its text content', async () => {
    const container = await renderWithEffects(
      <Field name="email" id="field">
        <FieldError id="email-error">Email is required.</FieldError>
      </Field>,
    );

    // The "!" is ::before content driven by `.ui-field-error` in components.css, where
    // `content: '!' / ''` sits behind an @supports guard so engines without alternative
    // text still render the badge. Keeping it a pseudo-element (rather than an
    // aria-hidden span) is what keeps the error's text content exactly the message, so
    // consumers can assert on it and aria-describedby reads nothing extra.
    const error = container.querySelector('#email-error');
    expect(error?.className).toContain('ui-field-error');
    expect(error?.className).not.toContain('content-');
    expect(error?.textContent).toBe('Email is required.');
  });

  it('registers its id in aria-describedby on the FieldControl when content is present', async () => {
    const container = await renderWithEffects(
      <Field name="email" id="field">
        <FieldControl>
          <input />
        </FieldControl>
        <FieldError id="email-error">Email is required.</FieldError>
      </Field>,
    );

    expect(container.querySelector('input')?.getAttribute('aria-describedby')).toBe('email-error');
  });

  it('does not set aria-describedby when content is absent', async () => {
    const container = await renderWithEffects(
      <Field name="email" id="field">
        <FieldControl>
          <input />
        </FieldControl>
        <FieldError />
      </Field>,
    );

    expect(container.querySelector('input')?.getAttribute('aria-describedby')).toBeNull();
  });

  it('stacks hint id before error id in aria-describedby', async () => {
    const container = await renderWithEffects(
      <Field name="email" id="field">
        <FieldControl>
          <input />
        </FieldControl>
        <FieldHint id="email-hint">A hint.</FieldHint>
        <FieldError id="email-error">An error.</FieldError>
      </Field>,
    );

    expect(container.querySelector('input')?.getAttribute('aria-describedby')).toBe(
      'email-hint email-error',
    );
  });
});

// ─── FieldControl ──────────────────────────────────────────────────────────────

describe('FieldControl', () => {
  it('omits aria-describedby when describedBy is empty', () => {
    const html = renderToStaticMarkup(
      <FieldContextProvider value={createFieldContextValue({ describedBy: '' })}>
        <FieldControl>
          <input />
        </FieldControl>
      </FieldContextProvider>,
    );

    expect(html).not.toContain('aria-describedby');
  });

  it('omits aria-invalid when the field is valid', () => {
    const html = renderToStaticMarkup(
      <FieldContextProvider value={createFieldContextValue({ invalid: false })}>
        <FieldControl>
          <input />
        </FieldControl>
      </FieldContextProvider>,
    );

    expect(html).not.toContain('aria-invalid');
  });

  it('omits disabled when the field is not disabled', () => {
    const html = renderToStaticMarkup(
      <FieldContextProvider value={createFieldContextValue({ disabled: false })}>
        <FieldControl>
          <input />
        </FieldControl>
      </FieldContextProvider>,
    );

    expect(html).not.toContain('disabled');
  });

  it('omits aria-required when the field is not required', () => {
    const html = renderToStaticMarkup(
      <FieldContextProvider value={createFieldContextValue({ required: false })}>
        <FieldControl>
          <input />
        </FieldControl>
      </FieldContextProvider>,
    );

    expect(html).not.toContain('aria-required');
  });
});

// ─── useFieldContext ────────────────────────────────────────────────────────────

describe('useFieldContext', () => {
  it('throws when used outside a Field', () => {
    const Probe = () => {
      useFieldContext();
      return null;
    };

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderToStaticMarkup(<Probe />)).toThrow(
      'useFieldContext must be used within a Field.',
    );
    spy.mockRestore();
  });
});

// ─── hasRenderableChildren ─────────────────────────────────────────────────────

describe('hasRenderableChildren', () => {
  it('returns false for null', () => expect(hasRenderableChildren(null)).toBe(false));
  it('returns false for undefined', () => expect(hasRenderableChildren(undefined)).toBe(false));
  it('returns false for boolean true', () => expect(hasRenderableChildren(true)).toBe(false));
  it('returns false for boolean false', () => expect(hasRenderableChildren(false)).toBe(false));
  it('returns false for an empty string', () => expect(hasRenderableChildren('')).toBe(false));
  it('returns false for a whitespace-only string', () =>
    expect(hasRenderableChildren('   ')).toBe(false));
  it('returns true for a non-empty string', () =>
    expect(hasRenderableChildren('hello')).toBe(true));
  it('returns true for a number', () => expect(hasRenderableChildren(42)).toBe(true));
  it('returns true for a valid React element', () =>
    expect(hasRenderableChildren(<span />)).toBe(true));
  it('returns false for an empty array', () => expect(hasRenderableChildren([])).toBe(false));
  it('returns true for an array containing at least one truthy child', () =>
    expect(hasRenderableChildren(['hello', null])).toBe(true));
  it('returns false for an array of only falsy children', () =>
    expect(hasRenderableChildren([null, false, ''])).toBe(false));
  it('returns true for a Fragment containing content', () =>
    expect(hasRenderableChildren(<Fragment>hello</Fragment>)).toBe(true));
  it('returns false for a Fragment with no renderable content', () =>
    expect(hasRenderableChildren(<Fragment>{null}</Fragment>)).toBe(false));
});
