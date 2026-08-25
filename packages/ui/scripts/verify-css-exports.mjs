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
//    declared in tokens.css.

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

const GUARDRAILS = [
  {
    pattern:
      /(?:bg|text|border|ring|fill|stroke|from|to|via|outline|accent|caret|decoration|shadow|divide|placeholder)-brand-[a-z]/,
    message: 'raw brand-* palette class (use tone-* or a --ui-* token)',
  },
  {
    pattern: /(?:bg|text|border|ring)-(?:neutral|red|green|amber|blue|gray|zinc|stone|slate)-[0-9]/,
    message: 'raw numeric palette class (use a --ui-* token)',
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

const usedUiTokens = new Set();
for (const file of sourceFiles) {
  const content = await readFile(file, 'utf8');
  const relative = path.relative(packageRoot, file);
  for (const line of content.split('\n')) {
    // Only class strings matter; skip comment lines to allow prose.
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
    for (const guard of GUARDRAILS) {
      if (guard.pattern.test(line)) {
        errors.push(`${relative}: ${guard.message}: ${line.trim().slice(0, 90)}`);
      }
    }
    for (const match of line.matchAll(/--ui-[a-z0-9-]*[a-z0-9]/g)) {
      usedUiTokens.add(match[0]);
    }
  }
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

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}

console.log(`CSS package exports verified (themes: ${themeDirs.join(', ')}).`);
