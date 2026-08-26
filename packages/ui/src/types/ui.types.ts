export type UiTone = 'neutral' | 'red' | 'green' | 'amber' | 'blue' | 'purple' | 'magenta';

export type UiVariant = 'solid' | 'surface' | 'soft' | 'outline' | 'ghost';

export type UiSize = 'xsmall' | 'small' | 'medium' | 'large' | 'xlarge';

/**
 * Typography-only scale used by Heading/Text/Display/Eyebrow. Distinct from
 * `UiSize` (the component sizing contract): this maps to font-size steps, so it
 * carries the extreme ends (`2xs`, `2xl`) plus a `default` per-level fallback.
 */
export type UiFontSize = 'default' | '2xs' | 'xs' | 'small' | 'medium' | 'large' | 'xl' | '2xl';
