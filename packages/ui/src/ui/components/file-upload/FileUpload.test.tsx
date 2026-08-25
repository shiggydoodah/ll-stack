// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FileUpload } from './FileUpload';
import { useFileUpload, type FileUploadError } from '../../hooks/useFileUpload';

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

// ── Hook: validation ────────────────────────────────────────────────────────

describe('useFileUpload validation', () => {
  it('accepts MIME wildcards and rejects non-matching types', () => {
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useFileUpload({ accept: 'image/*', multiple: true, onError }),
    );

    act(() => {
      result.current.addFiles([
        makeFile('a.png', 'image/png'),
        makeFile('b.pdf', 'application/pdf'),
      ]);
    });

    expect(result.current.files.map((f) => f.name)).toEqual(['a.png']);
    const errors = onError.mock.calls[0]?.[0] as FileUploadError[];
    expect(errors[0]?.code).toBe('file-invalid-type');
  });

  it('accepts files by extension', () => {
    const { result } = renderHook(() => useFileUpload({ accept: ['.pdf'], multiple: true }));

    act(() => {
      result.current.addFiles([makeFile('doc.pdf', ''), makeFile('img.png', 'image/png')]);
    });

    expect(result.current.files.map((f) => f.name)).toEqual(['doc.pdf']);
  });

  it('rejects files larger than maxSize', () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useFileUpload({ maxSize: 10, multiple: true, onError }));

    act(() => {
      result.current.addFiles([makeFile('big.bin', '', 50)]);
    });

    expect(result.current.files).toHaveLength(0);
    expect(onError.mock.calls[0]?.[0]?.[0]?.code).toBe('file-too-large');
  });

  it('caps the selection at maxFiles and reports too-many-files', () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useFileUpload({ maxFiles: 2, multiple: true, onError }));

    act(() => {
      result.current.addFiles([
        makeFile('1.txt', 'text/plain'),
        makeFile('2.txt', 'text/plain'),
        makeFile('3.txt', 'text/plain'),
      ]);
    });

    expect(result.current.files).toHaveLength(2);
    expect(onError.mock.calls[0]?.[0]?.[0]?.code).toBe('too-many-files');
  });

  it('flags hasCountError when below minFiles', () => {
    const { result } = renderHook(() => useFileUpload({ minFiles: 2, multiple: true }));

    act(() => {
      result.current.addFiles([makeFile('1.txt', 'text/plain')]);
    });

    expect(result.current.hasCountError).toBe(true);
  });

  it('replaces selection in single mode and appends in multiple mode', () => {
    const single = renderHook(() => useFileUpload());
    act(() => single.result.current.addFiles([makeFile('a.txt', 'text/plain')]));
    act(() => single.result.current.addFiles([makeFile('b.txt', 'text/plain')]));
    expect(single.result.current.files.map((f) => f.name)).toEqual(['b.txt']);

    const multi = renderHook(() => useFileUpload({ multiple: true }));
    act(() => multi.result.current.addFiles([makeFile('a.txt', 'text/plain')]));
    act(() => multi.result.current.addFiles([makeFile('b.txt', 'text/plain')]));
    expect(multi.result.current.files.map((f) => f.name)).toEqual(['a.txt', 'b.txt']);
  });

  it('removes by index and reference and clears all', () => {
    const { result } = renderHook(() => useFileUpload({ multiple: true }));
    const a = makeFile('a.txt', 'text/plain');
    const b = makeFile('b.txt', 'text/plain');

    act(() => result.current.addFiles([a, b]));
    act(() => result.current.removeFile(0));
    expect(result.current.files).toEqual([b]);

    act(() => result.current.removeFile(b));
    expect(result.current.files).toEqual([]);

    act(() => result.current.addFiles([a, b]));
    act(() => result.current.clearFiles());
    expect(result.current.files).toEqual([]);
  });

  it('does nothing when disabled', () => {
    const { result } = renderHook(() => useFileUpload({ disabled: true }));
    act(() => result.current.addFiles([makeFile('a.txt', 'text/plain')]));
    expect(result.current.files).toHaveLength(0);
  });

  it('toggles isDragging across drag enter/leave/drop', () => {
    const { result } = renderHook(() => useFileUpload({ multiple: true }));
    const noop = { preventDefault() {} };

    act(() => result.current.dragHandlers.onDragEnter({ ...noop } as never));
    expect(result.current.isDragging).toBe(true);

    act(() => result.current.dragHandlers.onDragLeave({ ...noop } as never));
    expect(result.current.isDragging).toBe(false);

    act(() =>
      result.current.dragHandlers.onDrop({
        ...noop,
        dataTransfer: { files: [makeFile('d.txt', 'text/plain')] },
      } as never),
    );
    expect(result.current.isDragging).toBe(false);
    expect(result.current.files.map((f) => f.name)).toEqual(['d.txt']);
  });
});

// ── Component ─────────────────────────────────────────────────────────────────

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

    fireEvent.dragEnter(zone, { dataTransfer: { files: [] } });
    expect(zone.getAttribute('data-dragging')).toBe('true');

    fireEvent.dragLeave(zone, { dataTransfer: { files: [] } });
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
