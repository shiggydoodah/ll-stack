#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';

const OPEN_HANDLE_WARNING = 'Jest did not exit one second after the test run has completed';
// V8 prints this exact phrase to stderr when it aborts on JS heap exhaustion
// (surfacing as SIGABRT, historically SIGSEGV). The backend integration suite
// runs in long-lived workers (maxWorkers: 2, shared test Postgres), so a
// worker's cumulative footprint can cross the old-space ceiling mid-run and
// present as an anonymous native crash "dozens of suites in". The real fix
// bounds each worker (`workerIdleMemoryLimit` in jest.config.cjs); this banner
// match exists so that if heap exhaustion ever recurs it is reported as OOM,
// not re-diagnosed from scratch as a flake to be re-run.
const V8_OOM_BANNER = 'JavaScript heap out of memory';
// Last-resort backstop only — open handles are caught by the
// OPEN_HANDLE_WARNING match below, per-test stalls by Jest's own testTimeout,
// and a wedged process by the CI job's timeout-minutes. The backend
// integration suite (maxWorkers: 2, shared test Postgres) grows with every
// feature: it crossed a 120s budget at ~115s of healthy runtime in June 2026,
// killing green runs mid-suite, back when it still ran serially. Keep this
// comfortably above the suite's wall clock; override per-run via
// JEST_GUARD_TIMEOUT_MS.
const DEFAULT_TIMEOUT_MS = 600_000;
const SHUTDOWN_GRACE_MS = 5_000;
// Jest prints OPEN_HANDLE_WARNING whenever the process is still alive ONE
// second after the run completes — across a suite this size, pg-pool socket
// and logger teardown occasionally needs a little longer than that, which is
// a flake, not a leak. A real leak keeps the process alive indefinitely. So
// on the warning, give teardown a bounded window to drain: a clean exit
// within it is a pass; still alive after it is the leak the guard exists to
// catch.
const OPEN_HANDLE_DRAIN_MS = 15_000;

function resolveTimeoutMs() {
  const rawTimeout = process.env['JEST_GUARD_TIMEOUT_MS'];

  if (!rawTimeout) {
    return DEFAULT_TIMEOUT_MS;
  }

  const timeoutMs = Number.parseInt(rawTimeout, 10);

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }

  return timeoutMs;
}

// Non-fatal preflight: the OOM cliff for the backend suite moves with
// the V8 major, so a machine running a Node major other than the repo pin
// (`.tool-versions`) hits heap exhaustion where the pinned CI Node does not.
// asdf reads `.tool-versions`, so its `nodejs` entry is the authoritative pin;
// warn once up front so a heap-exhaustion death on the wrong Node is not
// mistaken for a real test failure. Never let this advisory block the run.
function warnOnNodeMajorDrift() {
  try {
    const toolVersions = readFileSync(new URL('../.tool-versions', import.meta.url), 'utf8');
    const nodeLine = toolVersions
      .split('\n')
      .find((line) => line.trim().split(/\s+/)[0] === 'nodejs');
    const pinned = nodeLine ? nodeLine.trim().split(/\s+/)[1] : '';
    const pinnedMajor = pinned.split('.')[0];
    const runningMajor = process.versions.node.split('.')[0];

    if (pinnedMajor && runningMajor && pinnedMajor !== runningMajor) {
      process.stderr.write(
        `\n[jest-open-handle-guard] Node ${process.versions.node} differs from the repo pin (.tool-versions ${pinned}). ` +
          `V8 heap defaults shift between majors, which moves the OOM cliff for the backend suite — if this ` +
          `run dies from heap exhaustion, switch to Node ${pinnedMajor} (nvm/asdf) before assuming a real failure.\n\n`,
      );
    }
  } catch {
    // Reading .tool-versions is best-effort; a missing/unreadable pin must not fail tests.
  }
}

warnOnNodeMajorDrift();

const jestCommand = process.platform === 'win32' ? 'jest.cmd' : 'jest';
const jestArgs = process.argv.slice(2);
const timeoutMs = resolveTimeoutMs();
const child = spawn(jestCommand, jestArgs, {
  env: process.env,
  stdio: ['inherit', 'pipe', 'pipe'],
});

let didSeeOpenHandleWarning = false;
let didFailForOpenHandles = false;
let didTimeout = false;
let didExit = false;
let didSeeOomBanner = false;
let recentOutput = '';
let openHandleDrainTimer = null;

function forceExitChild() {
  const forceExitTimer = setTimeout(() => {
    if (!didExit) {
      child.kill('SIGKILL');
    }
  }, SHUTDOWN_GRACE_MS);

  forceExitTimer.unref();
}

function startOpenHandleDrainWindow() {
  if (didSeeOpenHandleWarning || didExit) {
    return;
  }

  didSeeOpenHandleWarning = true;
  process.stderr.write(
    `\n[jest-open-handle-guard] Jest reported open asynchronous handles; allowing ${OPEN_HANDLE_DRAIN_MS}ms for teardown to drain before declaring a leak.\n`,
  );

  openHandleDrainTimer = setTimeout(() => {
    didFailForOpenHandles = true;
    process.stderr.write(
      `\n[jest-open-handle-guard] Open handles did not drain within ${OPEN_HANDLE_DRAIN_MS}ms. Failing this run so the leak is fixed instead of silently slowing CI.\n`,
    );
    child.kill('SIGTERM');
    forceExitChild();
  }, OPEN_HANDLE_DRAIN_MS);

  openHandleDrainTimer.unref();
}

function observeOutput(chunk) {
  const text = chunk.toString('utf8');
  recentOutput = `${recentOutput}${text}`.slice(-(OPEN_HANDLE_WARNING.length + 1_024));

  // Sticky: the banner prints just before V8 aborts, so latch it the first
  // time it appears (in this chunk or the retained window) rather than relying
  // on it still being in `recentOutput` at close time.
  if (!didSeeOomBanner && (text.includes(V8_OOM_BANNER) || recentOutput.includes(V8_OOM_BANNER))) {
    didSeeOomBanner = true;
  }

  if (recentOutput.includes(OPEN_HANDLE_WARNING)) {
    startOpenHandleDrainWindow();
  }
}

child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  observeOutput(chunk);
});

child.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
  observeOutput(chunk);
});

child.on('error', (error) => {
  process.stderr.write(`[jest-open-handle-guard] Failed to start Jest: ${error.message}\n`);
  process.exitCode = 1;
});

const timeout = setTimeout(() => {
  didTimeout = true;
  process.stderr.write(
    `\n[jest-open-handle-guard] Jest exceeded ${timeoutMs}ms. This usually indicates an open handle or stalled test process.\n`,
  );
  child.kill('SIGTERM');
  forceExitChild();
}, timeoutMs);

timeout.unref();

child.on('close', (code, signal) => {
  didExit = true;
  clearTimeout(timeout);
  if (openHandleDrainTimer !== null) {
    clearTimeout(openHandleDrainTimer);
    openHandleDrainTimer = null;
  }

  if (didFailForOpenHandles || didTimeout) {
    process.exitCode = 1;
    return;
  }

  if (didSeeOpenHandleWarning) {
    process.stderr.write(
      '\n[jest-open-handle-guard] Teardown drained and Jest exited on its own — treating the open-handle warning as a slow teardown, not a leak.\n',
    );
  }

  if (didSeeOomBanner && code !== 0) {
    process.stderr.write(
      `\n[jest-open-handle-guard] Detected V8 "${V8_OOM_BANNER}"${signal ? ` (signal ${signal})` : ''}: this run died from ` +
        'JS heap exhaustion, not an open handle, a stalled test, or a flake — do NOT just re-run it. The backend suite ' +
        'runs across 2 workers (maxWorkers in apps/backend/jest.config.cjs); each is bounded by ' +
        "`workerIdleMemoryLimit` in that same file. A recurrence means one worker's per-file footprint outgrew that " +
        'bound (raise it, or --max-old-space-size, as a documented decision) or the Node major drifted from the ' +
        '.tool-versions pin.\n',
    );
    process.exitCode = typeof code === 'number' ? code : 1;
    return;
  }

  if (typeof code === 'number') {
    process.exitCode = code;
    return;
  }

  process.stderr.write(
    `[jest-open-handle-guard] Jest exited from signal ${signal ?? 'unknown'}.\n`,
  );
  process.exitCode = 1;
});
