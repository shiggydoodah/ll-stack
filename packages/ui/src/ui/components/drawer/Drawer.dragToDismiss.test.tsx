// @vitest-environment jsdom

import type { ReactNode } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// vaul never reflects `handleOnly` into the DOM, and its drag gesture can't run
// in jsdom, so the wiring is asserted at the prop seam instead: capture the props
// the wrapper hands to vaul's `Drawer.Root`. Hoisted so the (hoisted) vi.mock
// factory below can reference it.
const { rootProps } = vi.hoisted(() => ({
  rootProps: [] as Array<Record<string, unknown>>,
}));

vi.mock('vaul', () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    Drawer: {
      Root: (props: Record<string, unknown>) => {
        rootProps.push(props);
        return <>{props.children as ReactNode}</>;
      },
      Trigger: Passthrough,
      Portal: Passthrough,
      Overlay: Passthrough,
      Content: Passthrough,
      Title: Passthrough,
      Description: Passthrough,
      Close: Passthrough,
      Handle: Passthrough,
    },
  };
});

import { Drawer } from './Drawer';

const lastRoot = () => rootProps.at(-1);

afterEach(() => {
  cleanup();
  rootProps.length = 0;
});

describe('Drawer — dragToDismiss maps to vaul handleOnly', () => {
  it('locks body dragging by default so it becomes handle-only (handleOnly = true)', () => {
    render(<Drawer open>body</Drawer>);
    expect(lastRoot()?.handleOnly).toBe(true);
  });

  it('unlocks body dragging when dragToDismiss is set (handleOnly = false)', () => {
    render(
      <Drawer open dragToDismiss>
        body
      </Drawer>,
    );
    expect(lastRoot()?.handleOnly).toBe(false);
  });

  it('never forwards the wrapper-only dragToDismiss prop to vaul', () => {
    render(
      <Drawer open dragToDismiss>
        body
      </Drawer>,
    );
    expect(lastRoot()).not.toHaveProperty('dragToDismiss');
  });

  it('lets an explicit handleOnly override win over the derived value', () => {
    render(
      <Drawer open handleOnly={false}>
        body
      </Drawer>,
    );
    expect(lastRoot()?.handleOnly).toBe(false);
  });
});
