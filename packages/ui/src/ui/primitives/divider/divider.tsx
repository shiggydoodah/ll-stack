import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';

import { cn } from '../../../lib/cn';
import {
  dividerBaseClass,
  dividerLineClass,
  dividerThicknessClasses,
  dividerToneClasses,
} from './divider.styles';
import type { DividerLabelAlign, DividerThickness, DividerTone } from './divider.styles';

/**
 * Props for {@link Divider}.
 */
export interface DividerProps extends ComponentPropsWithoutRef<'div'> {
  /** Controls the opacity of the divider (lines and label). Defaults to `neutral`. */
  tone?: DividerTone;
  /** Line height. Defaults to `thin`. */
  thickness?: DividerThickness;
  /** Optional text label rendered inside the divider. */
  label?: ReactNode;
  /** Horizontal alignment of the label. Defaults to `center`. */
  labelAlign?: DividerLabelAlign;
  /** Not used — Divider renders its own children structure. */
  children?: never;
  /** Not forwarded. */
  color?: never;
  ref?: Ref<HTMLDivElement>;
}

/**
 * Horizontal rule that optionally carries a text label.
 *
 * @example
 * ```tsx
 * <Divider />
 * <Divider label="or" />
 * <Divider label="Section" labelAlign="start" tone="strong" />
 * ```
 */
export const Divider = ({
  tone = 'neutral',
  thickness = 'thin',
  label,
  labelAlign = 'center',
  className,
  ref,
  ...props
}: DividerProps) => {
  const lineClass = cn(dividerLineClass, dividerThicknessClasses[thickness]);
  const hasLabel = label != null;

  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation="horizontal"
      className={cn(dividerBaseClass, dividerToneClasses[tone], className)}
      {...props}
    >
      {/* Leading line: shown for center and end alignments */}
      {hasLabel && labelAlign !== 'start' && <span className={lineClass} />}

      {/* Full-width line when no label */}
      {!hasLabel && <span className={lineClass} />}

      {hasLabel && (
        <span className="shrink-0 text-xs font-medium text-current opacity-60">{label}</span>
      )}

      {/* Trailing line: shown for center and start alignments */}
      {hasLabel && labelAlign !== 'end' && <span className={lineClass} />}
    </div>
  );
};
