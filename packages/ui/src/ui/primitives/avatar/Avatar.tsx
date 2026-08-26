import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';
import { Slot } from '@radix-ui/react-slot';

import { cn } from '../../../lib/cn';
import { StatusDot } from '../status-dot';
import type { StatusDotTone } from '../status-dot';
import {
  avatarBaseClass,
  avatarInitialsClass,
  avatarRingClass,
  avatarSizeClasses,
} from './avatar.styles';
import type { AvatarSize } from './avatar.styles';

export type { AvatarSize };

interface AvatarBaseProps extends Omit<ComponentPropsWithoutRef<'span'>, 'color'> {
  /** Uppercase initials shown when no image is supplied. */
  initials?: string;

  /**
   * Avatar size token.
   *
   * @defaultValue `'md'`
   */
  size?: AvatarSize;

  /** Show the presence indicator dot. */
  online?: boolean;

  /**
   * Tone of the presence dot when {@link online} is set.
   *
   * @defaultValue `'green'`
   */
  statusTone?: StatusDotTone;

  /** Render an accent ring around the avatar. */
  ring?: boolean;

  /**
   * Render the consumer's own image element (e.g. a Next.js `next/image`)
   * instead of the built-in `<img>`, merging the avatar image styling onto it.
   * Keeps this package free of any framework image dependency: the consumer
   * supplies the optimized element.
   *
   * The supplied {@link children} must be a single element carrying its own
   * `src`/`alt`. In this mode the caller owns the image-vs-initials choice —
   * use `asChild` only when there is an image, otherwise pass {@link initials}.
   *
   * @defaultValue `false`
   */
  asChild?: boolean;

  /** Image element rendered when {@link asChild} is set. */
  children?: ReactNode;

  ref?: Ref<HTMLSpanElement>;
}

/**
 * Image source props: supplying `src` requires `alt` so the built-in `<img>`
 * always has an accessible name. Without `src` there is nothing for `alt` to
 * describe (initials are their own accessible text), so it is disallowed.
 */
type AvatarImageProps =
  | {
      /** Image source rendered in place of initials. Ignored when `asChild` is set. */
      src: string;
      /** Accessible name for the image. */
      alt: string;
    }
  | { src?: undefined; alt?: never };

/**
 * Props for {@link Avatar}.
 */
export type AvatarProps = AvatarBaseProps & AvatarImageProps;

/**
 * Circular user avatar with initials fallback and optional online indicator.
 *
 * @example
 * ```tsx
 * <Avatar initials="MB" size="sm" online />
 * <Avatar src="/me.jpg" alt="Marcus" size="lg" ring />
 *
 * // Bring your own optimized image (e.g. Next.js next/image) without making
 * // this package depend on the framework — the caller owns the image branch:
 * avatarUrl ? (
 *   <Avatar asChild size="sm">
 *     <Image src={avatarUrl} alt="Marcus" fill sizes="48px" />
 *   </Avatar>
 * ) : (
 *   <Avatar initials="MB" size="sm" />
 * )
 * ```
 */
export const Avatar = ({
  initials,
  size = 'md',
  src,
  alt,
  online = false,
  statusTone = 'green',
  ring = false,
  asChild = false,
  children,
  className,
  ...props
}: AvatarProps) => {
  const imageClass = cn('size-full rounded-full object-cover', ring && avatarRingClass);

  return (
    <span className={cn(avatarBaseClass, avatarSizeClasses[size], className)} {...props}>
      {asChild ? (
        <Slot className={imageClass}>{children}</Slot>
      ) : src ? (
        <img src={src} alt={alt ?? ''} className={imageClass} />
      ) : (
        // The initials text is the accessible content; an aria-label on a
        // role-less span is unreliably announced, so none is set.
        <span className={cn(avatarInitialsClass, ring && avatarRingClass)}>{initials}</span>
      )}
      {online && (
        <StatusDot
          tone={statusTone}
          ring
          aria-hidden="true"
          className="absolute right-0 bottom-0 size-1/4"
        />
      )}
    </span>
  );
};
