// Route registry — every navigable path is spelled here and imported, never
// inlined at a call site, so a route move is one edit.
export const publicPageRoutes = {
  home: '/',
  login: '/login',
  createAccount: '/create-account',
  logout: '/logout',
};

export const memberPageRoutes = {
  dashboard: '/dashboard',
};

export const pageRoutes = {
  home: '/',
  public: publicPageRoutes,
  members: memberPageRoutes,
};
