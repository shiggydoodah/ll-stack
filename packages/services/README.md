# `@repo/services`

Generated Hey API clients scoped per backend domain, with hand-written domain
entrypoints ready for server-side frontend wrappers.

## Layout

Each public domain lives under `src/<domain>`:

- `hey-api.ts` configures the generated Next-aware client from
  `BACKEND_INTERNAL_URL` and `BACKEND_API_SECRET`.
- `index.ts` re-exports generated SDK functions, types, and schemas.
- `generated/` is the Hey API output directory and must not be manually edited.

Public package exports and domains are listed in `scripts/domain-manifest.ts`
(currently just `health`; each new backend surface adds an entry alongside its
`.addTag(...)` in the backend's `configure-app.ts`). `IGNORED_TAGS` holds
backend tags that must never be generated or exported. Seeing such a tag in the
backend's OpenAPI document is not a sign the manifest missed one: adding it
would ship a client this repo deliberately does not consume.

## Generation flow

```bash
pnpm gen:client                      # all domains (run in the gen PR)
pnpm gen:client users                # one or more named domains
pnpm gen:client --list               # pick domains from an interactive multi-select list
pnpm gen:client --dry-run users      # smoke test → git-ignored .temp/services-gen/
pnpm gen:client --force users        # ignore the per-domain source-hash cache
```

The generator pipeline in `scripts/gen-client.ts` does this:

1. Parse CLI args: positional domain name(s) (validated against the manifest;
   omit for all), plus `--list` (interactive multi-select picker), `--dry-run`,
   and `--force` (`FORCE=1` is an alias).
2. Resolve OpenAPI input from one of:
   - `OPENAPI_SPEC_PATH` (if provided), or
   - `BACKEND_URL/docs-json` (default `http://localhost:3100/docs-json`), or
   - backend docs extraction fallback (`pnpm --filter @repo/backend openapi:extract`).
3. Parse the spec and compute a SHA-256 hash over the canonicalized OpenAPI
   document, the per-domain manifest, and the ignored-tag list.
4. Validate every OpenAPI tag is either in the manifest or explicitly ignored.
5. Split the spec by OpenAPI tags, recursively prune unused
   `components.schemas`, and generate the selected domains into
   `src/<domain>/generated`.
6. Skip a domain when its own `generated/.source-hash` matches and the output
   exists, unless `--force`/`FORCE=1`.

Generated output is committed and marked as generated in `.gitattributes`. Do
not import frontend config here; environment validation stays in
`apps/frontend/src/config`.

## Workflow: keep generated output out of feature PRs

Regenerated clients are large and bury the reviewable diff, so generation is
**decoupled** from the contract change:

- A backend **feature PR** ships the contract change only — never the
  regenerated `packages/services` output.
- `--dry-run` writes to a git-ignored `.temp/services-gen/<domain>/generated/`
  dir so an agent can confirm a contract generates cleanly with zero risk of
  the output reaching the PR. (A brand-new domain has no committed `hey-api.ts`
  yet, so its generated imports stay unresolved until the gen PR adds it.)
- The committed client is regenerated and committed in a separate,
  generation-only branch/PR. See `docs/agents/backend.agents.md` →
  **Client generation**.
