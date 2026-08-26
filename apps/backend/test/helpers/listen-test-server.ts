import type { INestApplication } from '@nestjs/common';

/**
 * Bind a Nest app's HTTP server to an ephemeral port so Supertest reuses one
 * stable listening socket for the whole suite.
 *
 * Integration suites build the app with `app.init()` — which does NOT start
 * listening — and then drive it with `request(app.getHttpServer())`. When the
 * server is not already listening, Supertest `listen(0)`s it and then
 * `close()`s it again on EVERY request (supertest `lib/test.js` ~60-69,141).
 * Under a suite's request volume that per-request listen/close churn races and
 * intermittently returns a bare Express 404 (empty body, none of the app's
 * headers — the request never enters the Nest pipeline) on a valid route. That
 * is the long-standing intermittent "→404" seen across the controller
 * integration suites (register/feed/guards answering 404 instead of
 * 201/200/401/403).
 *
 * Calling this once, right after `app.init()`, makes `app.address()` non-null,
 * so Supertest skips the per-request listen/close and reuses the socket. The
 * suite's existing `app.close()` in afterAll still tears the server down.
 * Cf. nestjs/nest#15239.
 */
export async function listenTestServer(app: INestApplication): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = app.getHttpServer();
    const onError = (error: Error): void => reject(error);
    server.once('error', onError);
    server.listen(0, () => {
      server.removeListener('error', onError);
      resolve();
    });
  });
}
