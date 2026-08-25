import type { ReactNode } from 'react';

import { cn } from '../../../lib/cn';
import { fieldLabelBaseClass } from './fieldLabel.styles';

export interface FieldGroupLabelProps {
  children: ReactNode;
  className?: string;
  hint?: ReactNode;
}

/**
 * Presentational uppercase heading for control groups that are not a single
 * form input — chip selectors, the height unit row, the interests picker, the
 * per-field visibility sections. Mirrors `FieldLabel`'s visual treatment via the
 * shared {@link fieldLabelBaseClass} but is field-context-free: it renders a
 * standalone `<p>` and takes an optional inline `hint`.
 *
 * @example
 * ```tsx
 * <FieldGroupLabel hint="· pick or add your own">Interests</FieldGroupLabel>
 * ```
 */
export const FieldGroupLabel = ({ children, className, hint }: FieldGroupLabelProps) => (
  <p className={cn(fieldLabelBaseClass, className)}>
    {children}
    {hint ? <span className="text-(--ui-text-muted) normal-case">{hint}</span> : null}
  </p>
);
