// Route registry — every navigable path is spelled here and imported, never
// inlined at a call site, so a route move is one edit.
export const publicPageRoutes = {
  home: '/',
  login: '/login',
  createAccount: '/create-account',
  logout: '/logout',
};

// Every path here is treated as a member route by `proxy.ts` — session
// presence check, binding-cookie roll, and rotation. Adding one is all it takes;
// leaving one out means a signed-in page with no idle timeout and no rotation.
export const memberPageRoutes = {
  dashboard: '/dashboard',
  account: '/account',
};

export const pageRoutes = {
  home: '/',
  public: publicPageRoutes,
  members: memberPageRoutes,
};
