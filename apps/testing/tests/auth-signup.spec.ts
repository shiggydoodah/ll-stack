import { expect, test } from '@playwright/test';

import {
  createAccountButton,
  createTestAccount,
  expectSignedIn,
  fillSignUpForm,
  routes,
  signOut,
  signUp,
} from './helpers/auth';

/**
 * Registration, end to end: the create-account form → `createUserAction` →
 * `POST /auth/register` → the session + binding cookies → the members' area.
 * Every account minted here ends in `@llstack.test`, which global-teardown
 * deletes after the run.
 */
test.describe('Sign up', () => {
  test('creates an account and lands the new member on the dashboard', async ({ page }) => {
    const account = createTestAccount('signup');

    await page.goto(routes.createAccount);
    await fillSignUpForm(page, account);
    await createAccountButton(page).click();

    await expectSignedIn(page, account);
  });

  test('reports the missing fields and stays on the form', async ({ page }) => {
    await page.goto(routes.createAccount);

    await createAccountButton(page).click();

    // Client-side zod — the action re-parses `createAccountSchema` server-side,
    // so nothing should have been submitted here at all.
    await expect(page.getByText('Name is required')).toBeVisible();
    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Password must be at least 8 characters')).toBeVisible();
    await expect(page).toHaveURL(routes.createAccount);

    // Consent is deliberately NOT asserted here. TanStack runs the field-level
    // validators first and aborts before the form-level schema when any of them
    // fail — and consent is the one field with no `fieldValidators` of its own,
    // so its message only appears once the other three are valid. The next test
    // covers it from that state.
  });

  test('refuses an unticked consent box even with every other field filled', async ({ page }) => {
    const account = createTestAccount('signup-no-consent');

    await page.goto(routes.createAccount);
    await fillSignUpForm(page, account);
    // Untick what fillSignUpForm ticked: consent is the one field the backend
    // also requires, so it must never be submittable from the UI.
    await page.getByRole('checkbox', { name: /I accept the Terms/ }).uncheck();
    await createAccountButton(page).click();

    await expect(page.getByText('You must accept the terms to continue.')).toBeVisible();
    await expect(page).toHaveURL(routes.createAccount);
  });

  test('refuses a second account on the same email without confirming it exists', async ({
    page,
  }) => {
    const account = createTestAccount('signup-duplicate');
    await signUp(page, account);
    await signOut(page);

    await page.goto(routes.createAccount);
    await fillSignUpForm(page, { ...account, name: 'Someone Else' });
    await createAccountButton(page).click();

    // The backend answers 409, but the copy is deliberately vague: a precise
    // "email taken" message would confirm the address holds an account to
    // anyone who types it in. Asserted verbatim because that vagueness is the
    // security contract, not a wording preference.
    await expect(
      page.getByText("We couldn't create your account with these details. Please try again."),
    ).toBeVisible();
    await expect(page).toHaveURL(routes.createAccount);
  });
});
