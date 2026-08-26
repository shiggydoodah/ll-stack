import { createRef, type ReactElement, type SVGProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LucideIcon } from 'lucide-react';

import { Icon, type IconProps } from './Icon';

const MockIcon = ((props: SVGProps<SVGSVGElement>) => <svg {...props} />) as LucideIcon;

describe('Icon', () => {
  it('is decorative by default with aria-hidden', () => {
    const html = renderToStaticMarkup(<Icon icon={MockIcon} />);

    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('aria-label=');
    expect(html).not.toContain('role=');
  });

  it('adds aria-label and role="img" when not decorative', () => {
    const html = renderToStaticMarkup(<Icon icon={MockIcon} decorative={false} label="Search" />);

    expect(html).toContain('aria-label="Search"');
    expect(html).toContain('role="img"');
    expect(html).not.toContain('aria-hidden=');
  });

  it('applies the default md size class', () => {
    const html = renderToStaticMarkup(<Icon icon={MockIcon} />);

    expect(html).toContain('size-5');
  });

  it('applies the correct size class', () => {
    const xs = renderToStaticMarkup(<Icon icon={MockIcon} size="xs" />);
    const xl = renderToStaticMarkup(<Icon icon={MockIcon} size="xl" />);

    expect(xs).toContain('size-3');
    expect(xl).toContain('size-8');
  });

  it('sets focusable="false" to prevent IE focus trap', () => {
    const html = renderToStaticMarkup(<Icon icon={MockIcon} />);

    expect(html).toContain('focusable="false"');
  });

  it('merges custom className', () => {
    const html = renderToStaticMarkup(
      <Icon icon={MockIcon} className="text-(--ui-text-invalid)" />,
    );

    expect(html).toContain('text-(--ui-text-invalid)');
    expect(html).toContain('size-5');
  });

  it('passes through additional svg attributes', () => {
    const html = renderToStaticMarkup(<Icon icon={MockIcon} data-testid="icon" />);

    expect(html).toContain('data-testid="icon"');
  });

  it('passes through a ref prop', () => {
    const ref = createRef<SVGSVGElement>();

    expect((Icon({ icon: MockIcon, ref }) as ReactElement<IconProps>).props.ref).toBe(ref);
  });
});
