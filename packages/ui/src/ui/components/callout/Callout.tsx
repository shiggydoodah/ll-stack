import {
  CircleAlert,
  CircleCheck,
  Info,
  Sparkles,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { AriaRole, ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '../../../lib/cn';
import {
  calloutChipBaseClass,
  calloutChipClasses,
  calloutChipSizeClasses,
  calloutIconSize,
  calloutLayoutClass,
  calloutSizeClasses,
  calloutSubtleContainerClass,
  calloutToneClasses,
} from './callout.styles';
import type { CalloutSize, CalloutTone, CalloutVariant } from './callout.styles';

export type { CalloutSize, CalloutTone, CalloutVariant };

/**
 * Default leading icon per tone. Pass `icon` to override, or `icon={null}` to
 * render a callout with no icon. Mirrors `Banner`'s tone → icon mapping.
 */
const defaultToneIcon: Record<CalloutTone, LucideIcon> = {
  neutral: Info,
  red: CircleAlert,
  amber: TriangleAlert,
  green: CircleCheck,
  blue: Info,
  purple: Sparkles,
  magenta: Sparkles,
};

/**
 * Props for {@link Callout}.
 *
 * Extends every standard `div` attribute except `title` (re-typed below to
 * accept rich content). The callout is purely presentational — dismissal state
 * is owned by the caller, not the component.
 */
export interface CalloutProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /**
   * Tone scope for the callout.
   *
   * @defaultValue `'neutral'`
   */
  tone?: CalloutTone;

  /**
   * Visual treatment. `'subtle'` is the neutral box with a tone-coloured icon
   * chip; the others are tone-tinted containers shared with {@link Banner}.
   *
   * @defaultValue `'subtle'`
   */
  variant?: CalloutVariant;

  /**
   * Density of padding, text, and icon.
   *
   * @defaultValue `'md'`
   */
  size?: CalloutSize;

  /** Emphasised heading rendered above the message body. */
  title?: ReactNode;

  /** Message body. */
  children?: ReactNode;

  /**
   * Leading icon. Defaults to a tone-appropriate icon. Pass `null` to hide it.
   */
  icon?: ReactNode;

  /** Call-to-action slot rendered under the message (e.g. a `<Button />`). */
  action?: ReactNode;

  /**
   * Whether the callout renders a dismiss (X) control.
   *
   * @defaultValue `false`
   */
  dismissible?: boolean;

  /** Called when the dismiss control is activated. */
  onDismiss?: () => void;

  /**
   * Accessible label for the dismiss control.
   *
   * @defaultValue `'Dismiss'`
   */
  dismissLabel?: string;
}

const getDefaultRole = (tone: CalloutTone): AriaRole =>
  tone === 'red' || tone === 'amber' ? 'alert' : 'status';

/**
 * Inline, in-content notice — the small-scale sibling of {@link Banner}. Use it
 * for contextual hints, warnings, and confirmations inside forms, cards, and
 * page sections. Styled with the shared tone classes to match the rest of the
 * UI library.
 *
 * @example
 * ```tsx
 * <Callout tone="amber" size="sm">
 *   This link will be verified after you confirm.
 * </Callout>
 *
 * <Callout tone="red" variant="soft" title="Username taken">
 *   That username was claimed while you were setting up your profile.
 * </Callout>
 * ```
 */
export const Callout = ({
  tone = 'neutral',
  variant = 'subtle',
  size = 'md',
  title,
  children,
  icon,
  action,
  dismissible = false,
  onDismiss,
  dismissLabel = 'Dismiss',
  role,
  className,
  ...props
}: CalloutProps) => {
  const isSubtle = variant === 'subtle';
  // Center the icon and dismiss control for single-block callouts; top-align
  // when there's a title or action so the icon sits beside the first line.
  const isRich = title != null || action != null;
  const DefaultIcon = defaultToneIcon[tone];
  const resolvedIcon =
    icon === undefined ? <DefaultIcon size={calloutIconSize[size]} aria-hidden="true" /> : icon;

  return (
    <div
      role={role ?? getDefaultRole(tone)}
      className={cn(
        calloutLayoutClass(),
        calloutSizeClasses[size],
        isRich ? 'items-start' : 'items-center',
        isSubtle ? calloutSubtleContainerClass : calloutToneClasses[tone][variant],
        className,
      )}
      {...props}
    >
      {resolvedIcon ? (
        isSubtle ? (
          <span
            className={cn(
              calloutChipBaseClass,
              calloutChipSizeClasses[size],
              calloutChipClasses[tone],
            )}
          >
            {resolvedIcon}
          </span>
        ) : (
          <span className={cn('shrink-0', isRich && 'mt-0.5')}>{resolvedIcon}</span>
        )
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title ? (
          <p className={cn('font-display font-bold', isSubtle && 'text-(--ui-foreground)')}>
            {title}
          </p>
        ) : null}
        {children ? (
          <div className={cn('leading-snug', isSubtle ? 'text-(--ui-text-subtle)' : 'opacity-90')}>
            {children}
          </div>
        ) : null}
        {action ? <div className="mt-2 flex flex-wrap gap-2">{action}</div> : null}
      </div>
      {dismissible ? (
        <button
          type="button"
          aria-label={dismissLabel}
          onClick={onDismiss}
          className={cn(
            '-mr-1 inline-flex shrink-0 items-center justify-center rounded-(--ui-radius-sm) p-1 opacity-70 transition hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current',
            isRich && '-mt-1',
          )}
        >
          <X size={16} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
};
