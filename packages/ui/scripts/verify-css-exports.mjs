import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Guards the CSS surface of the package:
// A) the export map resolves (styles.css, ./theme module, ./themes/* wildcard
//    for every committed theme),
// B) the shared entrypoint stays theme-pure (no palette, no fonts, no theme
//    imports — themes are strictly opt-in at the consumer's entrypoint),
// C) components reference the token contract only (no raw palette classes,
//    no literal radius/shadow utilities), and every --ui-* token they use is
//    declared in tokens.css, and
// D) the package's sideEffects claim stays honest.

const packageRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const errors = [];

const packageJson = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
const readPackageFile = (relativePath) => readFile(path.join(packageRoot, relativePath), 'utf8');

const expectMatches = (content, pattern, label, expectedDescription) => {
  if (!pattern.test(content)) {
    errors.push(`${label} must include ${expectedDescription}`);
  }
};

const expectNotMatches = (content, pattern, label, unexpectedDescription) => {
  if (pattern.test(content)) {
    errors.push(`${label} must not include ${unexpectedDescription}`);
  }
};

// ── A) export map ──────────────────────────────────────────────────────────────

const themeDirs = (await readdir(path.join(packageRoot, 'themes'), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

if (themeDirs.length === 0) {
  errors.push('themes/ has no theme folders');
}

const staticExports = [
  { subpath: './theme', specifier: '@repo/ui/theme', target: './src/theme/index.ts' },
  { subpath: './styles.css', specifier: '@repo/ui/styles.css', target: './src/styles.css' },
];

for (const expected of staticExports) {
  const actualTarget = packageJson.exports?.[expected.subpath];
  if (actualTarget !== expected.target) {
    errors.push(
      `${expected.subpath} export must point to ${expected.target}; found ${String(actualTarget)}`,
    );
    continue;
  }
  const absoluteTarget = path.join(packageRoot, expected.target);
  if (!existsSync(absoluteTarget)) {
    errors.push(`${expected.target} does not exist`);
    continue;
  }
  const resolvedTarget = fileURLToPath(import.meta.resolve(expected.specifier));
  if (path.resolve(resolvedTarget) !== path.resolve(absoluteTarget)) {
    errors.push(`${expected.specifier} resolves to ${resolvedTarget}; expected ${absoluteTarget}`);
  }
}

if (packageJson.exports?.['./themes/*'] !== './themes/*/index.css') {
  errors.push('exports must map "./themes/*" to "./themes/*/index.css"');
}

for (const theme of themeDirs) {
  for (const file of ['theme.json', 'tokens.gen.css', 'index.css']) {
    if (!existsSync(path.join(packageRoot, 'themes', theme, file))) {
      errors.push(`themes/${theme}/${file} is missing (run \`pnpm themes:build\`)`);
    }
  }
  try {
    const resolved = fileURLToPath(import.meta.resolve(`@repo/ui/themes/${theme}`));
    const expected = path.join(packageRoot, 'themes', theme, 'index.css');
    if (path.resolve(resolved) !== path.resolve(expected)) {
      errors.push(`@repo/ui/themes/${theme} resolves to ${resolved}; expected ${expected}`);
    }
  } catch {
    errors.push(`@repo/ui/themes/${theme} does not resolve through the exports map`);
  }
}

// ── B) shared-entrypoint purity ────────────────────────────────────────────────

const publicStyles = await readPackageFile('src/styles.css');
expectMatches(
  publicStyles,
  /@import\s+['"]tailwindcss['"]\s*;/,
  'src/styles.css',
  "@import 'tailwindcss';",
);
expectMatches(
  publicStyles,
  /@import\s+['"]\.\/styles\/index\.css['"]\s*;/,
  'src/styles.css',
  "@import './styles/index.css';",
);
expectNotMatches(publicStyles, /--color-brand-/, 'src/styles.css', 'brand palette variables');
expectNotMatches(publicStyles, /--color-neutral-/, 'src/styles.css', 'neutral ramp variables');
expectNotMatches(publicStyles, /@font-face/, 'src/styles.css', '@font-face rules (theme-owned)');
expectNotMatches(publicStyles, /themes\//, 'src/styles.css', 'theme imports');

const layeredStyles = await readPackageFile('src/styles/index.css');
expectNotMatches(layeredStyles, /themes\//, 'src/styles/index.css', 'theme imports');
expectNotMatches(layeredStyles, /fonts\.css/, 'src/styles/index.css', 'font imports (theme-owned)');
expectMatches(
  layeredStyles,
  /@import\s+['"]\.\/tokens\.css['"]\s+layer\(tokens\)\s*;/,
  'src/styles/index.css',
  "@import './tokens.css' layer(tokens);",
);

// ── C) components stay on the token contract ───────────────────────────────────

const sourceFiles = [];
const collect = async (dir) => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await collect(full);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      sourceFiles.push(full);
    }
  }
};
await collect(path.join(packageRoot, 'src/ui'));

// Utility prefixes that take a colour value.
const COLOR_PREFIXES =
  'bg|text|border|ring|fill|stroke|from|to|via|outline|accent|caret|decoration|shadow|divide|placeholder';

const GUARDRAILS = [
  {
    pattern: new RegExp(`(?:${COLOR_PREFIXES})-brand-[a-z]`),
    message: 'raw brand-* palette class (use tone-* or a --ui-* token)',
  },
  {
    // Any Tailwind hue at a numeric step (red-500, sky-950, …). The lookbehind
    // keeps token utilities (`bg-(--ui-x)`) and compound spacing classes
    // (`-translate-x-1`) out; the lookahead skips non-colour utilities that
    // happen to end in a number (`ring-offset-2`, `border-spacing-10`).
    pattern: new RegExp(
      `(?<![-\\w(])(?:${COLOR_PREFIXES})-(?!opacity-|offset-|spacing-)[a-z]+-[0-9]{2,3}\\b`,
    ),
    message: 'raw numeric palette class (use a --ui-* token)',
  },
  {
    // Literal white/black utilities (text-white, bg-black/70, …) bypass the
    // theme contract just as hard as a numeric hue does.
    pattern: new RegExp(`(?<![-\\w(])(?:${COLOR_PREFIXES})-(?:white|black)\\b`),
    message: 'literal white/black colour utility (use a --ui-* token)',
  },
  {
    // Arbitrary hex values (bg-[#fff], text-[#1a2b3c], …).
    pattern: /\[#/,
    message: 'arbitrary hex colour value (use a --ui-* token)',
  },
  {
    pattern: /(?<![-\w(])rounded-(?:xs|sm|md|lg|xl|2xl|3xl)\b/,
    message: 'literal radius utility (use rounded-(--ui-radius-*))',
  },
  {
    pattern: /(?<![-\w(])shadow-(?:sm|md|lg|xl|2xl)\b/,
    message: 'literal shadow utility (use shadow-(--ui-shadow-*))',
  },
];

// Escape hatch of last resort: a trailing `// ui-guardrails-allow: <reason>`
// comment exempts that one line. Zero usages is the target, and the budget
// below enforces it rather than trusting the comment: adding an opt-out fails
// the check until someone raises MAX_GUARDRAIL_OPT_OUTS in the same commit,
// which puts every new exemption in front of a reviewer. Reasons are required
// and dead opt-outs are reported, so the count cannot drift upward quietly.
const GUARDRAILS_OPT_OUT = /ui-guardrails-allow:/;
const GUARDRAILS_OPT_OUT_REASON = /ui-guardrails-allow:[ \t]*(\S.*?)\s*$/;
const MAX_GUARDRAIL_OPT_OUTS = 0;
const MIN_OPT_OUT_REASON_LENGTH = 12;
const optOuts = [];

const usedUiTokens = new Set();
for (const file of sourceFiles) {
  const content = await readFile(file, 'utf8');
  const relative = path.relative(packageRoot, file);
  for (const [index, line] of content.split('\n').entries()) {
    // Only class strings matter; skip comment lines to allow prose.
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
    const optOut = GUARDRAILS_OPT_OUT.exec(line);
    // Match guardrails against the code only: a reason that names the utility it
    // is exempting must not itself read as a violation.
    const code = optOut ? line.slice(0, optOut.index) : line;
    const tripped = GUARDRAILS.filter((guard) => guard.pattern.test(code));
    if (optOut) {
      optOuts.push({
        location: `${relative}:${index + 1}`,
        reason: GUARDRAILS_OPT_OUT_REASON.exec(line)?.[1] ?? '',
        suppressed: tripped.length,
      });
    } else {
      for (const guard of tripped) {
        errors.push(`${relative}:${index + 1}: ${guard.message}: ${line.trim().slice(0, 90)}`);
      }
    }
    for (const match of line.matchAll(/--ui-[a-z0-9-]*[a-z0-9]/g)) {
      usedUiTokens.add(match[0]);
    }
  }
}

for (const optOut of optOuts) {
  if (optOut.reason.length < MIN_OPT_OUT_REASON_LENGTH) {
    errors.push(
      `${optOut.location}: ui-guardrails-allow needs a reason of at least ` +
        `${MIN_OPT_OUT_REASON_LENGTH} characters saying why no --ui-* token fits`,
    );
  }
  if (optOut.suppressed === 0) {
    errors.push(
      `${optOut.location}: ui-guardrails-allow suppresses nothing — delete the stale exemption`,
    );
  }
}

if (optOuts.length > MAX_GUARDRAIL_OPT_OUTS) {
  errors.push(
    `${optOuts.length} guardrail opt-out(s) against a budget of ${MAX_GUARDRAIL_OPT_OUTS}: ` +
      `${optOuts.map((optOut) => optOut.location).join(', ')}. Use a --ui-* token, or raise ` +
      `MAX_GUARDRAIL_OPT_OUTS in ${path.basename(fileURLToPath(import.meta.url))} deliberately.`,
  );
}

const tokensCss = await readPackageFile('src/styles/tokens.css');
const declaredTokens = new Set(
  [...tokensCss.matchAll(/--ui-[a-z0-9-]+(?=\s*:)/g)].map((m) => m[0]),
);
// Contract names that components may reference but that only themes set.
const THEME_ONLY_TOKENS = new Set([]);
for (const token of usedUiTokens) {
  if (!declaredTokens.has(token) && !THEME_ONLY_TOKENS.has(token)) {
    errors.push(
      `src/ui references ${token} but src/styles/tokens.css does not declare it — the contract drifted`,
    );
  }
}

// ── D) the sideEffects claim stays honest ──────────────────────────────────────

// package.json marks only CSS as side-effectful, so a bundler may drop any
// .ts/.tsx module whose bindings go unused. A bare import (`import './x.css'`,
// `import './register'`) is precisely the construct that claim invalidates: it
// exists only for its side effect, so it would be elided from consumer builds
// with no error. Keep the two in sync — if a bare import ever becomes
// necessary, its file has to be listed in sideEffects alongside "**/*.css".
const declaredSideEffects = packageJson.sideEffects;
if (
  !Array.isArray(declaredSideEffects) ||
  declaredSideEffects.length !== 1 ||
  declaredSideEffects[0] !== '**/*.css'
) {
  errors.push(
    `package.json sideEffects must be ["**/*.css"]; found ${JSON.stringify(declaredSideEffects)}`,
  );
}

const allSourceFiles = [];
const collectAll = async (dir) => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await collectAll(full);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      allSourceFiles.push(full);
    }
  }
};
await collectAll(path.join(packageRoot, 'src'));

for (const file of allSourceFiles) {
  const content = await readFile(file, 'utf8');
  const relative = path.relative(packageRoot, file);
  for (const [index, line] of content.split('\n').entries()) {
    if (/^\s*import\s+['"][^'"]+['"]\s*;?\s*$/.test(line)) {
      errors.push(
        `${relative}:${index + 1}: bare side-effect import, which sideEffects ["**/*.css"] ` +
          `lets bundlers drop: ${line.trim().slice(0, 60)}`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}

console.log(`CSS package exports verified (themes: ${themeDirs.join(', ')}).`);
