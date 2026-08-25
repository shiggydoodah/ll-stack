/**
 * Checks if a string looks like a base64url-encoded value.
 *
 * This is a format check, not cryptographic validation. It verifies the string
 * contains only valid base64url characters (A-Z, a-z, 0-9, -, _) and optionally
 * matches the expected length for a given byte size.
 */
export function isBase64Format(str: string, bytes?: number): boolean {
  const base64UrlRegex = /^[A-Za-z0-9_-]+$/;

  if (!base64UrlRegex.test(str) || str.length === 0) {
    return false;
  }

  if (bytes !== undefined) {
    const expectedLength = Math.ceil((bytes * 4) / 3);
    return str.length === expectedLength;
  }

  return true;
}
