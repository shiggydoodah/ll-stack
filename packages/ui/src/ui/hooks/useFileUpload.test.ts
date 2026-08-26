// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useFileUpload, type FileUploadError } from './useFileUpload';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Pinned lastModified so two calls with the same name/size compare as the same
// file (the duplicate check keys on name + size + lastModified).
const makeFile = (name: string, type: string, size = 8, lastModified = 1_700_000_000_000): File =>
  new File([new Uint8Array(size)], name, { type, lastModified });

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

  it('rejects a file already in the selection as duplicate-file', () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useFileUpload({ multiple: true, onError }));

    act(() => {
      result.current.addFiles([makeFile('a.txt', 'text/plain')]);
    });
    act(() => {
      result.current.addFiles([makeFile('a.txt', 'text/plain')]);
    });

    // The re-added file is rejected, the selection is unchanged.
    expect(result.current.files.map((f) => f.name)).toEqual(['a.txt']);
    const errors = onError.mock.calls[0]?.[0] as FileUploadError[];
    expect(errors).toHaveLength(1);
    expect(errors[0]?.code).toBe('duplicate-file');
    expect(errors[0]?.file?.name).toBe('a.txt');
    expect(result.current.errors[0]?.code).toBe('duplicate-file');
  });

  it('rejects duplicates within a single batch', () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useFileUpload({ multiple: true, onError }));

    act(() => {
      result.current.addFiles([
        makeFile('a.txt', 'text/plain'),
        makeFile('a.txt', 'text/plain'),
        makeFile('b.txt', 'text/plain'),
      ]);
    });

    expect(result.current.files.map((f) => f.name)).toEqual(['a.txt', 'b.txt']);
    expect(onError.mock.calls[0]?.[0]?.[0]?.code).toBe('duplicate-file');
  });

  it('does not flag a same-named file with a different lastModified as duplicate', () => {
    const { result } = renderHook(() => useFileUpload({ multiple: true }));

    act(() => {
      result.current.addFiles([makeFile('a.txt', 'text/plain', 8, 1)]);
    });
    act(() => {
      result.current.addFiles([makeFile('a.txt', 'text/plain', 8, 2)]);
    });

    expect(result.current.files).toHaveLength(2);
    expect(result.current.errors).toHaveLength(0);
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
    const fileDrag = { preventDefault() {}, dataTransfer: { types: ['Files'] } };

    act(() => result.current.dragHandlers.onDragEnter({ ...fileDrag } as never));
    expect(result.current.isDragging).toBe(true);

    act(() => result.current.dragHandlers.onDragLeave({ ...fileDrag } as never));
    expect(result.current.isDragging).toBe(false);

    act(() =>
      result.current.dragHandlers.onDrop({
        ...fileDrag,
        dataTransfer: { types: ['Files'], files: [makeFile('d.txt', 'text/plain')] },
      } as never),
    );
    expect(result.current.isDragging).toBe(false);
    expect(result.current.files.map((f) => f.name)).toEqual(['d.txt']);
  });

  it('ignores drags that do not carry files (text/link drags)', () => {
    const { result } = renderHook(() => useFileUpload({ multiple: true }));
    const textDrag = {
      preventDefault() {},
      dataTransfer: { types: ['text/plain', 'text/uri-list'] },
    };

    act(() => result.current.dragHandlers.onDragEnter({ ...textDrag } as never));
    expect(result.current.isDragging).toBe(false);

    // A drag with no dataTransfer at all is equally inert.
    act(() => result.current.dragHandlers.onDragEnter({ preventDefault() {} } as never));
    expect(result.current.isDragging).toBe(false);
  });
});
