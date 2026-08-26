// @vitest-environment node

// True SSR coverage: the jsdom render suite never exercises the
// `typeof window === 'undefined'` guards because jsdom always provides a
// window. This suite runs the same specimen matrix under a real node
// environment, so a component that touches `window`/`document`/`matchMedia`
// during render (rather than in an effect) fails here instead of in a
// framework's server build.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { defaultRenderProps } from './define';
import type { AnySpecimen } from './define';
import { allSpecimens } from './index';

allSpecimens.forEach((specimen: AnySpecimen) => {
  describe(`${specimen.title} (SSR)`, () => {
    it('renders to static markup with default props', () => {
      const Component = specimen.component;
      const html = renderToStaticMarkup(<Component {...defaultRenderProps(specimen)} />);
      expect(html.length).toBeGreaterThan(0);
    });

    specimen.variants.forEach((variant) => {
      it(`renders "${variant.name}" variant to static markup`, () => {
        const Component = specimen.component;
        const html = renderToStaticMarkup(
          <Component {...defaultRenderProps(specimen)} {...variant.props} />,
        );
        expect(html.length).toBeGreaterThan(0);
      });
    });
  });
});
