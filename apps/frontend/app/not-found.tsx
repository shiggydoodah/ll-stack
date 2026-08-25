import type { Metadata } from 'next';
import NotFoundScreen from '@/components/NotFoundScreen';
import { pageRoutes } from '@/lib/routes';

export const metadata: Metadata = {
  title: 'Page not found',
};

// Global 404 boundary — unmatched URLs anywhere in the app, plus any
// `notFound()` with no closer boundary. Next renders it inside the root layout
// only. Route groups with their own chrome should ship their own not-found.
const NotFound = () => (
  <NotFoundScreen homeHref={pageRoutes.home} homeLabel="Back to the homepage" />
);

export default NotFound;
