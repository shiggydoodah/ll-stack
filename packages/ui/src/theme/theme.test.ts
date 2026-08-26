import { describe, expect, it } from 'vitest';

import defaultTheme from '../../themes/default/theme.json';
import { themeConfigSchema } from './config';
import { generateThemeCss } from './generate';

const minimalTheme = {
  name: 'minimal',
  palette: { ink: '#111111', paper: '#fafafa' },
  modes: {
    light: {
      background: 'paper',
      foreground: 'ink',
      accent: 'ink',
      tones: {
        red: { base: 'color-mix(in oklab, {ink} 60%, {paper})' },
        green: { base: 'ink' },
        amber: { base: 'ink' },
        blue: { base: 'ink' },
        purple: { base: 'ink' },
        magenta: { base: 'ink' },
      },
    },
    dark: {
      background: 'ink',
      foreground: 'paper',
      accent: 'paper',
      tones: {
        red: { base: 'paper' },
        green: { base: 'paper' },
        amber: { base: 'paper' },
        blue: { base: 'paper' },
        purple: { base: 'paper' },
        magenta: { base: 'paper' },
      },
    },
  },
  fonts: { body: { family: 'system-ui', fallbacks: ['sans-serif'] } },
  radius: { sm: '4px', md: '6px', lg: '10px' },
  shadows: { sm: 'none', md: 'none', lg: 'none' },
};

// Exercises the optional surface the shipped default theme doesn't touch:
// self-hosted font files, per-mode shadow overrides and a custom.css chain.
const maximalTheme = {
  ...minimalTheme,
  name: 'maximal',
  modes: {
    ...minimalTheme.modes,
    dark: {
      ...minimalTheme.modes.dark,
      shadows: { sm: '3px 3px 0 0 black', md: '4px 4px 0 0 black', lg: '6px 6px 0 0 black' },
    },
  },
  fonts: {
    body: {
      family: 'Pixel Body',
      fallbacks: ['monospace'],
      files: [{ path: 'fonts/PixelBody-Regular.woff2', weight: '400' }],
    },
    display: {
      family: 'Pixel Display',
      fallbacks: ['monospace'],
      files: [{ path: 'fonts/PixelDisplay-Regular.woff2', weight: '400' }],
    },
    mono: { alias: 'body' },
  },
  shadows: { sm: '3px 3px 0 0 {ink}', md: '4px 4px 0 0 {ink}', lg: '6px 6px 0 0 {ink}' },
  custom: 'custom.css',
};

describe('themeConfigSchema', () => {
  it('accepts the shipped default theme', () => {
    expect(themeConfigSchema.safeParse(defaultTheme).success).toBe(true);
  });

  it('accepts a maximal theme (font files, per-mode shadows, custom.css)', () => {
    expect(themeConfigSchema.safeParse(maximalTheme).success).toBe(true);
  });

  it('accepts a minimal theme and fills defaults', () => {
    const parsed = themeConfigSchema.parse(minimalTheme);
    expect(parsed.defaultMode).toBe('light');
    expect(parsed.border).toEqual({ width: '1px', style: 'solid' });
    expect(parsed.fonts.display).toEqual({ alias: 'body' });
    expect(parsed.display.case).toBe('none');
  });

  it('rejects raw hex outside the palette', () => {
    const invalid = structuredClone(minimalTheme);
    invalid.modes.light.background = '#ffffff';
    const result = themeConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects unknown palette references', () => {
    const invalid = structuredClone(minimalTheme);
    invalid.modes.light.tones.red.base = 'color-mix(in oklab, {crimson} 60%, {paper})';
    const result = themeConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('crimson');
  });

  it('rejects typo palette names used bare', () => {
    const invalid = structuredClone(minimalTheme);
    invalid.modes.light.accent = 'inks';
    expect(themeConfigSchema.safeParse(invalid).success).toBe(false);
  });

  it('caps the palette at 12 colors', () => {
    const invalid = structuredClone(minimalTheme) as { palette: Record<string, string> };
    for (let i = 0; i < 13; i += 1) invalid.palette[`extra-${i}`] = '#123456';
    expect(themeConfigSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('generateThemeCss', () => {
  const config = themeConfigSchema.parse(minimalTheme);
  const { tokensCss, indexCss } = generateThemeCss(config);

  it('scopes everything under [data-theme] with no :root block', () => {
    expect(tokensCss).toContain("[data-theme='minimal']");
    expect(tokensCss).not.toMatch(/^:root/m);
  });

  it('emits both modes: default inline, then symmetric mode blocks', () => {
    expect(tokensCss).toContain(
      "[data-mode='dark'] :where([data-theme='minimal']),\n[data-theme='minimal'][data-mode='dark'],\n[data-theme='minimal'] :where([data-mode='dark'])",
    );
    expect(tokensCss).toContain("[data-theme='minimal'][data-mode='light']");
    expect(tokensCss).toContain('color-scheme: dark;');
    // default-mode pin comes last so islands can force it back
    expect(tokensCss.lastIndexOf("[data-mode='light']")).toBeGreaterThan(
      tokensCss.lastIndexOf("[data-mode='dark'] :where"),
    );
  });

  it('resolves palette names and {ref} interpolations to literal values', () => {
    expect(tokensCss).toContain('--ui-background: #fafafa;');
    expect(tokensCss).toContain('--ui-tone-red: color-mix(in oklab, #111111 60%, #fafafa);');
    expect(tokensCss).not.toMatch(/\{[a-z-]+\}/);
  });

  it('derives unspecified roles from background/foreground/accent', () => {
    expect(tokensCss).toContain('--ui-border: color-mix(in oklab, #fafafa 86%, #111111);');
    expect(tokensCss).toContain('--ui-text-muted: color-mix(in oklab, #111111 45%, #fafafa);');
  });

  it('defaults tone contrast to the better-contrasting of background/foreground', () => {
    // dark mode: paper (#fafafa) tones on ink background -> ink contrasts better
    const darkBlock = tokensCss.slice(tokensCss.indexOf("[data-mode='dark']"));
    expect(darkBlock).toContain('--ui-tone-green: #fafafa;');
    expect(darkBlock).toContain('--ui-tone-green-contrast: #111111;');
  });

  it('emits @font-face only for themes with font files', () => {
    expect(tokensCss).not.toContain('@font-face');
    const maximal = generateThemeCss(themeConfigSchema.parse(maximalTheme), {
      hasCustomCss: true,
    });
    expect(maximal.tokensCss).toContain(
      "src: url('./fonts/PixelBody-Regular.woff2') format('woff2');",
    );
  });

  it('embeds font files as data URIs when their contents are provided', () => {
    const maximal = generateThemeCss(themeConfigSchema.parse(maximalTheme), {
      hasCustomCss: true,
      fontFiles: {
        'fonts/PixelBody-Regular.woff2': 'Qk9EWQ==',
        'fonts/PixelDisplay-Regular.woff2': 'RElTUExBWQ==',
      },
    });
    expect(maximal.tokensCss).toContain(
      "src: url(data:font/woff2;base64,Qk9EWQ==) format('woff2');",
    );
    expect(maximal.tokensCss).not.toContain("url('./fonts/");
  });

  it('chains custom.css after tokens in index.css only when present', () => {
    expect(indexCss).toContain("@import './tokens.gen.css';");
    expect(indexCss).not.toContain('custom.css');
    const withCustom = generateThemeCss(config, { hasCustomCss: true });
    expect(withCustom.indexCss.indexOf('tokens.gen.css')).toBeLessThan(
      withCustom.indexCss.indexOf('custom.css'),
    );
  });

  it('honours per-mode shadow overrides', () => {
    const maximal = generateThemeCss(themeConfigSchema.parse(maximalTheme), {
      hasCustomCss: true,
    });
    expect(maximal.tokensCss).toContain('--ui-shadow-md: 4px 4px 0 0 #111111;');
    const darkBlock = maximal.tokensCss.slice(maximal.tokensCss.indexOf("[data-mode='dark']"));
    expect(darkBlock).toContain('--ui-shadow-md: 4px 4px 0 0 black;');
  });
});
