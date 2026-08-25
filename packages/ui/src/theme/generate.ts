import type { ThemeConfig, ThemeMode } from './config';
import { TONE_NAMES } from './config';

/**
 * Pure theme-CSS generator: `ThemeConfig` in, CSS strings out. No filesystem
 * access — the CLI wrapper (scripts/generate-themes.ts) does the IO, and the
 * future theme-builder site can import this module verbatim to produce
 * byte-identical output in the browser.
 *
 * Scoping model (no `:root` blocks — a theme only ever applies where the app
 * has placed its `data-theme` attribute). The base block carries structure
 * tokens plus the default mode's colors; then each mode gets a symmetric
 * 3-selector block:
 *
 *   [data-mode='m'] :where([data-theme='x'])   page-level mode above a theme root
 *   [data-theme='x'][data-mode='m']            both attributes on one element
 *   [data-theme='x'] :where([data-mode='m'])   a bare mode island inside the themed subtree
 *
 * The `:where()` keeps descendant rules at single-attribute specificity, so
 * the two-attribute same-element form always wins, and nested mode islands
 * resolve by inheritance proximity. The default mode's block comes last so an
 * island can force the default mode back inside an inverted page.
 */

export interface GeneratedTheme {
  /** themes/<name>/tokens.gen.css — @font-face rules + token blocks. */
  tokensCss: string;
  /** themes/<name>/index.css — the import entrypoint apps consume. */
  indexCss: string;
}

export interface GenerateOptions {
  /** Whether the theme folder has a custom.css to chain after the tokens. */
  hasCustomCss?: boolean;
  /**
   * Font file contents keyed by their theme-relative path, base64-encoded.
   * When provided, @font-face rules embed the file as a data: URI — relative
   * url() references do not survive Tailwind v4's cross-package CSS inlining
   * (the rebased path escapes the consumer's server root), while data URIs
   * work in every bundler, dev and prod, with zero consumer configuration.
   * woff2 is already compressed, so the base64 overhead disappears under
   * HTTP compression.
   */
  fontFiles?: Record<string, string>;
}

/** Resolve a palette name or `{name}`-interpolated expression to literal CSS. */
const resolveColor = (value: string, palette: Record<string, string>): string => {
  const direct = palette[value];
  if (direct) return direct;
  return value.replaceAll(/\{([a-z0-9-]+)\}/g, (_, name: string) => palette[name] ?? name);
};

// ── WCAG contrast heuristic for default tone on-colors ─────────────────────────

const hexToRgb = (hex: string): [number, number, number] | null => {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex) ?? /^#([0-9a-fA-F]{3})$/.exec(hex);
  if (!match) return null;
  let h = match[1] ?? '';
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
};

const luminance = (rgb: [number, number, number]): number => {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrastRatio = (a: string, b: string): number | null => {
  const rgbA = hexToRgb(a);
  const rgbB = hexToRgb(b);
  if (!rgbA || !rgbB) return null;
  const [hi, lo] = [luminance(rgbA), luminance(rgbB)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * Default on-color for a solid tone fill: whichever of the mode's
 * background/foreground contrasts better against the tone base. Falls back to
 * the background (bright fills on light themes take light text, dark fills on
 * dark themes take dark text — the common case) when a value is not a literal
 * hex we can measure.
 */
const defaultToneContrast = (toneBase: string, background: string, foreground: string): string => {
  const vsBg = contrastRatio(toneBase, background);
  const vsFg = contrastRatio(toneBase, foreground);
  if (vsBg === null || vsFg === null) return background;
  return vsFg > vsBg ? foreground : background;
};

// ── Derivation defaults for optional roles ─────────────────────────────────────

const mix = (a: string, pct: number, b: string) => `color-mix(in oklab, ${a} ${pct}%, ${b})`;

type ResolvedBase = { bg: string; fg: string; accent: string; red: string };

/** token name -> derivation from the required roles. Documented in the README. */
const DERIVED_ROLES: Record<string, (base: ResolvedBase) => string> = {
  'background-subtle': ({ bg, fg }) => mix(bg, 95, fg),
  'background-muted': ({ bg, fg }) => mix(bg, 90, fg),
  'accent-hover': ({ accent, fg }) => mix(accent, 82, fg),
  border: ({ bg, fg }) => mix(bg, 86, fg),
  'border-strong': ({ bg, fg }) => mix(bg, 76, fg),
  'border-hover': ({ bg, fg }) => mix(bg, 62, fg),
  'border-invalid': ({ red }) => red,
  'text-body': ({ bg, fg }) => mix(fg, 94, bg),
  'text-subtle': ({ bg, fg }) => mix(fg, 62, bg),
  'text-muted': ({ bg, fg }) => mix(fg, 45, bg),
  'text-invalid': ({ red }) => red,
  'input-background': ({ bg, fg }) => mix(bg, 96, fg),
  'input-background-focus': ({ bg }) => bg,
  'input-background-invalid': ({ bg, red }) => mix(bg, 92, red),
  'focus-ring': ({ accent }) => accent,
  'focus-ring-background': ({ bg }) => bg,
  'skeleton-bg-start': ({ bg, fg }) => mix(bg, 92, fg),
  'skeleton-bg-mid': ({ bg, fg }) => mix(bg, 85, fg),
  'skeleton-bg-end': ({ bg, fg }) => mix(bg, 92, fg),
};

/** Config keys (camelCase) mapped to token slugs, for explicit overrides. */
const ROLE_KEYS: Record<string, string> = {
  backgroundSubtle: 'background-subtle',
  backgroundMuted: 'background-muted',
  accentHover: 'accent-hover',
  border: 'border',
  borderStrong: 'border-strong',
  borderHover: 'border-hover',
  borderInvalid: 'border-invalid',
  textBody: 'text-body',
  textSubtle: 'text-subtle',
  textMuted: 'text-muted',
  textInvalid: 'text-invalid',
  inputBackground: 'input-background',
  inputBackgroundFocus: 'input-background-focus',
  inputBackgroundInvalid: 'input-background-invalid',
  focusRing: 'focus-ring',
  focusRingBackground: 'focus-ring-background',
};

// ── Emission ───────────────────────────────────────────────────────────────────

const modeColorLines = (mode: ThemeMode, palette: Record<string, string>): string[] => {
  const resolve = (value: string) => resolveColor(value, palette);
  const bg = resolve(mode.background);
  const fg = resolve(mode.foreground);
  const accent = resolve(mode.accent);
  const red = resolve(mode.tones.red.base);
  const base: ResolvedBase = { bg, fg, accent, red };

  const lines: string[] = [
    `--ui-background: ${bg};`,
    `--ui-foreground: ${fg};`,
    `--ui-accent: ${accent};`,
  ];

  for (const [configKey, slug] of Object.entries(ROLE_KEYS)) {
    const explicit = (mode as unknown as Record<string, string | undefined>)[configKey];
    const derive = DERIVED_ROLES[slug];
    const value = explicit != null ? resolve(explicit) : derive ? derive(base) : undefined;
    if (value != null) lines.push(`--ui-${slug}: ${value};`);
  }

  const skeleton = mode.skeleton
    ? {
        start: resolve(mode.skeleton.start),
        mid: resolve(mode.skeleton.mid),
        end: resolve(mode.skeleton.end),
      }
    : {
        start: DERIVED_ROLES['skeleton-bg-start']!(base),
        mid: DERIVED_ROLES['skeleton-bg-mid']!(base),
        end: DERIVED_ROLES['skeleton-bg-end']!(base),
      };
  lines.push(
    `--ui-skeleton-bg-start: ${skeleton.start};`,
    `--ui-skeleton-bg-mid: ${skeleton.mid};`,
    `--ui-skeleton-bg-end: ${skeleton.end};`,
  );

  for (const tone of TONE_NAMES) {
    const t = mode.tones[tone];
    const toneBase = resolve(t.base);
    const contrast = t.contrast ? resolve(t.contrast) : defaultToneContrast(toneBase, bg, fg);
    lines.push(`--ui-tone-${tone}: ${toneBase};`, `--ui-tone-${tone}-contrast: ${contrast};`);
  }

  if (mode.shadows) {
    lines.push(
      `--ui-shadow-sm: ${resolve(mode.shadows.sm)};`,
      `--ui-shadow-md: ${resolve(mode.shadows.md)};`,
      `--ui-shadow-lg: ${resolve(mode.shadows.lg)};`,
    );
  }

  return lines;
};

const fontStack = (config: ThemeConfig, role: 'body' | 'display' | 'mono'): string => {
  const font = config.fonts[role];
  if ('alias' in font) return `var(--ui-font-${font.alias})`;
  const family = font.family.includes(' ') ? `'${font.family}'` : font.family;
  return [family, ...font.fallbacks].join(', ');
};

const fontFaces = (config: ThemeConfig, fontFiles: Record<string, string>): string[] => {
  const blocks: string[] = [];
  const seen = new Set<string>();
  for (const role of ['body', 'display', 'mono'] as const) {
    const font = config.fonts[role];
    if ('alias' in font || !font.files) continue;
    for (const file of font.files) {
      const key = `${font.family}|${file.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const data = fontFiles[file.path];
      const src = data
        ? `url(data:font/woff2;base64,${data}) format('woff2')`
        : `url('./${file.path}') format('woff2')`;
      blocks.push(
        [
          '@font-face {',
          `  font-family: '${font.family}';`,
          `  src: ${src};`,
          `  font-weight: ${file.weight};`,
          `  font-style: ${file.style};`,
          '  font-display: swap;',
          '}',
        ].join('\n'),
      );
    }
  }
  return blocks;
};

const block = (selector: string, lines: string[], indent = '  '): string =>
  `${selector} {\n${lines.map((line) => indent + line).join('\n')}\n}`;

export const generateThemeCss = (
  config: ThemeConfig,
  options: GenerateOptions = {},
): GeneratedTheme => {
  const { palette, name, defaultMode } = config;
  const otherMode = defaultMode === 'light' ? 'dark' : 'light';
  const resolve = (value: string) => resolveColor(value, palette);

  const structureLines = [
    `--ui-font-body: ${fontStack(config, 'body')};`,
    `--ui-font-display: ${fontStack(config, 'display')};`,
    `--ui-font-mono: ${fontStack(config, 'mono')};`,
    `--ui-display-case: ${config.display.case};`,
    `--ui-display-tracking: ${config.display.tracking};`,
    `--ui-radius-sm: ${config.radius.sm};`,
    `--ui-radius-md: ${config.radius.md};`,
    `--ui-radius-lg: ${config.radius.lg};`,
    `--ui-shadow-sm: ${resolve(config.shadows.sm)};`,
    `--ui-shadow-md: ${resolve(config.shadows.md)};`,
    `--ui-shadow-lg: ${resolve(config.shadows.lg)};`,
    `--ui-border-width: ${config.border.width};`,
    `--ui-border-style: ${config.border.style};`,
    `--ui-motion-fast: ${config.motion.fast};`,
    `--ui-motion-slow: ${config.motion.slow};`,
    `--ui-ease: ${config.motion.easing};`,
  ];

  // A debugging courtesy: the raw palette, readable in DevTools.
  const paletteLines = Object.entries(palette).map(([key, hex]) => `--ui-p-${key}: ${hex};`);

  const banner = [
    '/*',
    ` * GENERATED by scripts/generate-themes.ts from theme.json — do not edit.`,
    ` * Theme: ${name} (default mode: ${defaultMode})`,
    ' */',
  ].join('\n');

  const modeSelector = (mode: string) =>
    [
      `[data-mode='${mode}'] :where([data-theme='${name}'])`,
      `[data-theme='${name}'][data-mode='${mode}']`,
      `[data-theme='${name}'] :where([data-mode='${mode}'])`,
    ].join(',\n');

  const tokensCss = [
    banner,
    ...fontFaces(config, options.fontFiles ?? {}),
    block(`[data-theme='${name}']`, [
      `color-scheme: ${defaultMode};`,
      ...paletteLines,
      ...structureLines,
      ...modeColorLines(config.modes[defaultMode], palette),
    ]),
    block(modeSelector(otherMode), [
      `color-scheme: ${otherMode};`,
      ...modeColorLines(config.modes[otherMode], palette),
    ]),
    block(modeSelector(defaultMode), [
      `color-scheme: ${defaultMode};`,
      ...modeColorLines(config.modes[defaultMode], palette),
    ]),
  ].join('\n\n');

  const indexCss = [
    `/* GENERATED — the '${name}' theme entrypoint. Import after @ll-ui/react/styles.css. */`,
    `@import './tokens.gen.css';`,
    ...(options.hasCustomCss ? [`@import './${config.custom ?? 'custom.css'}';`] : []),
  ].join('\n');

  return { tokensCss: tokensCss + '\n', indexCss: indexCss + '\n' };
};
