export const MIN_PASSWORD_LENGTH = 8;

// Cap input length so an oversized password cannot amplify Argon2 CPU/memory
// cost on hash paths. Applied to every route that hands a password to Argon2,
// including login, where it short-circuits an over-long input before the verify
// call (no account can have a password this long, since creation enforces the
// same cap).
export const MAX_PASSWORD_LENGTH = 128;
