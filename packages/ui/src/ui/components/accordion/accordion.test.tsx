// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './accordion';

beforeAll(() => {
  // Radix Collapsible measures the panel height via ResizeObserver; jsdom lacks it.
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

const SingleFixture = ({ collapsible = true }: { collapsible?: boolean }) => (
  <Accordion type="single" collapsible={collapsible}>
    <AccordionItem value="a">
      <AccordionTrigger>First question</AccordionTrigger>
      <AccordionContent>Answer A</AccordionContent>
    </AccordionItem>
    <AccordionItem value="b">
      <AccordionTrigger>Second question</AccordionTrigger>
      <AccordionContent>Answer B</AccordionContent>
    </AccordionItem>
  </Accordion>
);

describe('Accordion behaviour', () => {
  it('renders every trigger with its panel collapsed by default', () => {
    render(<SingleFixture />);

    expect(screen.getAllByRole('button')).toHaveLength(2);
    // Radix unmounts collapsed panels, so their content is not in the tree.
    expect(screen.queryByText('Answer A')).toBeNull();
    expect(screen.queryByText('Answer B')).toBeNull();
  });

  it('opens an item on click and reflects it in aria-expanded', async () => {
    const user = userEvent.setup();
    render(<SingleFixture />);

    const trigger = screen.getByRole('button', { name: 'First question' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    await user.click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('region').textContent).toContain('Answer A');
  });

  it('keeps only one item open at a time in single mode', async () => {
    const user = userEvent.setup();
    render(<SingleFixture />);

    await user.click(screen.getByRole('button', { name: 'First question' }));
    expect(screen.queryByText('Answer A')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Second question' }));
    expect(screen.queryByText('Answer B')).not.toBeNull();
    expect(screen.queryByText('Answer A')).toBeNull();
  });

  it('closes an open item on re-click when collapsible', async () => {
    const user = userEvent.setup();
    render(<SingleFixture />);

    const trigger = screen.getByRole('button', { name: 'First question' });
    await user.click(trigger);
    expect(screen.queryByText('Answer A')).not.toBeNull();

    await user.click(trigger);
    expect(screen.queryByText('Answer A')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('does not close the only open item on re-click when not collapsible', async () => {
    const user = userEvent.setup();
    render(<SingleFixture collapsible={false} />);

    const trigger = screen.getByRole('button', { name: 'First question' });
    await user.click(trigger);
    await user.click(trigger);

    expect(screen.queryByText('Answer A')).not.toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('allows several items open at once in multiple mode', async () => {
    const user = userEvent.setup();
    render(
      <Accordion type="multiple">
        <AccordionItem value="a">
          <AccordionTrigger>First question</AccordionTrigger>
          <AccordionContent>Answer A</AccordionContent>
        </AccordionItem>
        <AccordionItem value="b">
          <AccordionTrigger>Second question</AccordionTrigger>
          <AccordionContent>Answer B</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );

    await user.click(screen.getByRole('button', { name: 'First question' }));
    await user.click(screen.getByRole('button', { name: 'Second question' }));

    expect(screen.queryByText('Answer A')).not.toBeNull();
    expect(screen.queryByText('Answer B')).not.toBeNull();
  });

  it('disables a disabled item and keeps its panel closed', () => {
    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="a" disabled>
          <AccordionTrigger>Disabled question</AccordionTrigger>
          <AccordionContent>Hidden answer</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );

    const trigger = screen.getByRole('button', { name: 'Disabled question' });
    expect(trigger.hasAttribute('disabled')).toBe(true);
    expect(screen.queryByText('Hidden answer')).toBeNull();
  });

  it('renders arbitrary interactive content inside a panel', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Accordion type="single" collapsible defaultValue="a">
        <AccordionItem value="a">
          <AccordionTrigger>First question</AccordionTrigger>
          <AccordionContent>
            <img src="/diagram.png" alt="Diagram" />
            <button type="button" onClick={onClick}>
              Contact support
            </button>
          </AccordionContent>
        </AccordionItem>
      </Accordion>,
    );

    expect(screen.queryByAltText('Diagram')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Contact support' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('supports controlled mode via value + onValueChange', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { rerender } = render(
      <Accordion type="single" collapsible value="" onValueChange={onValueChange}>
        <AccordionItem value="a">
          <AccordionTrigger>First question</AccordionTrigger>
          <AccordionContent>Answer A</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );

    expect(screen.queryByText('Answer A')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'First question' }));

    expect(onValueChange).toHaveBeenCalledWith('a');
    // Still closed because the parent has not updated `value`.
    expect(screen.queryByText('Answer A')).toBeNull();

    rerender(
      <Accordion type="single" collapsible value="a" onValueChange={onValueChange}>
        <AccordionItem value="a">
          <AccordionTrigger>First question</AccordionTrigger>
          <AccordionContent>Answer A</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );

    expect(screen.queryByText('Answer A')).not.toBeNull();
  });
});

describe('Accordion keyboard', () => {
  it('moves focus between triggers with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<SingleFixture />);

    const first = screen.getByRole('button', { name: 'First question' });
    const second = screen.getByRole('button', { name: 'Second question' });
    first.focus();
    expect(document.activeElement).toBe(first);

    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(second);

    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(first);
  });
});

describe('Accordion styling', () => {
  it('lays out the separated variant as spaced cards', () => {
    const html = renderToStaticMarkup(<SingleFixture />);
    expect(html).toContain('gap-2');
    expect(html).toContain('rounded-(--ui-radius-lg)');
    // Card variant relies on its own border, not the inter-row divider.
    expect(html).not.toContain('last:border-b-0');
  });

  it('switches the contained variant to divided rows', () => {
    const html = renderToStaticMarkup(
      <Accordion type="single" variant="contained">
        <AccordionItem value="a">
          <AccordionTrigger>Question</AccordionTrigger>
          <AccordionContent>Answer</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );
    expect(html).toContain('last:border-b-0');
  });

  it('rotates the chevron when an item opens', () => {
    const html = renderToStaticMarkup(<SingleFixture />);
    expect(html).toContain('group-data-[state=open]:rotate-180');
  });

  it('animates the open panel height', () => {
    const html = renderToStaticMarkup(
      <Accordion type="single" defaultValue="a">
        <AccordionItem value="a">
          <AccordionTrigger>Question</AccordionTrigger>
          <AccordionContent>Answer A</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );
    expect(html).toContain('animate-accordion-down');
    expect(html).toContain('Answer A');
  });

  it('applies the large size scale to the trigger', () => {
    const html = renderToStaticMarkup(
      <Accordion type="single" size="large">
        <AccordionItem value="a">
          <AccordionTrigger>Question</AccordionTrigger>
          <AccordionContent>Answer</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );
    expect(html).toContain('text-lg');
    expect(html).toContain('px-5');
  });
});
