import { z } from 'zod';
// FIXUP: the 32 byte length is specific to the email verification token, but this should be an ENUM returned from the DB or a constant import somewhere. Either way this sshould not be hardcoded here. We need to turn it into a function.
export const BASE64_TOKEN_BYTE_LENGTH = 32;
export const BASE64_TOKEN_LENGTH = Math.ceil((BASE64_TOKEN_BYTE_LENGTH * 4) / 3);
const tokenError = 'Enter a valid token';

export const base64TokenSchema = z.base64url(tokenError).length(BASE64_TOKEN_LENGTH, tokenError);

export type Base64Token = z.infer<typeof base64TokenSchema>;
