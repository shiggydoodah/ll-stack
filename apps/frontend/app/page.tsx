import { Heading, Stack, Text } from '@repo/ui/primitives';

// Placeholder landing page — real pages land feature by feature (auth first).
const HomePage = () => (
  <main className="flex min-h-dvh items-center justify-center p-8">
    <Stack gap="md" align="center">
      <Heading level="h1">LL Stack</Heading>
      <Text tone="muted">Frontend placeholder — the real pages are on their way.</Text>
    </Stack>
  </main>
);

export default HomePage;
