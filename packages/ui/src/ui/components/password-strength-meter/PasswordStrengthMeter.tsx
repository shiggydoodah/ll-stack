import type { ReactNode } from 'react';

import { cn } from '../../../lib/cn';

/** Numeric password strength level: `0` = no label (empty/invalid), `1` = very weak, `2` = weak, `3` = medium, `4` = strong, `5` = very strong. */
export type PasswordStrength = 0 | 1 | 2 | 3 | 4 | 5;

const STRENGTH_LABELS: Record<PasswordStrength, string> = {
  0: '',
  1: 'Very weak',
  2: 'Weak',
  3: 'Medium',
  4: 'Strong',
  5: 'Very strong',
};

const STRENGTH_TONES: Record<PasswordStrength, string> = {
  0: 'bg-(--ui-border)',
  1: 'bg-(--ui-accent)',
  2: 'bg-(--ui-accent)',
  3: 'bg-tone-amber',
  4: 'bg-tone-green',
  5: 'bg-tone-green',
};

const STRENGTH_TEXT_TONES: Record<PasswordStrength, string> = {
  0: 'text-(--ui-text-subtle)',
  1: 'text-(--ui-accent)',
  2: 'text-(--ui-accent)',
  3: 'text-tone-amber',
  4: 'text-tone-green',
  5: 'text-tone-green',
};

export interface PasswordStrengthMeterProps {
  className?: string;
  strength: PasswordStrength;
  rightContent?: ReactNode;
}

export const PasswordStrengthMeter = ({
  className,
  strength,
  rightContent,
}: PasswordStrengthMeterProps) => {
  const label = STRENGTH_LABELS[strength];
  const textTone = STRENGTH_TEXT_TONES[strength];

  return (
    <div className={cn('mt-2 grid gap-1', className)} data-testid="password-strength">
      <div aria-hidden="true" className="flex gap-1">
        {[1, 2, 3, 4, 5].map((index) => (
          <span
            key={index}
            data-filled={index <= strength ? 'true' : undefined}
            className={cn(
              'h-1 flex-1 rounded-(--ui-radius-sm) transition-colors',
              index <= strength ? STRENGTH_TONES[strength] : 'bg-(--ui-border)/40',
            )}
          />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'text-2xs ui-display-text font-(family-name:--ui-font-display) font-bold',
            textTone,
          )}
        >
          <span aria-live="polite" className="text-2xs font-mono font-bold tracking-normal">
            {strength > 0 ? label : ''}
          </span>
        </span>
        {rightContent !== undefined && (
          <span
            className="text-2xs font-mono text-(--ui-text-subtle)"
            data-testid="password-strength-right-content"
          >
            {rightContent}
          </span>
        )}
      </div>
    </div>
  );
};
