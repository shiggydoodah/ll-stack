// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { SpecimenConfig } from './define';
import { allSpecimens } from './index';

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const defaultRenderProps = (specimen: SpecimenConfig<any>): Record<string, unknown> => {
  const argDefaults = Object.fromEntries(
    Object.entries(specimen.argTypes).map(([k, def]) => [k, def?.defaultValue]),
  );
  const staticProps = specimen.variants[0]?.props ?? {};
  return { ...staticProps, ...argDefaults };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
allSpecimens.forEach((specimen: SpecimenConfig<any>) => {
  describe(specimen.title, () => {
    it('renders with default props without crashing', () => {
      const Component = specimen.component;
      const html = renderToStaticMarkup(<Component {...defaultRenderProps(specimen)} />);
      expect(html.length).toBeGreaterThan(0);
    });

    specimen.variants.forEach((variant) => {
      it(`renders "${variant.name}" variant without crashing`, () => {
        const Component = specimen.component;
        const html = renderToStaticMarkup(<Component {...variant.props} />);
        expect(html.length).toBeGreaterThan(0);
      });
    });
  });
});
