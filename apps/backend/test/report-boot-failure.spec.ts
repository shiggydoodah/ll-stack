import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { formatBootFailure } from '../src/bootstrap/report-boot-failure';

/**
 * THE DELIVERY IS THE BEHAVIOUR, SO IT IS WHAT THIS PINS.
 *
 * `main.ts` force-exits on the line after it reports a failed boot, and
 * `process.exit` drops a pending async write to `process.stderr`. Node's stderr
 * is async exactly when it is a pipe on macOS, which is `pnpm start 2>&1 | tee`
 * — so the regression this guards is a message that arrives truncated
 * mid-stack-trace, or not at all, in the one situation where someone is
 * capturing a boot failure to share.
 *
 * THE DELIVERY CASES RUN IN A CHILD PROCESS, AND THEY HAVE TO.
 * Two properties only exist against a real pipe. Jest's stderr is not one, and
 * an in-process assertion would pass against any implementation:
 *   - fd 2 is only non-blocking once the stderr stream has been materialized,
 *     which is what makes `writeSync` return a SHORT COUNT instead of throwing;
 *     that short write is the failure mode the loop exists for.
 *   - a reader that has stopped draining is what separates "waits for it" from
 *     "hangs on it", and there is no way to stall Jest's own stderr.
 *
 * ON LINUX THE FIRST TEST PASSES WITHOUT THE FIX, AND IT IS STILL WORTH RUNNING.
 * Pipes are synchronous there, so the async write it guards against would also
 * arrive. It pins the guarantee on every platform and catches the regression on
 * the one where it bites; the second test is platform-independent.
 */
describe('formatBootFailure', () => {
  it('leads with the fact that it was a boot, which is what the stack alone omits', () => {
    const formatted = formatBootFailure(new Error('argon2: memoryCost below the floor'));

    expect(formatted).toContain('[bootstrap] The backend failed to start:');
    expect(formatted).toContain('argon2: memoryCost below the floor');
  });

  it('prefers the stack, and falls back to the message when there is none', () => {
    const withStack = new Error('has a stack');
    const withoutStack = new Error('no stack here');
    withoutStack.stack = undefined;

    expect(formatBootFailure(withStack)).toContain(withStack.stack);
    expect(formatBootFailure(withoutStack)).toContain('no stack here');
  });

  it('reports a non-Error rejection rather than printing `[object Object]`', () => {
    // A rejected promise carries whatever it was rejected with. `String()` is
    // not a great rendering of an object, but it is a rendering — the operator
    // still learns the boot failed, which is the fact this exists to state.
    expect(formatBootFailure('plain string rejection')).toContain('plain string rejection');
    expect(formatBootFailure(undefined)).toContain('undefined');
  });
});

describe('writeBootFailure, in a child process against a real pipe', () => {
  const BACKEND_ROOT = resolve(__dirname, '..');

  /** Comfortably past the 64KB pipe buffer, so the write cannot land in one go. */
  const PAYLOAD_BYTES = 200_000;
  const END_MARKER = 'END-OF-BOOT-FAILURE';

  let scratch: string;

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'report-boot-failure-'));
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  /**
   * Runs the real writer in a fresh process whose stderr is a pipe this test
   * controls the draining of, and reports what came out. `drainAfterMs` is how
   * long the pipe is left unread; `null` never drains it at all.
   *
   * The child materializes its stderr stream before writing, the way a real boot
   * does by logging before it fails — without that fd 2 stays blocking and every
   * implementation passes.
   */
  async function writeInChild(drainAfterMs: number | null): Promise<{
    stderr: string;
    elapsedMs: number;
  }> {
    const timingFile = join(scratch, 'elapsed');

    const child = spawn(
      process.execPath,
      [
        '-r',
        'ts-node/register',
        '-e',
        "const { writeFileSync } = require('node:fs');" +
          "const { writeBootFailure } = require('./src/bootstrap/report-boot-failure');" +
          "process.stderr.write('boot log line\\n');" +
          `const message = 'A'.repeat(${PAYLOAD_BYTES}) + '${END_MARKER}\\n';` +
          'const startedAt = Date.now();' +
          'writeBootFailure(message);' +
          'writeFileSync(process.argv[1], String(Date.now() - startedAt));' +
          'process.exit(1);',
        timingFile,
      ],
      { cwd: BACKEND_ROOT, stdio: ['ignore', 'ignore', 'pipe'] },
    );

    // Leaving the stream paused is what fills the pipe: nothing is read until a
    // listener is attached, so the child's write blocks against a full buffer.
    const chunks: Buffer[] = [];
    if (drainAfterMs !== null) {
      setTimeout(
        () => child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk)),
        drainAfterMs,
      );
    }

    await new Promise<void>((resolveClose, rejectClose) => {
      child.once('close', () => resolveClose());
      child.once('error', rejectClose);
    });

    return {
      stderr: Buffer.concat(chunks).toString('utf8'),
      elapsedMs: Number(readFileSync(timingFile, 'utf8')),
    };
  }

  it('delivers the whole message to a reader that is behind, past the pipe buffer', async () => {
    const { stderr } = await writeInChild(300);

    // Both halves, because either alone is the bug: a truncated write still ends
    // in the payload, and a message that never started still has no marker.
    expect(stderr).toContain(END_MARKER);
    expect(stderr.length).toBeGreaterThanOrEqual(PAYLOAD_BYTES + END_MARKER.length);
  }, 30_000);

  it('gives up on a reader that never drains rather than hanging on it', async () => {
    const { elapsedMs } = await writeInChild(null);

    // The bound is 250ms of waiting; this asserts the shape (it returns, and
    // quickly) rather than the constant, so tuning the budget stays cheap.
    expect(elapsedMs).toBeLessThan(5_000);
  }, 30_000);
});
