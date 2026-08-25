import type { Metadata } from 'next';
import AuthShell from '../_components/AuthShell';
import { pageRoutes } from '@/lib/routes';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = {
  title: 'Sign in',
};

const LoginPage = () => (
  <AuthShell
    kicker="02 — Sign in"
    title="Welcome back."
    subtitle="Sign in to your workspace to pick up where you left off."
    switchPrompt="New here?"
    switchHref={pageRoutes.public.createAccount}
    switchLabel="Create account"
  >
    <LoginForm />
  </AuthShell>
);

export default LoginPage;
