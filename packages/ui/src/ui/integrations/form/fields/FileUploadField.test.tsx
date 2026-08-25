// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Form, useAppForm } from '../index';

afterEach(() => {
  cleanup();
});

const makeFile = (name: string, type: string): File =>
  new File([new Uint8Array(4)], name, { type });

const queryFileInput = (container: HTMLElement): HTMLInputElement => {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('file input not found');
  return input;
};

describe('form.FileUploadField', () => {
  it('writes selected files into TanStack Form state', () => {
    type Values = { attachments: File[] | undefined };
    const formRef: { current: { state: { values: Values } } | undefined } = { current: undefined };

    const Demo = () => {
      const form = useAppForm({ defaultValues: { attachments: undefined } as Values });
      formRef.current = form;
      return (
        <Form form={form}>
          <form.FileUploadField label="Attachments" name="attachments" multiple accept="image/*" />
        </Form>
      );
    };

    const { container } = render(<Demo />);
    const input = queryFileInput(container);

    fireEvent.change(input, { target: { files: [makeFile('a.png', 'image/png')] } });

    expect(formRef.current?.state.values.attachments?.map((f) => f.name)).toEqual(['a.png']);
  });

  it('appends new selections to existing files in multiple mode', () => {
    type Values = { attachments: File[] | undefined };
    const formRef: { current: { state: { values: Values } } | undefined } = { current: undefined };

    const Demo = () => {
      const form = useAppForm({
        defaultValues: { attachments: [makeFile('seed.png', 'image/png')] } as Values,
      });
      formRef.current = form;
      return (
        <Form form={form}>
          <form.FileUploadField label="Attachments" name="attachments" multiple />
        </Form>
      );
    };

    const { container } = render(<Demo />);
    const input = queryFileInput(container);

    // Replacing with an empty FileList does not fire change; remove via a fresh empty drop instead.
    fireEvent.change(input, { target: { files: [makeFile('b.png', 'image/png')] } });
    expect(formRef.current?.state.values.attachments?.map((f) => f.name)).toEqual([
      'seed.png',
      'b.png',
    ]);
  });
});
