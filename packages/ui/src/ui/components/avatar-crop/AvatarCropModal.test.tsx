// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AvatarCropModal, type AvatarCropModalProps } from './AvatarCropModal';

// Hoisted so the (hoisted) vi.mock factory below can reference it.
const { MOCK_CROP_PIXELS } = vi.hoisted(() => ({
  MOCK_CROP_PIXELS: { x: 10, y: 20, width: 120, height: 120 },
}));

// react-easy-crop reads the image and observes layout; jsdom can do neither.
// Stub it with a component that immediately reports a completed crop so the
// confirm path has pixel coordinates to hand back, the way the real cropper
// fires onCropComplete once the image settles.
vi.mock('react-easy-crop', () => ({
  default: ({
    onCropComplete,
  }: {
    onCropComplete?: (area: unknown, areaPixels: unknown) => void;
  }) => {
    onCropComplete?.({ x: 0, y: 0, width: 0, height: 0 }, MOCK_CROP_PIXELS);
    return <div data-testid="cropper" />;
  },
}));

beforeAll(() => {
  // Radix's scroll-lock measures layout via ResizeObserver; jsdom lacks it.
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

const renderModal = (overrides: Partial<AvatarCropModalProps> = {}) => {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  const utils = render(
    <AvatarCropModal
      imageSrc="blob:avatar"
      onCancel={onCancel}
      onConfirm={onConfirm}
      open
      {...overrides}
    />,
  );

  return { ...utils, onCancel, onConfirm };
};

describe('AvatarCropModal', () => {
  it('renders the dialog, copy and editor controls when open with an image', () => {
    renderModal();

    expect(screen.getByRole('dialog')).not.toBeNull();
    expect(screen.getByText('Crop your photo')).not.toBeNull();
    expect(screen.getByText(/Drag to reposition/)).not.toBeNull();
    expect(screen.getByTestId('cropper')).not.toBeNull();
    expect(screen.getByLabelText('Zoom')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Save photo' })).not.toBeNull();
  });

  it('renders nothing when closed', () => {
    renderModal({ open: false });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the dialog shell but no editor when there is no image', () => {
    renderModal({ imageSrc: null });

    expect(screen.getByRole('dialog')).not.toBeNull();
    expect(screen.queryByTestId('cropper')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save photo' })).toBeNull();
    expect(screen.queryByLabelText('Zoom')).toBeNull();
  });

  it('calls onCancel when the Cancel button is clicked', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { onCancel } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('confirms with the completed crop area when Save photo is clicked', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { onConfirm } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Save photo' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(MOCK_CROP_PIXELS);
  });

  it('calls onCancel when Escape dismisses the dialog', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { onCancel } = renderModal();

    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('exposes the zoom range bounds and updates the slider on change', () => {
    renderModal();
    const slider = screen.getByLabelText('Zoom') as HTMLInputElement;

    expect(slider.min).toBe('1');
    expect(slider.max).toBe('3');
    expect(slider.step).toBe('0.1');
    expect(slider.value).toBe('1');

    fireEvent.change(slider, { target: { value: '2' } });

    expect(slider.value).toBe('2');
  });

  describe('when busy', () => {
    it('disables the cancel button and zoom slider and marks save busy', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      const { onConfirm } = renderModal({ busy: true });

      expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(
        true,
      );
      expect((screen.getByLabelText('Zoom') as HTMLInputElement).disabled).toBe(true);

      const save = screen.getByRole('button', { name: 'Save photo' }) as HTMLButtonElement;
      // A loading Button stays focusable (aria-disabled, not native disabled)
      // so keyboard focus isn't dropped mid-upload; clicks are suppressed.
      expect(save.disabled).toBe(false);
      expect(save.getAttribute('aria-disabled')).toBe('true');
      expect(save.getAttribute('aria-busy')).toBe('true');

      await user.click(save);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('does not call onCancel when Escape is pressed', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      const { onCancel } = renderModal({ busy: true });

      await user.keyboard('{Escape}');

      expect(onCancel).not.toHaveBeenCalled();
    });
  });
});
