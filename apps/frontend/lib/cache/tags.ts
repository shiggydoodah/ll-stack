export const cacheTags = {
  currentUser: (userId: string): string => `current-user:${userId}`,
  emailVerificationState: (sessionFingerprint: string): string =>
    `email-verification-state:${sessionFingerprint}`,
  // Kill-switches epic: the anonymous /app-status read (one shared entry —
  // the status is global, not per-user).
  killSwitchStatus: 'kill-switch-status',
};
