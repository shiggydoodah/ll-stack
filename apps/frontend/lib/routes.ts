// Route registry — every navigable path is spelled here and imported, never
// inlined at a call site, so a route move is one edit. Grows alongside real
// pages; the auth pages (login, create-account, logout) land with the auth
// feature.
export const publicPageRoutes = {
  home: '/',
};

export const pageRoutes = {
  home: '/',
  public: publicPageRoutes,
};
