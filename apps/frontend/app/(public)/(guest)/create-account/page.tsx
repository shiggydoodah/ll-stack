import type { Metadata } from 'next';
import AuthShell from '../_components/AuthShell';
import { pageRoutes } from '@/lib/routes';
import { CreateAccountForm } from './CreateAccountForm';

export const metadata: Metadata = {
  title: 'Create account',
};

const CreateAccountPage = () => (
  <AuthShell
    kicker="01 — Create account"
    title="Create your account."
    subtitle="A few fields and you are in — no card, no trial timer."
    switchPrompt="Already have an account?"
    switchHref={pageRoutes.public.login}
    switchLabel="Sign in"
  >
    <CreateAccountForm />
  </AuthShell>
);

export default CreateAccountPage;
