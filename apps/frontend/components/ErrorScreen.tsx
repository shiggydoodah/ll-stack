'use client';

import { startTransition, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@repo/ui';
import { Button, ButtonLink, Heading, Row, Stack, Text } from '@repo/ui/primitives';
import { TriangleAlert } from '@repo/ui/icons';
import { EXPECTED_ERROR_CODES } from '@/lib/errors/expected-error-codes';
import { parseBoundaryError } from '@/lib/errors/parse-boundary-error';
import { clientLogger } from '@/lib/logging/client-logger';
import { FRONTEND_LOG_EVENTS } from '@/lib/logging/log-events';

export const ERROR_SCREEN_GENERIC_TITLE = 'Something went wrong';
export const ERROR_SCREEN_GENERIC_BODY =
  'An unexpected error occurred — it wasn’t anything you did. You can try again, and if it keeps happening, let us know.';
export const ERROR_SCREEN_GENERIC_RETRY = 'Try again';
export const ERROR_SCREEN_REFERENCE_LABEL = 'Error reference:';

type ErrorScreenProps = {
  /** The boundary's error prop (production servers strip everything but `digest`). */
  error: Error & { digest?: string };
  /** The boundary's reset prop. */
  reset: () => void;
  /** Boundary placement label carried on the log records (e.g. `'members'`). */
  scope: string;
  /**
   * Log severity for the unexpected classification. The global boundary
   * escalates to `'fatal'`; everything else stays `'error'`.
   */
  level?: 'error' | 'fatal';
  /** Optional secondary escape hatch (a `pageRoutes` href). */
  homeHref?: string;
  /** Label for the `homeHref` link. */
  homeLabel?: string;
  /**
   * `'viewport'` fills the screen (root/global boundaries and shell-less
   * groups); `'panel'` sits inside a group layout's still-mounted shell.
   */
  variant?: 'viewport' | 'panel';
};

/**
 * The branded error boundary screen (frontend-error-boundaries epic). Classifies
 * the caught error once via `parseBoundaryError`: an expected error renders its
 * registered per-code catalog copy at `warn`; anything else renders the generic
 * copy with the digest as a support reference code, logged at `error`/`fatal`.
 * Copy comes ONLY from the catalog or the generic constants — never
 * `error.message` (a leak vector in dev, stripped in production anyway).
 */
const ErrorScreen = ({
  error,
  reset,
  scope,
  level = 'error',
  homeHref,
  homeLabel = 'Go home',
  variant = 'viewport',
}: ErrorScreenProps) => {
  const router = useRouter();
  const classification = useMemo(() => parseBoundaryError(error), [error]);

  useEffect(() => {
    // One record per caught error instance. The server logs its own twin of the
    // same failure (server.error.unhandled, step 03) joined on `digest` — the
    // double record is deliberate: the server one carries pre-stripping detail,
    // this one proves what the member actually saw. Do not deduplicate.
    if (classification.kind === 'expected') {
      clientLogger.warn(FRONTEND_LOG_EVENTS['client.error.expected'], {
        event: FRONTEND_LOG_EVENTS['client.error.expected'],
        code: classification.code,
        // The expected classification implies a digest — keep it on the record
        // so this joins to the server.error.unhandled twin without dashboards
        // having to reconstruct the expected:<CODE> prefix from `code`.
        digest: error.digest,
        scope,
      });
      return;
    }
    clientLogger[level](FRONTEND_LOG_EVENTS['client.error.boundary'], {
      event: FRONTEND_LOG_EVENTS['client.error.boundary'],
      scope,
      digest: classification.digest,
      errorMessage: error.message,
      stack: error.stack,
    });
  }, [error, classification, level, scope]);

  const copy =
    classification.kind === 'expected' ? EXPECTED_ERROR_CODES[classification.code] : undefined;
  const referenceDigest = classification.kind === 'unexpected' ? classification.digest : undefined;

  const retry = (): void => {
    // reset() alone only re-renders the client tree — it does NOT refetch
    // server-component data, so it cannot recover a transient RSC failure.
    // router.refresh() refetches the RSC payload; the transition keeps both in
    // one render pass.
    startTransition(() => {
      router.refresh();
      reset();
    });
  };

  return (
    <div
      className={cn(
        'flex items-center justify-center bg-(--ui-background) px-4 text-(--ui-foreground)',
        variant === 'viewport' ? 'min-h-dvh' : 'min-h-full py-10',
      )}
    >
      <Stack role="alert" align="center" gap="md" className="px-6 py-16 text-center">
        <span className="flex size-18 items-center justify-center rounded-2xl border border-(--ui-accent)/25 bg-(--ui-accent)/10">
          <TriangleAlert aria-hidden="true" className="size-8 text-(--ui-accent)" />
        </span>
        <Heading.H1 size="small" className="uppercase">
          {copy?.title ?? ERROR_SCREEN_GENERIC_TITLE}
        </Heading.H1>
        <Text.P tone="subtle" size="small" className="max-w-sm leading-relaxed">
          {copy?.body ?? ERROR_SCREEN_GENERIC_BODY}
        </Text.P>
        {referenceDigest !== undefined ? (
          // The short code members can quote to support — it joins this screen
          // to the matching client + server log records.
          <Text.P tone="muted" size="xs" className="max-w-sm break-all">
            {ERROR_SCREEN_REFERENCE_LABEL} <code className="font-mono">{referenceDigest}</code>
          </Text.P>
        ) : null}
        <Row gap="sm" align="center" justify="center" className="pt-2">
          <Button type="button" onClick={retry}>
            {copy?.recovery ?? ERROR_SCREEN_GENERIC_RETRY}
          </Button>
          {homeHref !== undefined ? (
            <ButtonLink href={homeHref} variant="outline" tone="neutral">
              {homeLabel}
            </ButtonLink>
          ) : null}
        </Row>
      </Stack>
    </div>
  );
};

export default ErrorScreen;
