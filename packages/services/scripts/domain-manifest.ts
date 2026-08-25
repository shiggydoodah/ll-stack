export interface DomainManifestEntry {
  name: string;
  tag: string;
}

// One entry per backend OpenAPI tag that this repo's apps consume through
// @repo/services. Each entry lands in the SAME change as its `.addTag(...)` in
// `apps/backend/src/bootstrap/configure-app.ts`, and the regenerated client
// ships in that same PR — contract, manifest and output move together.
export const DOMAIN_MANIFEST: DomainManifestEntry[] = [
  { name: 'health', tag: 'health' },
  { name: 'auth', tag: 'auth' },
  { name: 'users', tag: 'users' },
  { name: 'dashboard', tag: 'dashboard' },
];

// Backend tags that must never be generated or exported (internal-only or
// external-only surfaces nothing in this repo consumes). Add entries here
// instead of the manifest when one lands — the moment a tag exists in
// configure-app.ts without a decision here, generation picks it up.
export const IGNORED_TAGS: readonly string[] = [];
