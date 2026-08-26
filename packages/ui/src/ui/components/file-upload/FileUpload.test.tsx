// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FileUpload } from './FileUpload';

// The useFileUpload validation suite lives with the hook:
// src/ui/hooks/useFileUpload.test.ts. This file covers the component shell.

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const makeFile = (name: string, type: string, size = 8): File =>
  new File([new Uint8Array(size)], name, { type });

const fileInput = (): HTMLInputElement => {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('file input not found');
  return input;
};

describe('FileUpload', () => {
  it('default button trigger opens the file input', async () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click');
    const user = userEvent.setup();
    render(<FileUpload label="Avatar" />);

    await user.click(screen.getByRole('button', { name: 'Choose file' }));
    expect(clickSpy).toHaveBeenCalled();
  });

  it('renders a custom trigger and opens the dialog when clicked', async () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click');
    const user = userEvent.setup();
    render(<FileUpload label="Doc" trigger={<button type="button">Custom trigger</button>} />);

    await user.click(screen.getByText('Custom trigger'));
    expect(clickSpy).toHaveBeenCalled();
  });

  it('supports the render-prop trigger via children', async () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click');
    const user = userEvent.setup();
    render(
      <FileUpload label="Doc">
        {(api) => (
          <button type="button" onClick={api.openFileDialog}>
            Pick ({api.files.length})
          </button>
        )}
      </FileUpload>,
    );

    await user.click(screen.getByText('Pick (0)'));
    expect(clickSpy).toHaveBeenCalled();
  });

  it('reports selected files through onChange (uncontrolled)', () => {
    const onChange = vi.fn();
    render(<FileUpload label="Avatar" onChange={onChange} />);

    fireEvent.change(fileInput(), { target: { files: [makeFile('a.png', 'image/png')] } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]?.[0]?.name).toBe('a.png');
  });

  it('honours a controlled value', () => {
    const onChange = vi.fn();
    const value = [makeFile('locked.png', 'image/png')];
    render(
      <FileUpload label="Avatar" value={value} onChange={onChange}>
        {(api) => <span data-testid="count">{api.files.length}</span>}
      </FileUpload>,
    );

    fireEvent.change(fileInput(), { target: { files: [makeFile('new.png', 'image/png')] } });

    // onChange fires, but the rendered selection stays controlled by the prop.
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByTestId('count').textContent).toBe('1');
  });

  it('sets the multiple attribute on the input when multiple', () => {
    render(<FileUpload label="Gallery" multiple />);
    expect(fileInput().multiple).toBe(true);
    expect(screen.getByRole('button', { name: 'Choose files' })).toBeTruthy();
  });

  it('disables the trigger and input when disabled', () => {
    render(<FileUpload label="Avatar" disabled />);
    expect(fileInput().disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Choose file' })).toHaveProperty('disabled', true);
  });

  it('wires accessibility attributes through FieldControl', () => {
    render(<FileUpload label="Avatar" name="avatar" required error="Required" />);
    const input = fileInput();

    expect(input.getAttribute('name')).toBe('avatar');
    expect(input.id).not.toBe('');
    expect(input.getAttribute('aria-required')).toBe('true');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).not.toBeNull();
    expect(screen.getByText('Required')).toBeTruthy();
  });

  it('renders an accessible dropzone announcing drag state', () => {
    render(<FileUpload label="Files" dropzone multiple aria-label="Upload area" />);
    const zone = screen.getByRole('button', { name: 'Upload area' });

    expect(zone.getAttribute('tabindex')).toBe('0');

    fireEvent.dragEnter(zone, { dataTransfer: { types: ['Files'], files: [] } });
    expect(zone.getAttribute('data-dragging')).toBe('true');

    fireEvent.dragLeave(zone, { dataTransfer: { types: ['Files'], files: [] } });
    expect(zone.getAttribute('data-dragging')).toBeNull();
  });

  it('adds files dropped onto the dropzone', () => {
    const onChange = vi.fn();
    render(<FileUpload label="Files" dropzone multiple onChange={onChange} />);
    const zone = screen.getByRole('button', { name: /drag files/i });

    fireEvent.drop(zone, { dataTransfer: { files: [makeFile('d.txt', 'text/plain')] } });

    expect(onChange.mock.calls[0]?.[0]?.[0]?.name).toBe('d.txt');
  });
});
