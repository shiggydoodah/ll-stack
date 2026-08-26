import { ButtonLink, Heading, Row, Stack, Text } from '@repo/ui/primitives';
import { pageRoutes } from '@/lib/routes';

// Placeholder landing page — real pages land feature by feature. The auth
// pages (create-account, login) and the example dashboard are live.
const HomePage = () => (
  <main className="flex min-h-dvh items-center justify-center p-8">
    <Stack gap="md" align="center">
      <Heading level="h1">LL Stack</Heading>
      <Text tone="muted">Frontend placeholder — the real pages are on their way.</Text>
      <Row gap="sm" responsive={false}>
        <ButtonLink href={pageRoutes.public.createAccount} tone="neutral" variant="solid">
          Create account
        </ButtonLink>
        <ButtonLink href={pageRoutes.public.login} tone="neutral" variant="outline">
          Sign in
        </ButtonLink>
      </Row>
    </Stack>
  </main>
);

export default HomePage;
