/** Fixed width, so the mask reveals nothing about the local part's length. */
const MASK = '***';

/**
 * Masks an email address for display to someone who is not its owner.
 *
 * WHAT THIS IS FOR. `GET /dashboard` lists recent members to any signed-in
 * member, and a self-service signup is one HTTP request away — so returning
 * `email` there handed every account's full address to anyone who could type a
 * password. That is a mailing list and an account-enumeration oracle, produced
 * by a route whose purpose is to render a table.
 *
 * WHAT IT DELIBERATELY KEEPS. The first character of the local part and the
 * whole domain, so the column still reads as a real directory
 * (`a***@example.com`) and a member can recognise their own row. That is a
 * judgement call for a boilerplate's example screen, and it is a residual
 * disclosure, not zero: the domain tells a reader which organisation a member
 * belongs to. If you are building something where that matters — B2B tenants,
 * anything with a confidentiality obligation between members — drop the field
 * from `DashboardMemberDto` rather than masking it harder. Masking is the floor
 * here, not the ceiling.
 *
 * Anything that is not recognisably `local@domain` masks completely rather than
 * guessing, so a malformed stored value can never fall through unmasked.
 */
export function maskEmail(email: string): string {
  const atIndex = email.lastIndexOf('@');
  const domain = email.slice(atIndex + 1);

  if (atIndex <= 0 || domain.length === 0) {
    return MASK;
  }

  return `${email.slice(0, 1)}${MASK}@${domain}`;
}
