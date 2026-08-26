import { randomUUID } from 'node:crypto';

import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Shared vocabulary for the auth journeys: account minting, the field locators,
 * and the three moves every spec makes (sign up, sign in, sign out).
 *
 * Kept out of `*.spec.ts` deliberately — `testMatch` collects spec files only,
 * so helpers live here rather than being picked up as an empty test file.
 */

/** Mirrors `apps/frontend/lib/authentication/session-constants.ts`. */
export const SESSION_COOKIE_NAME = 'llstack_session';

/**
 * The session-binding pair, as `apps/frontend/lib/auth/constants.ts` names them
 * outside production. Deleting both is how a spec forces the idle timeout: the
 * browser keeps a live session cookie that only `/logout` can revoke and clear.
 */
export const BINDING_COOKIE_NAMES = ['bind_dev', 'bind_entry_dev'] as const;

/** Mirrors `apps/frontend/lib/routes.ts`; the two tiers cannot share a module. */
export const routes = {
  account: '/account',
  createAccount: '/create-account',
  dashboard: '/dashboard',
  login: '/login',
  logout: '/logout',
} as const;

/**
 * `global-teardown.ts` deletes accounts by exactly this suffix. An address
 * minted any other way survives the run and pollutes `llstack_test`.
 */
const TEST_EMAIL_DOMAIN = 'llstack.test';

/** Satisfies `passwordSchema` in `@repo/schema`: 8+ chars, a letter and a digit. */
export const TEST_PASSWORD = 'Correct-horse-9';

export interface TestAccount {
  name: string;
  email: string;
  password: string;
}

/**
 * A brand-new account for one test. The random suffix is what keeps parallel
 * workers — and repeat runs against a database that was never reset — off each
 * other's unique email index.
 */
export const createTestAccount = (label: string): TestAccount => ({
  name: 'Ada Whitcombe',
  // The email schema lowercases on the way in; mint it lowercase so the address
  // the test holds is byte-identical to the one the dashboard renders back.
  email: `${label}-${randomUUID()}@${TEST_EMAIL_DOMAIN}`.toLowerCase(),
  password: TEST_PASSWORD,
});

/**
 * Anchored label regexes rather than plain strings, for two reasons: every
 * required field renders its `*` marker inside the `<label>`, and the password
 * field's show/hide toggle carries an `aria-label` ("Show password") that a
 * loose, case-insensitive `getByLabel('Password')` would also match.
 */
export const nameField = (page: Page): Locator => page.getByLabel(/^Name/);
export const emailField = (page: Page): Locator => page.getByLabel(/^Email/);
export const passwordField = (page: Page): Locator => page.getByLabel(/^Password/);
export const consentCheckbox = (page: Page): Locator =>
  page.getByRole('checkbox', { name: /I accept the Terms/ });

export const createAccountButton = (page: Page): Locator =>
  page.getByRole('button', { name: 'Create account' });
export const signInButton = (page: Page): Locator => page.getByRole('button', { name: 'Sign in' });

/** Fills every create-account field. Does not submit. */
export const fillSignUpForm = async (page: Page, account: TestAccount): Promise<void> => {
  await nameField(page).fill(account.name);
  await emailField(page).fill(account.email);
  await passwordField(page).fill(account.password);
  await consentCheckbox(page).check();
};

/**
 * Asserts the browser is on the members' dashboard as `account`. The full
 * address appears only in the sidebar — the users table masks every address the
 * backend returns — so matching it exactly also pins that the signed-in
 * identity is this account and not some other member's row.
 */
export const expectSignedIn = async (page: Page, account: TestAccount): Promise<void> => {
  await page.waitForURL(routes.dashboard);
  await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible();
  await expect(page.getByText(account.email, { exact: true })).toBeVisible();
};

/** Registers `account` through the real create-account form and lands signed in. */
export const signUp = async (page: Page, account: TestAccount): Promise<void> => {
  await page.goto(routes.createAccount);
  await fillSignUpForm(page, account);
  await createAccountButton(page).click();
  await expectSignedIn(page, account);
};

/** Submits the login form. Leaves the assertion to the caller — failures stay on the page. */
export const submitLogin = async (
  page: Page,
  credentials: Pick<TestAccount, 'email' | 'password'>,
): Promise<void> => {
  await page.goto(routes.login);
  await emailField(page).fill(credentials.email);
  await passwordField(page).fill(credentials.password);
  await signInButton(page).click();
};

/** Revokes the session server-side and clears the cookies; lands back on /login. */
export const signOut = async (page: Page): Promise<void> => {
  await page.goto(routes.logout);
  await page.waitForURL(routes.login);
};
