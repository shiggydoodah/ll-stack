import type { Request, Response } from 'express';

import {
  createDocsAuthMiddleware,
  docsRequireAdminKey,
  readDocsCredential,
} from '../src/bootstrap/openapi-docs';

const ADMIN_KEY = 'A'.repeat(32);

function requestWith(headers: Record<string, string>): Request {
  const lowercased = new Map(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
  return {
    path: '/docs-json',
    header: (name: string) => lowercased.get(name.toLowerCase()),
  } as unknown as Request;
}

function responseSpy(): {
  res: Response;
  status: jest.Mock;
  json: jest.Mock;
  setHeader: jest.Mock;
} {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const setHeader = jest.fn();
  return { res: { status, json, setHeader } as unknown as Response, status, json, setHeader };
}

/**
 * `SwaggerModule.setup` mounts straight onto Express, so no Nest guard,
 * throttler, or filter ever sees a `/docs*` request. In staging and production
 * this middleware is the only thing in front of a document that describes every
 * route, DTO, and error shape in the service.
 */
describe('OpenAPI docs gate', () => {
  describe('docsRequireAdminKey', () => {
    it('gates deployed environments and leaves development and test open', () => {
      expect(docsRequireAdminKey('production')).toBe(true);
      expect(docsRequireAdminKey('staging')).toBe(true);
      expect(docsRequireAdminKey('development')).toBe(false);
      expect(docsRequireAdminKey('test')).toBe(false);
    });
  });

  describe('readDocsCredential', () => {
    it('reads the x-admin-key header', () => {
      expect(readDocsCredential(requestWith({ 'x-admin-key': ADMIN_KEY }))).toBe(ADMIN_KEY);
    });

    it('reads the password field of HTTP Basic, ignoring the username', () => {
      // A browser cannot set a custom header on a top-level navigation, so the
      // Swagger UI needs the Basic form to be usable at all.
      const encoded = Buffer.from(`anything:${ADMIN_KEY}`, 'utf8').toString('base64');
      expect(readDocsCredential(requestWith({ authorization: `Basic ${encoded}` }))).toBe(
        ADMIN_KEY,
      );
    });

    it('handles a password containing a colon', () => {
      const secret = 'a:b:c';
      const encoded = Buffer.from(`user:${secret}`, 'utf8').toString('base64');
      expect(readDocsCredential(requestWith({ authorization: `Basic ${encoded}` }))).toBe(secret);
    });

    it('returns null for absent, empty, malformed, or non-Basic credentials', () => {
      expect(readDocsCredential(requestWith({}))).toBeNull();
      expect(readDocsCredential(requestWith({ 'x-admin-key': '' }))).toBeNull();
      expect(readDocsCredential(requestWith({ authorization: 'Bearer abc' }))).toBeNull();
      expect(
        readDocsCredential(
          requestWith({
            authorization: `Basic ${Buffer.from('no-separator', 'utf8').toString('base64')}`,
          }),
        ),
      ).toBeNull();
    });
  });

  describe('createDocsAuthMiddleware', () => {
    it('passes a request presenting the admin key', () => {
      const next = jest.fn();
      const { res, status } = responseSpy();

      createDocsAuthMiddleware(ADMIN_KEY)(requestWith({ 'x-admin-key': ADMIN_KEY }), res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(status).not.toHaveBeenCalled();
    });

    it('answers 401 with a Basic challenge when the key is missing', () => {
      const next = jest.fn();
      const { res, status, json, setHeader } = responseSpy();

      createDocsAuthMiddleware(ADMIN_KEY)(requestWith({}), res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
      // The challenge is what makes a browser prompt rather than render a bare 401.
      expect(setHeader).toHaveBeenCalledWith('WWW-Authenticate', expect.stringContaining('Basic'));
    });

    it('answers 401 for a wrong key, including one that shares a prefix', () => {
      const next = jest.fn();
      const { res, status } = responseSpy();

      createDocsAuthMiddleware(ADMIN_KEY)(
        requestWith({ 'x-admin-key': `${ADMIN_KEY.slice(0, -1)}Z` }),
        res,
        next,
      );

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(401);
    });
  });
});
