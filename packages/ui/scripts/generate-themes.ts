/*
 * Theme generator CLI. Discovers themes/<name>/theme.json, validates each
 * against the zod schema, and writes tokens.gen.css + index.css beside it.
 *
 *   pnpm themes:build            regenerate all themes
 *   pnpm themes:build --check    verify committed CSS matches the configs
 *                                (no writes; exits 1 on drift — used by verify)
 */
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { themeConfigSchema } from '../src/theme/config';
import { generateThemeCss } from '../src/theme/generate';

const packageRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const themesRoot = path.join(packageRoot, 'themes');
const checkOnly = process.argv.includes('--check');

const entries = (await readdir(themesRoot, { withFileTypes: true })).filter(
  (entry) => entry.isDirectory() && existsSync(path.join(themesRoot, entry.name, 'theme.json')),
);

if (entries.length === 0) {
  console.error(`No themes/<name>/theme.json found under ${themesRoot}`);
  process.exit(1);
}

let drift = false;

for (const entry of entries) {
  const themeDir = path.join(themesRoot, entry.name);
  const raw = JSON.parse(await readFile(path.join(themeDir, 'theme.json'), 'utf8'));
  const parsed = themeConfigSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(`✗ themes/${entry.name}/theme.json is invalid:`);
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  const config = parsed.data;
  if (config.name !== entry.name) {
    console.error(`✗ themes/${entry.name}: config name '${config.name}' must match its folder`);
    process.exit(1);
  }

  const customPath = path.join(themeDir, config.custom ?? 'custom.css');
  const hasCustomCss = existsSync(customPath);
  if (config.custom && !hasCustomCss) {
    console.error(`✗ themes/${entry.name}: custom CSS '${config.custom}' does not exist`);
    process.exit(1);
  }

  const fontFiles: Record<string, string> = {};
  for (const role of ['body', 'display', 'mono'] as const) {
    const font = config.fonts[role];
    if ('alias' in font || !font.files) continue;
    for (const file of font.files) {
      const fontPath = path.join(themeDir, file.path);
      if (!existsSync(fontPath)) {
        console.error(`✗ themes/${entry.name}: font file '${file.path}' does not exist`);
        process.exit(1);
      }
      fontFiles[file.path] = (await readFile(fontPath)).toString('base64');
    }
  }

  const generated = generateThemeCss(config, { hasCustomCss, fontFiles });
  const outputs: Array<[string, string]> = [
    [path.join(themeDir, 'tokens.gen.css'), generated.tokensCss],
    [path.join(themeDir, 'index.css'), generated.indexCss],
  ];

  for (const [file, content] of outputs) {
    const relative = path.relative(packageRoot, file);
    if (checkOnly) {
      const existing = existsSync(file) ? await readFile(file, 'utf8') : null;
      if (existing !== content) {
        console.error(`✗ ${relative} is stale — run \`pnpm themes:build\``);
        drift = true;
      }
    } else {
      await writeFile(file, content);
      console.log(`✓ wrote ${relative}`);
    }
  }
}

if (checkOnly) {
  if (drift) process.exit(1);
  console.log(`Themes verified (${entries.map((e) => e.name).join(', ')}).`);
}
