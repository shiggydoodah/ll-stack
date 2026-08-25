// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRefresh } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, replace: vi.fn(), push: vi.fn() }),
}));

// `@/` modules load for real in jsdom (see vitest.config.ts), so spy on the
// singleton logger instead of mocking the module.
import { clientLogger } from '@/lib/logging/client-logger';
import { EXPECTED_ERROR_CODES } from '@/lib/errors/expected-error-codes';
import { ExpectedError } from '@/lib/errors/expected-error';
import ErrorScreen, {
  ERROR_SCREEN_GENERIC_BODY,
  ERROR_SCREEN_GENERIC_TITLE,
  ERROR_SCREEN_REFERENCE_LABEL,
} from './ErrorScreen';

// Inert implementations keep records out of the real batching pipeline (flush
// timers, /api/client-logs shipping) so the suite stays hermetic.
const warnSpy = vi.spyOn(clientLogger, 'warn').mockImplementation(() => {});
const errorSpy = vi.spyOn(clientLogger, 'error').mockImplementation(() => {});
const fatalSpy = vi.spyOn(clientLogger, 'fatal').mockImplementation(() => {});

const digestError = (digest: string): Error & { digest?: string } => {
  const error = new Error('An error occurred in the Server Components render.') as Error & {
    digest?: string;
  };
  error.digest = digest;
  return error;
};

beforeEach(() => {
  mockRefresh.mockReset();
  warnSpy.mockClear();
  errorSpy.mockClear();
  fatalSpy.mockClear();
});

afterEach(cleanup);

describe('ErrorScreen', () => {
  it('renders catalog copy for an expected error and logs one warn record', () => {
    const copy = EXPECTED_ERROR_CODES.PAGE_DATA_UNAVAILABLE;
    render(
      <ErrorScreen
        error={new ExpectedError('PAGE_DATA_UNAVAILABLE')}
        reset={vi.fn()}
        scope="members"
      />,
    );

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(copy.title);
    expect(screen.getByText(copy.body)).toBeDefined();
    expect(screen.getByRole('button', { name: copy.recovery })).toBeDefined();
    // Expected errors show no support reference line.
    expect(screen.queryByText(ERROR_SCREEN_REFERENCE_LABEL, { exact: false })).toBeNull();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      'client.error.expected',
      expect.objectContaining({
        code: 'PAGE_DATA_UNAVAILABLE',
        digest: 'expected:PAGE_DATA_UNAVAILABLE',
        scope: 'members',
      }),
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('renders the generic screen with the digest reference for an unexpected error', () => {
    render(<ErrorScreen error={digestError('abc1234567')} reset={vi.fn()} scope="members" />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(ERROR_SCREEN_GENERIC_TITLE);
    expect(screen.getByText(ERROR_SCREEN_GENERIC_BODY)).toBeDefined();
    expect(screen.getByText('abc1234567')).toBeDefined();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      'client.error.boundary',
      expect.objectContaining({ scope: 'members', digest: 'abc1234567' }),
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('fails safe: an expected-prefixed digest with an unregistered code renders generic', () => {
    render(
      <ErrorScreen error={digestError('expected:NOT_IN_CATALOG')} reset={vi.fn()} scope="root" />,
    );

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(ERROR_SCREEN_GENERIC_TITLE);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('omits the reference line when the error has no digest', () => {
    render(<ErrorScreen error={new Error('client boom')} reset={vi.fn()} scope="root" />);

    expect(screen.queryByText(ERROR_SCREEN_REFERENCE_LABEL, { exact: false })).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('escalates the unexpected record to fatal when the global boundary asks', () => {
    render(
      <ErrorScreen error={digestError('deadbeef')} reset={vi.fn()} scope="global" level="fatal" />,
    );

    expect(fatalSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('recovers by refreshing RSC data AND resetting the boundary', () => {
    const reset = vi.fn();
    render(<ErrorScreen error={digestError('deadbeef')} reset={reset} scope="members" />);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('renders the optional home link and never renders error.message', () => {
    const error = new Error('INTERNAL SECRET DETAIL');
    render(
      <ErrorScreen
        error={error}
        reset={vi.fn()}
        scope="members"
        homeHref="/home"
        homeLabel="Back to your dashboard"
      />,
    );

    const link = screen.getByRole('link', { name: 'Back to your dashboard' });
    expect(link.getAttribute('href')).toBe('/home');
    expect(screen.queryByText('INTERNAL SECRET DETAIL', { exact: false })).toBeNull();
  });
});
