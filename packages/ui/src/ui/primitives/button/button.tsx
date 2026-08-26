import type {
  ComponentPropsWithoutRef,
  MouseEvent,
  MouseEventHandler,
  ReactElement,
  ReactNode,
} from 'react';

import { cn } from '../../../lib/cn';
import { Spinner } from '../spinner/Spinner';
import { buttonLayoutClass, buttonToneClasses, iconButtonLayoutClass } from './button.styles';
import type { ButtonSize, ButtonTone, ButtonVariant } from './button.styles';

export type { ButtonSize, ButtonTone, ButtonVariant };
export type IconButtonShape = 'square' | 'circle';

type ButtonSharedProps = {
  /**
   * Visual treatment applied using shared UI variant classes.
   *
   * @defaultValue `'solid'`
   */
  variant?: ButtonVariant;

  /**
   * Tone scope for the button.
   *
   * @defaultValue `'red'`
   */
  tone?: ButtonTone;

  /**
   * Button size token.
   *
   * @defaultValue `'medium'`
   */
  size?: ButtonSize;

  /**
   * Whether the button should fill the available inline space.
   *
   * @defaultValue `false`
   */
  fullWidth?: boolean;

  /**
   * Whether the button should show a spinner and suppress interaction.
   *
   * @defaultValue `false`
   */
  loading?: boolean;
};

/**
 * Props for {@link Button}.
 *
 * Extends {@link ButtonSharedProps} with every standard HTML `button` attribute
 * except `color`. `children` is required and accepts any renderable node.
 */
export interface ButtonProps
  extends ButtonSharedProps, Omit<ComponentPropsWithoutRef<'button'>, 'children' | 'color'> {
  children: ReactNode;
}

/**
 * Props for {@link ButtonLink}.
 *
 * Extends {@link ButtonSharedProps} with anchor attributes. `href` is required;
 * `target` defaults to `'_self'`. Opening with `target="_blank"` automatically
 * appends `noopener noreferrer` to `rel`.
 */
export interface ButtonLinkProps
  extends
    ButtonSharedProps,
    Omit<ComponentPropsWithoutRef<'a'>, 'children' | 'color' | 'href' | 'target'> {
  children: ReactNode;
  href: string;
  target?: ComponentPropsWithoutRef<'a'>['target'];
  disabled?: boolean;
}

/**
 * Props for {@link IconButton}.
 *
 * Extends {@link ButtonSharedProps} with a required `aria-label` and a single
 * icon child. `shape` controls whether the button renders square or circular.
 */
export interface IconButtonProps
  extends
    ButtonSharedProps,
    Omit<ComponentPropsWithoutRef<'button'>, 'aria-label' | 'children' | 'color'> {
  'aria-label': string;
  children: ReactElement;

  /**
   * Icon-only button shape.
   *
   * @defaultValue `'square'`
   */
  shape?: IconButtonShape;
}

const getInteractiveClass = (disabled: boolean, loading: boolean) => {
  if (disabled && !loading) return 'cursor-not-allowed opacity-70';
  if (loading) return 'cursor-wait';
  return 'hover:brightness-110';
};

/**
 * Applied to the native `<button>` primitives while only `loading`.
 *
 * A loading-only button stays enabled — marked with `aria-disabled` rather than
 * native `disabled` — so keyboard focus is not silently dropped mid-interaction.
 * Activation is then suppressed declaratively instead of with JS: this class
 * stops the click reaching the element or bubbling to an ancestor, and the
 * primitives swap `type` to `'button'` so Enter/Space cannot submit the
 * surrounding form. Both are plain attributes, so the primitive emits no
 * function prop and stays renderable from a Server Component.
 *
 * `cursor-wait` from {@link getInteractiveClass} is inert while pointer events
 * are off; the busy affordance is carried by the spinner and `aria-busy`.
 */
const loadingSuppressionClass = 'pointer-events-none';

const spinnerSize = {
  xsmall: 'xs',
  small: 'sm',
  medium: 'sm',
  large: 'md',
  xlarge: 'md',
} satisfies Record<ButtonSize, ComponentPropsWithoutRef<typeof Spinner>['size']>;

/**
 * Builds the click handler for a button primitive — or `undefined` when none is
 * needed.
 *
 * The host element carries a function `onClick` prop only when one is genuinely
 * required. A function prop on a host element cannot be serialised across the
 * server→client boundary, so omitting it lets the primitive render directly from
 * a React Server Component.
 *
 * A handler is needed only when:
 * - the caller supplied an `onClick` (forwarded when active, suppressed while
 *   `disabled`/`loading`); or
 * - the element must suppress the activation itself while `disabled`/`loading`
 *   and has no declarative way to do so. `hasDeclarativeSuppression` is `true`
 *   for the native `<button>` primitives: an explicit `disabled` renders the
 *   native attribute (a disabled `<button>` never dispatches a click), and
 *   `loading` alone keeps the element enabled — focusable via `aria-disabled` —
 *   but swaps in `type="button"` plus `pointer-events-none`, which blocks the
 *   click and any implicit form submission without JS. A suppression handler is
 *   redundant in both states. It is `false` for `ButtonLink`'s `<a>`, which has
 *   no native `disabled`, so the handler is the only thing that can
 *   `preventDefault` + `stopPropagation` while suppressed.
 *
 * Otherwise this returns `undefined`, leaving the rendered host element free of
 * any function prop — so a native-`<button>` primitive stays serialisable from a
 * Server Component even while `disabled`/`loading`, not only when enabled.
 */
const composeButtonClickHandler = <TElement extends HTMLElement>({
  disabled,
  loading,
  onClick,
  hasDeclarativeSuppression,
}: {
  disabled: boolean;
  loading: boolean;
  onClick?: MouseEventHandler<TElement>;
  hasDeclarativeSuppression: boolean;
}): MouseEventHandler<TElement> | undefined => {
  const needsSuppressionHandler = (disabled || loading) && !hasDeclarativeSuppression;

  if (!onClick && !needsSuppressionHandler) {
    return undefined;
  }

  return (event: MouseEvent<TElement>) => {
    if (disabled || loading) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onClick?.(event);
  };
};

const getSafeLinkRel = (
  target: ComponentPropsWithoutRef<'a'>['target'],
  rel: ComponentPropsWithoutRef<'a'>['rel'],
) => {
  if (target !== '_blank') return rel;
  const relTokens = new Set((rel ?? '').split(/\s+/).filter(Boolean));
  relTokens.add('noopener');
  relTokens.add('noreferrer');
  return Array.from(relTokens).join(' ');
};

/**
 * Shared text button for actions and form submissions.
 */
export const Button = ({
  type = 'button',
  variant = 'solid',
  tone = 'red',
  size = 'medium',
  fullWidth = false,
  loading = false,
  disabled = false,
  className,
  children,
  onClick,
  ...props
}: ButtonProps) => {
  const isLoadingOnly = loading && !disabled;

  return (
    <button
      type={isLoadingOnly ? 'button' : type}
      className={cn(
        buttonLayoutClass({ size, fullWidth }),
        buttonToneClasses[tone][variant],
        getInteractiveClass(disabled, loading),
        isLoadingOnly && loadingSuppressionClass,
        className,
      )}
      disabled={disabled}
      aria-disabled={isLoadingOnly || undefined}
      aria-busy={loading || undefined}
      onClick={composeButtonClickHandler<HTMLButtonElement>({
        disabled,
        loading,
        onClick,
        hasDeclarativeSuppression: true,
      })}
      {...props}
    >
      {loading && <Spinner size={spinnerSize[size]} />}
      {children}
    </button>
  );
};

/**
 * Anchor element styled with the shared button treatment.
 */
export const ButtonLink = ({
  variant = 'solid',
  tone = 'red',
  size = 'medium',
  fullWidth = false,
  loading = false,
  disabled = false,
  className,
  children,
  href,
  target = '_self',
  onClick,
  tabIndex,
  rel: providedRel,
  ...props
}: ButtonLinkProps) => {
  const isSuppressed = disabled || loading;
  const rel = getSafeLinkRel(target, providedRel);

  return (
    <a
      className={cn(
        buttonLayoutClass({ size, fullWidth }),
        buttonToneClasses[tone][variant],
        getInteractiveClass(disabled, loading),
        className,
      )}
      href={isSuppressed ? undefined : href}
      target={target}
      rel={rel}
      aria-disabled={isSuppressed || undefined}
      aria-busy={loading || undefined}
      tabIndex={isSuppressed ? -1 : tabIndex}
      onClick={composeButtonClickHandler<HTMLAnchorElement>({
        disabled,
        loading,
        onClick,
        hasDeclarativeSuppression: false,
      })}
      {...props}
    >
      {loading && <Spinner size={spinnerSize[size]} />}
      {children}
    </a>
  );
};

/**
 * Accessible icon-only action button.
 */
export const IconButton = ({
  type = 'button',
  variant = 'ghost',
  tone = 'red',
  size = 'medium',
  fullWidth = false,
  loading = false,
  disabled = false,
  shape = 'square',
  className,
  children,
  onClick,
  ...props
}: IconButtonProps) => {
  const isLoadingOnly = loading && !disabled;

  return (
    <button
      type={isLoadingOnly ? 'button' : type}
      className={cn(
        iconButtonLayoutClass({ size, shape, fullWidth }),
        buttonToneClasses[tone][variant],
        getInteractiveClass(disabled, loading),
        isLoadingOnly && loadingSuppressionClass,
        className,
      )}
      disabled={disabled}
      aria-disabled={isLoadingOnly || undefined}
      aria-busy={loading || undefined}
      onClick={composeButtonClickHandler<HTMLButtonElement>({
        disabled,
        loading,
        onClick,
        hasDeclarativeSuppression: true,
      })}
      {...props}
    >
      {loading ? (
        <Spinner size={spinnerSize[size]} decorative={false} label={props['aria-label']} />
      ) : (
        children
      )}
    </button>
  );
};
