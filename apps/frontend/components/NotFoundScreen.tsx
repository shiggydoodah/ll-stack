import { ButtonLink, Heading, Stack, Text } from '@repo/ui/primitives';

export const NOT_FOUND_TITLE = 'Page not found';
export const NOT_FOUND_BODY = "The page you're looking for doesn't exist or may have been moved.";

type NotFoundScreenProps = {
  /** Escape-hatch destination (a `pageRoutes` href). */
  homeHref: string;
  /** Label for the escape-hatch link. */
  homeLabel: string;
  /**
   * `'page'` (default) renders at natural height for shells that centre the
   * content themselves (the public layout); `'panel'` fills and centres inside
   * the members shell's scroll area.
   */
  variant?: 'page' | 'panel';
};

/**
 * The shared 404 content rendered by every not-found boundary. Server-safe (no
 * client hooks) and chrome-agnostic: the boundary decides the surrounding shell
 * (members nav vs public header/footer), this decides only the message. The
 * copy is identical for every viewer and never hints at why the URL failed to
 * resolve. Mirrors `ErrorScreen`'s visual language.
 */
const NotFoundScreen = ({ homeHref, homeLabel, variant = 'page' }: NotFoundScreenProps) => (
  <Stack
    align="center"
    gap="md"
    className={
      variant === 'panel'
        ? 'min-h-[60dvh] justify-center px-6 py-16 text-center'
        : 'px-6 py-16 text-center'
    }
  >
    <p
      aria-hidden="true"
      className="font-display text-7xl leading-none font-black tracking-tight text-(--ui-accent)"
    >
      404
    </p>
    <Heading.H1 size="small" className="uppercase">
      {NOT_FOUND_TITLE}
    </Heading.H1>
    <Text.P tone="subtle" size="small" className="max-w-sm leading-relaxed">
      {NOT_FOUND_BODY}
    </Text.P>
    <div className="pt-2">
      <ButtonLink href={homeHref}>{homeLabel}</ButtonLink>
    </div>
  </Stack>
);

export default NotFoundScreen;
