// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button, ButtonLink, IconButton } from './button';

const renderIntoBody = async (element: React.ReactElement) => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return {
    container,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
};

afterEach(() => {
  document.body.replaceChildren();
});

describe('Button', () => {
  it('renders a button element with type="button" by default', () => {
    const html = renderToStaticMarkup(<Button>Save</Button>);

    expect(html).toContain('<button');
    expect(html).toContain('type="button"');
    expect(html).toContain('Save');
  });

  it('applies medium size classes by default', () => {
    const html = renderToStaticMarkup(<Button>Label</Button>);

    expect(html).toContain('py-3');
    expect(html).toContain('px-3.5');
  });

  it('applies the correct size class', () => {
    const small = renderToStaticMarkup(<Button size="small">Label</Button>);
    const large = renderToStaticMarkup(<Button size="large">Label</Button>);

    expect(small).toContain('py-2.5');
    expect(large).toContain('py-3.5');
  });

  it('adds w-full when fullWidth is true', () => {
    const html = renderToStaticMarkup(<Button fullWidth>Label</Button>);

    expect(html).toContain('w-full');
  });

  it('sets aria-busy and renders a spinner while loading', () => {
    const html = renderToStaticMarkup(<Button loading>Label</Button>);

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('animate-spin');
  });

  // While only loading the button must stay focusable so keyboard focus is not
  // silently dropped — aria-disabled + click suppression instead of native disabled.
  it('stays focusable while loading: aria-disabled without native disabled', () => {
    const html = renderToStaticMarkup(<Button loading>Label</Button>);

    expect(html).not.toContain('disabled=""');
    expect(html).toContain('aria-disabled="true"');
  });

  it('uses native disabled (not aria-disabled) when explicitly disabled', () => {
    const html = renderToStaticMarkup(
      <Button disabled loading>
        Label
      </Button>,
    );

    expect(html).toContain('disabled=""');
    expect(html).not.toContain('aria-disabled');
  });

  it('sets disabled attribute and applies disabled styles when disabled without loading', () => {
    const html = renderToStaticMarkup(<Button disabled>Label</Button>);

    expect(html).toContain('disabled=""');
    expect(html).toContain('cursor-not-allowed');
    expect(html).toContain('opacity-70');
  });

  it('applies cursor-wait when loading', () => {
    const html = renderToStaticMarkup(<Button loading>Label</Button>);

    expect(html).toContain('cursor-wait');
  });

  // Suppression while loading-only must be declarative, not a JS handler, so the
  // primitive stays renderable from a Server Component.
  it('blocks pointer activation while loading', () => {
    const html = renderToStaticMarkup(<Button loading>Label</Button>);

    expect(html).toContain('pointer-events-none');
  });

  it('does not block pointer activation when idle or natively disabled', () => {
    expect(renderToStaticMarkup(<Button>Label</Button>)).not.toContain('pointer-events-none');
    expect(renderToStaticMarkup(<Button disabled>Label</Button>)).not.toContain(
      'pointer-events-none',
    );
  });

  // A loading submit button stays focusable, so Enter/Space still activates it;
  // swapping type keeps that from submitting the form a second time.
  it('downgrades type to "button" while loading so Enter cannot resubmit', () => {
    const html = renderToStaticMarkup(
      <Button type="submit" loading>
        Label
      </Button>,
    );

    expect(html).toContain('type="button"');
  });

  it('keeps the caller type when loading alongside an explicit disabled', () => {
    const html = renderToStaticMarkup(
      <Button type="submit" loading disabled>
        Label
      </Button>,
    );

    expect(html).toContain('type="submit"');
  });

  it('applies tone colour classes', () => {
    const html = renderToStaticMarkup(
      <Button tone="red" variant="solid">
        Label
      </Button>,
    );

    expect(html).toContain('bg-tone-red');
    expect(html).toContain('text-tone-red-contrast');
  });

  it('fires onClick when enabled', async () => {
    const handler = vi.fn();
    const rendered = await renderIntoBody(<Button onClick={handler}>Click</Button>);
    const button = rendered.container.querySelector('button')!;

    await act(async () => {
      button.click();
    });

    expect(handler).toHaveBeenCalledOnce();
    await rendered.unmount();
  });

  it('suppresses onClick when disabled', async () => {
    const handler = vi.fn();
    const rendered = await renderIntoBody(
      <Button disabled onClick={handler}>
        Click
      </Button>,
    );
    const button = rendered.container.querySelector('button')!;

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(handler).not.toHaveBeenCalled();
    await rendered.unmount();
  });

  it('suppresses onClick when loading', async () => {
    const handler = vi.fn();
    const rendered = await renderIntoBody(
      <Button loading onClick={handler}>
        Click
      </Button>,
    );
    const button = rendered.container.querySelector('button')!;

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(handler).not.toHaveBeenCalled();
    await rendered.unmount();
  });
});

describe('ButtonLink', () => {
  it('renders an anchor element', () => {
    const html = renderToStaticMarkup(<ButtonLink href="/dashboard">Dashboard</ButtonLink>);

    expect(html).toContain('<a');
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('Dashboard');
  });

  it('adds rel="noopener noreferrer" for _blank targets', () => {
    const html = renderToStaticMarkup(
      <ButtonLink href="/page" target="_blank">
        External
      </ButtonLink>,
    );

    expect(html).toContain('noopener');
    expect(html).toContain('noreferrer');
  });

  it('removes href and sets aria-disabled when disabled', () => {
    const html = renderToStaticMarkup(
      <ButtonLink href="/page" disabled>
        Disabled
      </ButtonLink>,
    );

    expect(html).not.toContain('href=');
    expect(html).toContain('aria-disabled="true"');
  });

  it('sets tabIndex to -1 when disabled', () => {
    const html = renderToStaticMarkup(
      <ButtonLink href="/page" disabled>
        Disabled
      </ButtonLink>,
    );

    expect(html).toContain('tabindex="-1"');
  });

  it('sets aria-busy while loading', () => {
    const html = renderToStaticMarkup(
      <ButtonLink href="/page" loading>
        Loading
      </ButtonLink>,
    );

    expect(html).toContain('aria-busy="true"');
  });

  // The anchor has no native `disabled`, so the JS handler is the *only* thing
  // suppressing the click while disabled — assert the behaviour, not just its shape.
  it('suppresses onClick when disabled', async () => {
    const handler = vi.fn();
    const rendered = await renderIntoBody(
      <ButtonLink href="/page" disabled onClick={handler}>
        Disabled
      </ButtonLink>,
    );
    const anchor = rendered.container.querySelector('a')!;

    await act(async () => {
      anchor.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(handler).not.toHaveBeenCalled();
    await rendered.unmount();
  });
});

describe('IconButton', () => {
  it('applies padding-based size classes', () => {
    const medium = renderToStaticMarkup(
      <IconButton aria-label="Default">
        <span>×</span>
      </IconButton>,
    );
    const small = renderToStaticMarkup(
      <IconButton aria-label="Small" size="small">
        <span>×</span>
      </IconButton>,
    );

    expect(medium).toContain('p-3');
    expect(small).toContain('p-2.5');
  });

  it('renders a button with an accessible label', () => {
    const html = renderToStaticMarkup(
      <IconButton aria-label="Close">
        <span>×</span>
      </IconButton>,
    );

    expect(html).toContain('<button');
    expect(html).toContain('aria-label="Close"');
  });

  it('applies circle shape class', () => {
    const html = renderToStaticMarkup(
      <IconButton aria-label="Expand" shape="circle">
        <span>+</span>
      </IconButton>,
    );

    expect(html).toContain('rounded-full');
  });

  it('renders a labeled spinner when loading', () => {
    const html = renderToStaticMarkup(
      <IconButton aria-label="Save" loading>
        <span>✓</span>
      </IconButton>,
    );

    expect(html).toContain('aria-label="Save"');
    expect(html).toContain('animate-spin');
    expect(html).toContain('role="status"');
  });
});

// A host element carries a function onClick prop only when one is genuinely
// needed; otherwise it cannot be serialised across the server→client boundary and
// crashes any Server Component that renders the primitive directly. A handler is
// attached only when the caller passed an onClick, OR the element must suppress
// the click itself while disabled/loading and has no native way to do so.
//
// The native <button> primitives suppress activation declaratively in BOTH
// suppressed states — `disabled` renders the native attribute, and loading-only
// swaps type to "button" and adds pointer-events-none (staying focusable via
// aria-disabled) — so with no caller onClick they need NO handler either way and
// stay serialisable throughout. ButtonLink's <a> has no native `disabled` and no
// declarative equivalent, so there the JS handler remains the only thing
// suppressing the click and is still attached.
describe('onClick handler attachment (Server Component safety)', () => {
  // Reads the onClick prop off the primitive's root host element. These primitives
  // are stateless, so calling them as plain functions and inspecting the returned
  // element is a reliable stand-in for an RSC/Flight renderer: it proves whether a
  // (non-serialisable) function prop is attached without needing a server bundler.
  const onClickProp = (element: React.ReactElement): unknown =>
    (element.props as { onClick?: unknown }).onClick;

  it('Button omits onClick when enabled with no handler', () => {
    expect(onClickProp(Button({ children: 'Save' }))).toBeUndefined();
  });

  it('Button attaches a handler when an onClick is provided', () => {
    expect(typeof onClickProp(Button({ children: 'Save', onClick: () => {} }))).toBe('function');
  });

  it('Button omits onClick when disabled with no handler', () => {
    expect(onClickProp(Button({ children: 'Save', disabled: true }))).toBeUndefined();
  });

  // A loading-only Button does not set native disabled (it stays focusable via
  // aria-disabled), but suppression is declarative — type="button" +
  // pointer-events-none — so no function prop is needed.
  it('Button omits onClick when loading with no handler', () => {
    expect(onClickProp(Button({ children: 'Save', loading: true }))).toBeUndefined();
  });

  it('ButtonLink omits onClick when enabled with no handler', () => {
    expect(onClickProp(ButtonLink({ href: '/x', children: 'Go' }))).toBeUndefined();
  });

  it('ButtonLink attaches a handler when an onClick is provided', () => {
    expect(typeof onClickProp(ButtonLink({ href: '/x', children: 'Go', onClick: () => {} }))).toBe(
      'function',
    );
  });

  it('ButtonLink attaches a suppression handler when disabled (no onClick)', () => {
    expect(typeof onClickProp(ButtonLink({ href: '/x', children: 'Go', disabled: true }))).toBe(
      'function',
    );
  });

  it('ButtonLink attaches a suppression handler when loading (no onClick)', () => {
    expect(typeof onClickProp(ButtonLink({ href: '/x', children: 'Go', loading: true }))).toBe(
      'function',
    );
  });

  it('IconButton omits onClick when enabled with no handler', () => {
    expect(
      onClickProp(IconButton({ 'aria-label': 'Close', children: <span>×</span> })),
    ).toBeUndefined();
  });

  it('IconButton attaches a handler when an onClick is provided', () => {
    expect(
      typeof onClickProp(
        IconButton({ 'aria-label': 'Close', onClick: () => {}, children: <span>×</span> }),
      ),
    ).toBe('function');
  });

  it('IconButton omits onClick when disabled with no handler', () => {
    expect(
      onClickProp(IconButton({ 'aria-label': 'Close', disabled: true, children: <span>×</span> })),
    ).toBeUndefined();
  });

  // Like Button, a loading-only IconButton stays focusable (aria-disabled, no
  // native disabled) and suppresses activation declaratively, so no handler.
  it('IconButton omits onClick when loading with no handler', () => {
    expect(
      onClickProp(IconButton({ 'aria-label': 'Close', loading: true, children: <span>×</span> })),
    ).toBeUndefined();
  });

  it('IconButton suppresses activation declaratively while loading', () => {
    const html = renderToStaticMarkup(
      <IconButton aria-label="Close" type="submit" loading>
        <span>×</span>
      </IconButton>,
    );

    expect(html).toContain('pointer-events-none');
    expect(html).toContain('type="button"');
  });

  it('IconButton stays focusable while loading: aria-disabled without native disabled', () => {
    const html = renderToStaticMarkup(
      <IconButton aria-label="Close" loading>
        <span>×</span>
      </IconButton>,
    );

    expect(html).not.toContain('disabled=""');
    expect(html).toContain('aria-disabled="true"');
  });
});
