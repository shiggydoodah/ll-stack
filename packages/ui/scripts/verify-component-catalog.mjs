import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Verifies that COMPONENTS.md stays in sync with what the package actually
// exports. This is a CHEAP, FOLDER-GRANULAR guard: it checks that every folder
// exported from the primitives and components barrels has a slug in a
// COMPONENTS.md `<!-- @ui-folders: ... -->` manifest, and vice versa.
//
// It does NOT verify individual exports added *inside* an existing folder, nor
// the integrations/hooks/providers surfaces — those are kept current via the
// "How to add a new component" checklist in CONTEXT.md and the ui-lab specimen
// test. Folder-granularity is what keeps this guard cheap and matches the lean
// one-row-per-folder catalog (compounds like `Dialog.*` are collapsed).

const packageRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const errors = [];

const readPackageFile = (relativePath) => readFile(path.join(packageRoot, relativePath), 'utf8');

// Folders re-exported from a layer barrel, in any re-export shape:
//   export * from './<slug>';
//   export * as Ns from './<slug>';
//   export { Button } from './<slug>';
//   export type { ButtonProps } from './<slug>';
const barrelFolders = (content) => {
  const slugs = new Set();
  const pattern =
    /export\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s+from\s+'\.\/([a-z0-9-]+)'/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    slugs.add(match[1]);
  }
  return slugs;
};

const layers = [
  { name: 'primitives', barrel: 'src/ui/primitives/index.ts' },
  { name: 'components', barrel: 'src/ui/components/index.ts' },
];

// slug -> layer name (authoritative set of documented folders)
const exportedFolders = new Map();
for (const layer of layers) {
  const content = await readPackageFile(layer.barrel);
  for (const slug of barrelFolders(content)) {
    exportedFolders.set(slug, layer.name);
  }
}

if (exportedFolders.size === 0) {
  errors.push(
    'No re-exported folders found in the primitives/components barrels — the guard cannot run',
  );
}

// Slugs declared across all `<!-- @ui-folders: ... -->` manifests in COMPONENTS.md
const catalog = await readPackageFile('COMPONENTS.md');
const catalogFolders = new Set();
const manifestPattern = /<!--\s*@ui-folders:\s*([\s\S]*?)-->/g;
let manifestMatch;
let manifestCount = 0;
while ((manifestMatch = manifestPattern.exec(catalog)) !== null) {
  manifestCount += 1;
  for (const slug of manifestMatch[1].split(',')) {
    const trimmed = slug.trim();
    // Skip placeholder tokens so a documentation example like `@ui-folders: ...`
    // can never be mistaken for a real entry.
    if (trimmed && trimmed !== '...' && trimmed !== '…') {
      catalogFolders.add(trimmed);
    }
  }
}

if (manifestCount === 0) {
  errors.push(
    'COMPONENTS.md has no `<!-- @ui-folders: ... -->` manifest — the guard cannot verify coverage',
  );
}

// A) exported but undocumented — the drift we care about most
for (const [slug, layer] of exportedFolders) {
  if (!catalogFolders.has(slug)) {
    errors.push(
      `'${slug}' is exported from ${layer} but has no entry in COMPONENTS.md (add a row and its slug to the section's @ui-folders manifest)`,
    );
  }
}

// B) documented but no longer exported — catches renames/removals
for (const slug of catalogFolders) {
  if (!exportedFolders.has(slug)) {
    errors.push(
      `COMPONENTS.md lists '${slug}' in an @ui-folders manifest but no such folder is exported from primitives/components`,
    );
  }
}

// C) every exported folder carries a colocated specimen — the package's
// preview contract. Folders here have consciously opted out (no specimen yet,
// or previewed via a bespoke ui-lab route); new components must either ship a
// `<name>.specimen.ts(x)` or join this list deliberately.
const SPECIMEN_EXEMPT = new Set([
  // primitives
  'avatar',
  'card',
  'checkbox-button',
  'icon',
  'loading-dots',
  'radio-card',
  'skeleton',
  'spinner',
  'toggle-switch',
  // components (popover/toast have bespoke demo routes in ui-lab)
  'avatar-crop',
  'fields',
  'popover',
  'toast',
]);

const specimenFiles = new Map(); // folder path relative to src/ui -> file names
const layerDirs = ['primitives', 'components', 'integrations'];
for (const layerDir of layerDirs) {
  const layerPath = path.join(packageRoot, 'src/ui', layerDir);
  for (const entry of await readdir(layerPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const files = await readdir(path.join(layerPath, entry.name));
    const specimens = files.filter((file) => /\.specimen\.(ts|tsx)$/.test(file));
    if (specimens.length > 0) {
      specimenFiles.set(`${layerDir}/${entry.name}`, specimens);
    }
  }
}

const foldersWithSpecimens = new Set(
  [...specimenFiles.keys()].map((folder) => folder.split('/')[1]),
);
for (const [slug, layer] of exportedFolders) {
  if (!foldersWithSpecimens.has(slug) && !SPECIMEN_EXEMPT.has(slug)) {
    errors.push(
      `'${slug}' (${layer}) has no colocated *.specimen.ts(x) — add one next to the component and register it in src/specimens/index.ts, or add the slug to SPECIMEN_EXEMPT in this script`,
    );
  }
}
for (const slug of SPECIMEN_EXEMPT) {
  if (foldersWithSpecimens.has(slug)) {
    errors.push(
      `'${slug}' is listed in SPECIMEN_EXEMPT but now has a specimen — remove it from the exempt list`,
    );
  }
}

// D) every specimen file is registered in the src/specimens/index.ts barrel
// (imported AND present in `allSpecimens`), so ui-lab and the render test see it.
const specimenBarrel = await readPackageFile('src/specimens/index.ts');

// Anchored to the actual declaration (`export const allSpecimens`) — the bare
// name also appears in comments — and scanned to the MATCHING close bracket so
// a type annotation or nested array literal cannot truncate the block.
const extractAllSpecimensBlock = (source) => {
  const declaration = source.match(/export\s+const\s+allSpecimens\b[^=]*=\s*\[/);
  if (!declaration) return null;
  const start = declaration.index + declaration[0].length;
  let depth = 1;
  let index = start;
  while (index < source.length && depth > 0) {
    if (source[index] === '[') depth += 1;
    else if (source[index] === ']') depth -= 1;
    index += 1;
  }
  if (depth !== 0) return null;
  return source.slice(start, index - 1);
};

const allSpecimensBlock = extractAllSpecimensBlock(specimenBarrel);
if (allSpecimensBlock === null) {
  errors.push(
    'src/specimens/index.ts must declare `export const allSpecimens = [...]` — the guard cannot verify registration',
  );
}
for (const [folder, files] of specimenFiles) {
  for (const file of files) {
    const modulePath = `../ui/${folder}/${file.replace(/\.(ts|tsx)$/, '')}`;
    const importMatch = specimenBarrel.match(
      new RegExp(
        `import\\s+\\{\\s*([A-Za-z0-9_]+)\\s*\\}\\s+from\\s+'${modulePath.replaceAll('/', '\\/')}'`,
      ),
    );
    if (!importMatch) {
      errors.push(`src/ui/${folder}/${file} is not imported in src/specimens/index.ts`);
      continue;
    }
    if (
      allSpecimensBlock !== null &&
      !new RegExp(`\\b${importMatch[1]}\\b`).test(allSpecimensBlock)
    ) {
      errors.push(
        `'${importMatch[1]}' is imported in src/specimens/index.ts but missing from allSpecimens`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}

console.log('Component catalog verified.');
