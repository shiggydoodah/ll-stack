import { writeSync } from 'node:fs';

const STDERR_FD = 2;

/**
 * How long to keep waiting on a reader that has stopped draining, and in what
 * slice. A boot failure must never become a hang — see `main.ts` on why this
 * path force-exits — so a reader that never returns costs this much and then the
 * tail of the message, never the process. It has to be a real wait rather than a
 * retry count: a spin burns any budget in microseconds and gives a reader that
 * is merely behind no time at all to catch up.
 */
const BLOCKED_WAIT_SLICE_MS = 5;
const MAX_BLOCKED_WAIT_MS = 250;

/** The only synchronous sleep available to us; the caller is exiting anyway. */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Reports a failed boot as the reason plus the fact that it was a boot. */
export function formatBootFailure(error: unknown): string {
  return `\n[bootstrap] The backend failed to start:\n\n${
    error instanceof Error ? (error.stack ?? error.message) : String(error)
  }\n`;
}

/**
 * WHY THIS IS NOT `process.stderr.write`.
 *
 * Node's stderr is asynchronous when it is a pipe on macOS (synchronous for
 * files everywhere, for TTYs on POSIX, and for pipes on Windows and Linux), and
 * the caller force-exits on the next line. `process.exit` is documented to drop
 * pending writes to `process.stderr`, so piping a failed boot — `pnpm start 2>&1
 * | tee` — truncates the message mid-stack-trace, and loses it outright when the
 * boot logged anything first. Linux pipes are synchronous so the deployed target
 * never saw this, but the piped case is exactly when someone is capturing the
 * log to share.
 *
 * WHY THIS LOOPS RATHER THAN CALLING `writeSync` ONCE.
 *
 * A single `writeSync` is not the guarantee it looks like. Once the stderr
 * stream has been materialized — which a real boot does, because logging runs
 * before the failures this exists to report — fd 2 is non-blocking, and a raw
 * write to a non-blocking fd returns a SHORT COUNT rather than throwing: a
 * 200KB message reports 65,522 bytes written, no error, remainder gone. Only
 * the loop makes the delivery unconditional; a bare call moves the truncation
 * boundary without removing it.
 */
export function writeBootFailure(message: string): void {
  const payload = Buffer.from(message, 'utf8');
  let offset = 0;
  let waitedMs = 0;

  while (offset < payload.length) {
    let written: number;

    try {
      written = writeSync(STDERR_FD, payload, offset);
    } catch {
      // Nothing was writable at all (EAGAIN): the pipe is full and the reader
      // has not drained it yet. Wait for it — bounded, because the alternative
      // to giving up on a reader that never returns is hanging on it forever.
      if (waitedMs >= MAX_BLOCKED_WAIT_MS) {
        return;
      }
      sleepSync(BLOCKED_WAIT_SLICE_MS);
      waitedMs += BLOCKED_WAIT_SLICE_MS;
      continue;
    }

    // A non-positive count means the write reported success without making
    // progress. Nothing about looping again would change that, so stop rather
    // than spin on it.
    if (written <= 0) {
      return;
    }

    offset += written;
  }
}
