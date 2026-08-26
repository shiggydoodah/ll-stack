'use client';

import { useCallback, useId, useRef, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { ZoomIn, ZoomOut } from 'lucide-react';

import { Button } from '../../primitives/button/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../dialog';

/** Pixel crop rectangle returned to the consumer. Matches react-easy-crop's `Area`. */
export type AvatarCropArea = Area;

/**
 * Props for {@link AvatarCropModal}.
 */
export interface AvatarCropModalProps {
  /** Whether the modal is open. */
  open: boolean;
  /** Object/data URL of the image being cropped. */
  imageSrc: string | null;
  /** Called when the user cancels or dismisses the modal. */
  onCancel: () => void;
  /** Called with the pixel crop rectangle when the user confirms the crop. */
  onConfirm: (area: AvatarCropArea) => void;
  /** Shows a busy state on the confirm button (e.g. while uploading). @defaultValue `false` */
  busy?: boolean;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;

interface CropEditorProps {
  imageSrc: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (area: AvatarCropArea) => void;
}

/**
 * The pan/zoom editor for a single image. Kept separate (and keyed by image src
 * in the parent) so loading a new image resets the crop/zoom state via remount
 * rather than a state-resetting effect.
 */
const CropEditor = ({ imageSrc, busy, onCancel, onConfirm }: CropEditorProps) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const areaRef = useRef<AvatarCropArea | null>(null);
  const zoomInputId = useId();

  const handleCropComplete = useCallback((_area: AvatarCropArea, areaPixels: AvatarCropArea) => {
    areaRef.current = areaPixels;
  }, []);

  const handleConfirm = useCallback(() => {
    if (areaRef.current !== null) onConfirm(areaRef.current);
  }, [onConfirm]);

  return (
    <>
      <div className="relative h-72 w-full overflow-hidden rounded-(--ui-radius-lg) border border-(--ui-border) bg-(--ui-input-background)">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={handleCropComplete}
        />
      </div>

      <div className="flex items-center gap-3">
        <ZoomOut aria-hidden="true" className="shrink-0 text-(--ui-text-subtle)" size={18} />
        <input
          id={zoomInputId}
          name="avatar-crop-zoom"
          type="range"
          aria-label="Zoom"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={ZOOM_STEP}
          value={zoom}
          disabled={busy}
          onChange={(event) => setZoom(Number(event.target.value))}
          className="h-1 w-full cursor-pointer appearance-none rounded-full bg-(--ui-border-strong) accent-(--ui-accent)"
        />
        <ZoomIn aria-hidden="true" className="shrink-0 text-(--ui-text-subtle)" size={18} />
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" tone="neutral" variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" tone="red" loading={busy} onClick={handleConfirm}>
          Save photo
        </Button>
      </div>
    </>
  );
};

/**
 * Square-crop modal for profile avatars. Presentational and controlled: it lets
 * the user pan/zoom over a 1:1 (round-masked) crop area and hands back the pixel
 * crop rectangle via {@link AvatarCropModalProps.onConfirm}. It does not read the
 * pixels or upload — the app layer turns the rectangle into a cropped blob and
 * runs the media pipeline, keeping this component free of encoding/gateway logic.
 */
export const AvatarCropModal = ({
  open,
  imageSrc,
  onCancel,
  onConfirm,
  busy = false,
}: AvatarCropModalProps) => (
  <Dialog
    open={open}
    onOpenChange={(next) => {
      if (!next && !busy) onCancel();
    }}
  >
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Crop your photo</DialogTitle>
        <DialogDescription>
          Drag to reposition and zoom to frame your photo. It will be cropped to a square.
        </DialogDescription>
      </DialogHeader>
      {imageSrc !== null && (
        <CropEditor
          key={imageSrc}
          imageSrc={imageSrc}
          busy={busy}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      )}
    </DialogContent>
  </Dialog>
);
