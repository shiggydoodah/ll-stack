// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Form, useAppForm, useFormTask } from '../index';
import { createDeferred, renderReact, requireElement } from '../test-utils';

describe('form.SubmitButton', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('disables and shows a loading state while the form is submitting', async () => {
    const submitGate = createDeferred<void>();

    const Demo = () => {
      const form = useAppForm({
        defaultValues: { email: 'a@b.test' },
        onSubmit: async () => {
          await submitGate.promise;
        },
      });

      return (
        <Form form={form}>
          <form.SubmitButton>Submit</form.SubmitButton>
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const form = requireElement(rendered.container.querySelector<HTMLFormElement>('form'), 'form');
    const button = requireElement(
      rendered.container.querySelector<HTMLButtonElement>('button[type="submit"]'),
      'submit button',
    );

    expect(button.disabled).toBe(false);

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');

    await act(async () => {
      submitGate.resolve();
      await submitGate.promise;
    });

    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-busy')).toBeNull();

    await rendered.unmount();
  });

  it('disables while a useFormTask is busy', async () => {
    const taskGate = createDeferred<void>();

    let triggerTask: (() => void) | undefined;

    const Pending = () => {
      const { runTask } = useFormTask();

      triggerTask = () => {
        void runTask(taskGate.promise);
      };

      return null;
    };

    const Demo = () => {
      const form = useAppForm({ defaultValues: { email: '' } });

      return (
        <Form form={form}>
          <Pending />
          <form.SubmitButton>Submit</form.SubmitButton>
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const button = requireElement(
      rendered.container.querySelector<HTMLButtonElement>('button[type="submit"]'),
      'submit button',
    );

    expect(button.disabled).toBe(false);

    await act(async () => {
      triggerTask?.();
    });

    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');

    await act(async () => {
      taskGate.resolve();
      await taskGate.promise;
    });

    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-busy')).toBeNull();

    await rendered.unmount();
  });
});
