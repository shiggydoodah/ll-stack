// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { defaultRenderProps } from './define';
import type { AnySpecimen } from './define';
import { allSpecimens } from './index';

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
});

allSpecimens.forEach((specimen: AnySpecimen) => {
  describe(specimen.title, () => {
    it('renders with default props without crashing', () => {
      const Component = specimen.component;
      const html = renderToStaticMarkup(<Component {...defaultRenderProps(specimen)} />);
      expect(html.length).toBeGreaterThan(0);
    });

    specimen.variants.forEach((variant) => {
      it(`renders "${variant.name}" variant without crashing`, () => {
        const Component = specimen.component;
        // Variants layer on top of the argType defaults, exactly as ui-lab's
        // variant buttons do — rendering `variant.props` bare would exercise a
        // prop combination no ui-lab user ever sees.
        const html = renderToStaticMarkup(
          <Component {...defaultRenderProps(specimen)} {...variant.props} />,
        );
        expect(html.length).toBeGreaterThan(0);
      });
    });
  });
});
