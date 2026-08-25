import { createRef, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { Switch, type SwitchProps } from './Switch';

const getSwitchProps = (props: SwitchProps) => (Switch(props) as ReactElement<SwitchProps>).props;

type SwitchClickEvent = Parameters<NonNullable<SwitchProps['onClick']>>[0];

describe('Switch', () => {
  it('renders a switch button', () => {
    const html = renderToStaticMarkup(<Switch checked aria-label="Show online status" />);

    expect(html).toContain('<button');
    expect(html).toContain('type="button"');
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('aria-label="Show online status"');
    expect(html).toContain('data-state="checked"');
  });

  it('reflects the unchecked state', () => {
    const html = renderToStaticMarkup(<Switch checked={false} aria-label="Toggle" />);

    expect(html).toContain('aria-checked="false"');
    expect(html).toContain('data-state="unchecked"');
  });

  it('applies size classes', () => {
    const medium = renderToStaticMarkup(<Switch checked={false} aria-label="Toggle" />);
    const small = renderToStaticMarkup(<Switch checked={false} size="small" aria-label="Toggle" />);

    expect(medium).toContain('h-6');
    expect(small).toContain('h-5');
  });

  it('merges a custom className', () => {
    const html = renderToStaticMarkup(
      <Switch checked={false} className="self-center" aria-label="Toggle" />,
    );

    expect(html).toContain('self-center');
  });

  it('passes through a ref prop', () => {
    const ref = createRef<HTMLButtonElement>();

    expect(getSwitchProps({ checked: false, ref }).ref).toBe(ref);
  });

  it('applies disabled state', () => {
    const html = renderToStaticMarkup(<Switch checked={false} disabled aria-label="Toggle" />);

    expect(html).toContain('disabled=""');
  });

  it('calls onCheckedChange with the next state', () => {
    const onCheckedChange = vi.fn();
    const handleClick = getSwitchProps({ checked: false, onCheckedChange }).onClick;

    if (!handleClick) {
      throw new Error('Expected Switch to render an onClick handler.');
    }

    handleClick({ defaultPrevented: false } as SwitchClickEvent);

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('does not call onCheckedChange when the click event is prevented', () => {
    const onCheckedChange = vi.fn();
    let defaultPrevented = false;
    const handleClick = getSwitchProps({
      checked: false,
      onClick: (event) => event.preventDefault(),
      onCheckedChange,
    }).onClick;

    if (!handleClick) {
      throw new Error('Expected Switch to render an onClick handler.');
    }

    handleClick({
      get defaultPrevented() {
        return defaultPrevented;
      },
      preventDefault: () => {
        defaultPrevented = true;
      },
    } as SwitchClickEvent);

    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
