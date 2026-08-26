import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import NotFoundScreen, { NOT_FOUND_BODY, NOT_FOUND_TITLE } from './NotFoundScreen';

describe('NotFoundScreen', () => {
  it('renders the shared 404 copy with the escape-hatch link', () => {
    const html = renderToStaticMarkup(
      <NotFoundScreen homeHref="/feed" homeLabel="Back to your feed" />,
    );

    expect(html).toContain('404');
    expect(html).toContain(NOT_FOUND_TITLE);
    // The body copy's apostrophes are HTML-escaped in static markup, so assert
    // on an apostrophe-free fragment.
    expect(html).toContain('exist or may have been moved');
    expect(html).toContain('href="/feed"');
    expect(html).toContain('Back to your feed');
  });

  it('fills and centres the members scroll area only in the panel variant', () => {
    const panel = renderToStaticMarkup(
      <NotFoundScreen variant="panel" homeHref="/feed" homeLabel="Back to your feed" />,
    );
    const page = renderToStaticMarkup(
      <NotFoundScreen homeHref="/" homeLabel="Back to the homepage" />,
    );

    expect(panel).toContain('min-h-[60dvh]');
    expect(page).not.toContain('min-h-[60dvh]');
  });

  it('carries no detail about why the URL failed to resolve', () => {
    expect(`${NOT_FOUND_TITLE} ${NOT_FOUND_BODY}`).not.toMatch(
      /hidden|blocked|deleted|private|error/i,
    );
  });
});
