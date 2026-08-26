'use client';

import { useState, useTransition } from 'react';
import type { ActiveSessionDto } from '@repo/services/auth';
import {
  Badge,
  Button,
  Eyebrow,
  Heading,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@repo/ui/primitives';
import { ActionModal, Callout } from '@repo/ui/components';
import { revokeOtherSessionsAction } from '@/app/actions/revoke-other-sessions';
import type { RevokeOtherSessionsResult } from '@/app/actions/revoke-other-sessions';

// Pinned to UTC because this client component is server-rendered first: a
// formatter left on the runtime default prints the server's zone into the HTML
// and the visitor's over it, which is a hydration mismatch on every load.
const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

const formatMoment = (iso: string | null): string =>
  iso === null ? 'Not yet used' : dateFormatter.format(new Date(iso));

interface SessionsPanelProps {
  sessions: ActiveSessionDto[];
  truncated: boolean;
}

/**
 * Where the account is signed in, and the one control that ends the rest of it.
 *
 * There is no per-row revoke. Ending one sign-in off a list is a product
 * decision; ending all the others is the security lever, and it is the whole
 * answer to "someone may have my cookie".
 */
const SessionsPanel = ({ sessions, truncated }: SessionsPanelProps) => {
  const [confirming, setConfirming] = useState(false);
  const [outcome, setOutcome] = useState<RevokeOtherSessionsResult | null>(null);
  const [pending, startTransition] = useTransition();

  const others = sessions.filter((session) => !session.current).length;

  // Inline rather than a toast: the outcome of a security action should still
  // be on screen when the member looks back at the list to check it worked.
  const confirm = () => {
    startTransition(async () => {
      const result = await revokeOtherSessionsAction();
      setConfirming(false);
      setOutcome(result);
    });
  };

  return (
    <section className="flex flex-col gap-5 py-7">
      <div className="flex flex-wrap items-end justify-between gap-5 px-6">
        <div>
          <Eyebrow size="small" className="mb-3">
            {truncated
              ? 'Active sessions'
              : sessions.length === 1
                ? '1 active session'
                : `${sessions.length} active sessions`}
          </Eyebrow>
          <Heading.H1 size="medium" leading="tight">
            Sessions
          </Heading.H1>
        </div>
        <Button
          type="button"
          tone="red"
          variant="outline"
          disabled={others === 0 || pending}
          onClick={() => setConfirming(true)}
          className="text-2xs gap-2 font-mono font-bold tracking-widest uppercase"
        >
          Sign out other sessions
        </Button>
      </div>

      <div className="flex flex-col gap-4 px-6">
        <Text.P size="small" tone="muted">
          Each row is one sign-in. Nothing here records a device name, a browser, or a location, and
          &ldquo;last seen&rdquo; is stamped when a sign-in&rsquo;s token is re-issued, so an active
          browser reads a little behind. Times are UTC. Signing out the others ends every sign-in
          but this one, and any copied cookie behind them stops working straight away.
        </Text.P>

        {truncated ? (
          <Callout tone="amber" size="sm">
            More sessions are open than this list shows. Sign out the others to clear them.
          </Callout>
        ) : null}

        {outcome === null ? null : outcome.ok ? (
          <Callout tone="green" size="sm" role="status">
            {outcome.revokedSessions === 1
              ? 'Signed out 1 other session.'
              : `Signed out ${outcome.revokedSessions} other sessions.`}
          </Callout>
        ) : (
          <Callout tone="red" size="sm" role="alert">
            {outcome.error}
          </Callout>
        )}

        <Table density="comfortable">
          <TableHeader>
            <TableRow>
              <TableHead>Started</TableHead>
              <TableHead>Last seen</TableHead>
              <TableHead>Ends</TableHead>
              <TableHead align="right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => (
              <TableRow key={session.sessionId}>
                <TableCell className="text-2xs font-mono whitespace-nowrap">
                  {formatMoment(session.startedAt)}
                </TableCell>
                <TableCell className="text-2xs font-mono whitespace-nowrap text-(--ui-text-muted)">
                  {formatMoment(session.lastSeenAt)}
                </TableCell>
                <TableCell className="text-2xs font-mono whitespace-nowrap text-(--ui-text-muted)">
                  {formatMoment(session.expiresAt)}
                </TableCell>
                <TableCell align="right">
                  {session.current ? (
                    <Badge tone="green" variant="outline">
                      This session
                    </Badge>
                  ) : (
                    <Badge tone="neutral" variant="outline">
                      Signed in
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ActionModal
        open={confirming}
        onOpenChange={setConfirming}
        title="Sign out other sessions?"
        description={
          truncated
            ? 'Every other session will end straight away. This one stays signed in.'
            : others === 1
              ? 'One other session will end straight away. This one stays signed in.'
              : `${others} other sessions will end straight away. This one stays signed in.`
        }
        confirmLabel="Sign them out"
        confirmTone="red"
        pending={pending}
        onConfirm={confirm}
      />
    </section>
  );
};

export default SessionsPanel;
