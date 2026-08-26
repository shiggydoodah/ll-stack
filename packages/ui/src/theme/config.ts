import { z } from 'zod';

/**
 * Theme configuration schema — the contract between a hand-written (or, later,
 * theme-builder-exported) `themes/<name>/theme.json` and the CSS generator.
 *
 * Discipline limits, by design:
 * - `palette` holds AT MOST 12 named colors and is the only place raw hex
 *   values are allowed. Every color role references a palette name (`"ink"`)
 *   or a CSS color expression interpolating palette names
 *   (`"color-mix(in oklab, {ink} 92%, {paper})"`).
 * - At most 3 font roles (`body`, `display`, `mono`), 3 radii, 3 shadows,
 *   3 motion values (fast, slow, easing).
 *
 * Only `background`, `foreground`, `accent` and the six tones are required per
 * mode — everything else derives from them (see DERIVED_ROLES in generate.ts),
 * so a hand-authored theme stays ~40 lines while the future builder site can
 * still emit every key explicitly.
 */

const paletteName = /^[a-z][a-z0-9-]*$/;
const hexColor = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const containsHex = /#[0-9a-fA-F]{3,8}\b/;

/** Palette name, or a CSS color expression using `{name}` interpolations. */
const colorValue = z
  .string()
  .min(1)
  .refine((value) => !containsHex.test(value), {
    message: 'Raw hex values are only allowed in `palette` — reference a palette name instead',
  });

const toneSchema = z.object({
  base: colorValue,
  /** On-color for solid fills. Defaults to the better-contrasting of the mode's background/foreground. */
  contrast: colorValue.optional(),
});

const TONE_NAMES = ['red', 'green', 'amber', 'blue', 'purple', 'magenta'] as const;

const modeSchema = z.object({
  background: colorValue,
  foreground: colorValue,
  accent: colorValue,
  tones: z.object({
    red: toneSchema,
    green: toneSchema,
    amber: toneSchema,
    blue: toneSchema,
    purple: toneSchema,
    magenta: toneSchema,
  }),

  backgroundSubtle: colorValue.optional(),
  backgroundMuted: colorValue.optional(),
  accentHover: colorValue.optional(),
  /** On-color for accent fills. Defaults to the better-contrasting of the mode's background/foreground. */
  accentContrast: colorValue.optional(),
  /** Modal scrim behind dialogs/drawers. Defaults to rgb(0 0 0 / 0.7) in both modes. */
  overlay: colorValue.optional(),
  border: colorValue.optional(),
  borderStrong: colorValue.optional(),
  borderHover: colorValue.optional(),
  borderInvalid: colorValue.optional(),
  textBody: colorValue.optional(),
  textSubtle: colorValue.optional(),
  textMuted: colorValue.optional(),
  textInvalid: colorValue.optional(),
  inputBackground: colorValue.optional(),
  inputBackgroundFocus: colorValue.optional(),
  inputBackgroundInvalid: colorValue.optional(),
  focusRing: colorValue.optional(),
  focusRingBackground: colorValue.optional(),
  skeleton: z.object({ start: colorValue, mid: colorValue, end: colorValue }).optional(),
  /** Per-mode shadow override (e.g. a theme whose dark mode wants harder, pure-black offsets). */
  shadows: z.object({ sm: z.string(), md: z.string(), lg: z.string() }).optional(),
});

const fontFileSchema = z.object({
  /** Path relative to the theme folder, e.g. "fonts/PressStart2P-Regular.woff2". */
  path: z.string().min(1),
  weight: z.string().default('400'),
  style: z.enum(['normal', 'italic']).default('normal'),
});

const fontFaceSchema = z.object({
  family: z.string().min(1),
  fallbacks: z.array(z.string().min(1)).default([]),
  files: z.array(fontFileSchema).optional(),
});

const fontAliasSchema = z.object({ alias: z.enum(['body', 'display', 'mono']) });

const fontSchema = z.union([fontFaceSchema, fontAliasSchema]);

export const themeConfigSchema = z
  .object({
    $schema: z.string().optional(),
    name: z.string().regex(paletteName, 'Theme name must be a lowercase slug'),
    defaultMode: z.enum(['light', 'dark']).default('light'),
    palette: z
      .record(
        z.string().regex(paletteName),
        z
          .string()
          .regex(hexColor, '3- or 6-digit hex only — alpha would break contrast derivation'),
      )
      .refine((palette) => Object.keys(palette).length >= 2, {
        message: 'A palette needs at least 2 colors',
      })
      .refine((palette) => Object.keys(palette).length <= 12, {
        message: 'A palette holds at most 12 colors',
      }),
    modes: z.object({ light: modeSchema, dark: modeSchema }),
    fonts: z.object({
      body: fontSchema,
      display: fontSchema.default({ alias: 'body' }),
      mono: fontSchema.default({ alias: 'body' }),
    }),
    radius: z.object({ sm: z.string(), md: z.string(), lg: z.string() }),
    shadows: z.object({ sm: z.string(), md: z.string(), lg: z.string() }),
    border: z
      .object({
        width: z.string().default('1px'),
        style: z.enum(['solid', 'dashed', 'dotted', 'double']).default('solid'),
      })
      .default({ width: '1px', style: 'solid' }),
    motion: z
      .object({
        fast: z.string().default('150ms'),
        slow: z.string().default('300ms'),
        easing: z.string().default('cubic-bezier(0.2, 0, 0, 1)'),
      })
      .default({ fast: '150ms', slow: '300ms', easing: 'cubic-bezier(0.2, 0, 0, 1)' }),
    display: z
      .object({
        case: z.enum(['none', 'uppercase', 'lowercase', 'capitalize']).default('none'),
        tracking: z.string().default('normal'),
      })
      .default({ case: 'none', tracking: 'normal' }),
    /** Optional sibling CSS file (theme-folder-relative) for structural styling tokens cannot express. */
    custom: z.string().optional(),
  })
  .superRefine((config, ctx) => {
    // Every {name} interpolation must resolve to a palette entry.
    const names = new Set(Object.keys(config.palette));
    const checkInterpolations = (value: string, path: (string | number)[]) => {
      for (const match of value.matchAll(/\{([a-z0-9-]+)\}/g)) {
        if (!names.has(match[1] ?? '')) {
          ctx.addIssue({
            code: 'custom',
            path,
            message: `Unknown palette reference {${match[1]}}`,
          });
        }
      }
    };
    const checkRefs = (value: string, path: (string | number)[]) => {
      checkInterpolations(value, path);
      // A bare value that is neither an expression, a palette name, nor a CSS
      // keyword/function is almost certainly a typo'd palette name.
      if (
        !value.includes('{') &&
        !value.includes('(') &&
        !names.has(value) &&
        !['transparent', 'black', 'white', 'currentColor', 'inherit'].includes(value)
      ) {
        ctx.addIssue({
          code: 'custom',
          path,
          message: `"${value}" is not a palette name — add it to palette or use a CSS expression`,
        });
      }
    };

    for (const [modeName, mode] of Object.entries(config.modes)) {
      for (const [key, value] of Object.entries(mode)) {
        if (typeof value === 'string') checkRefs(value, ['modes', modeName, key]);
      }
      for (const tone of TONE_NAMES) {
        const t = mode.tones[tone];
        checkRefs(t.base, ['modes', modeName, 'tones', tone, 'base']);
        if (t.contrast) checkRefs(t.contrast, ['modes', modeName, 'tones', tone, 'contrast']);
      }
      if (mode.skeleton) {
        for (const [k, v] of Object.entries(mode.skeleton)) {
          checkRefs(v, ['modes', modeName, 'skeleton', k]);
        }
      }
      if (mode.shadows) {
        for (const [k, v] of Object.entries(mode.shadows)) {
          checkInterpolations(v, ['modes', modeName, 'shadows', k]);
        }
      }
    }
    for (const [k, v] of Object.entries(config.shadows)) {
      checkInterpolations(v, ['shadows', k]);
    }
  });

export type ThemeConfig = z.infer<typeof themeConfigSchema>;
export type ThemeMode = ThemeConfig['modes']['light'];
export type ThemeTone = ThemeMode['tones']['red'];
export { TONE_NAMES };
