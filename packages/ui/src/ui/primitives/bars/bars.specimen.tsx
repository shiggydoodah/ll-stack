import { defineSpecimen } from '../../../specimens/define';
import { Bars } from '../index';

type BarsDemoProps = {
  series: 'month' | 'sparse' | 'empty';
  explicitMax: boolean;
  labelled: boolean;
};

// ── Sample data (ui-lab only) ────────────────────────────────────────────────────

// A deterministic 30-value "daily counts" series with visible shape (weekly-ish wave
// plus a ramp), mirroring the per-day stats the admin dashboard plots.
const MONTH_SERIES = Array.from({ length: 30 }, (_, i) => {
  const value = Math.round(6 + 5 * Math.sin(i / 2.2) + i / 4 + (i % 5));
  return { value, title: `2026-06-${String(i + 1).padStart(2, '0')}: ${value}` };
});

// Mostly-zero series — how sparse activity (e.g. premium grants) reads.
const SPARSE_SERIES = Array.from({ length: 30 }, (_, i) => {
  const value = i % 7 === 3 ? 2 : i % 11 === 5 ? 1 : 0;
  return { value, title: `2026-06-${String(i + 1).padStart(2, '0')}: ${value}` };
});

const SERIES: Record<BarsDemoProps['series'], { value: number; title?: string }[]> = {
  month: MONTH_SERIES,
  sparse: SPARSE_SERIES,
  empty: [],
};

const BarsDemo = ({
  series = 'month',
  explicitMax = false,
  labelled = true,
}: Partial<BarsDemoProps>) => (
  <Bars
    aria-label="Signups per day, 2026-06-01 to 2026-06-30"
    data={SERIES[series]}
    max={explicitMax ? 40 : undefined}
    labelStart={labelled ? '2026-06-01' : undefined}
    labelEnd={labelled ? '2026-06-30' : undefined}
  />
);

export const barsSpecimen = defineSpecimen<BarsDemoProps>({
  title: 'Bars',
  description:
    'Minimal vertical bar-series chart — a flex row of token-coloured divs with data-driven ' +
    'heights, a role="img" container with a required aria-label, and optional muted start/end ' +
    'axis labels. Server-safe (no hooks) and app-agnostic: it takes numbers and strings only. ' +
    'Per-bar hover shows the native title; there are no axes, gridlines, or tooltip layers.',
  component: BarsDemo,
  argTypes: {
    series: {
      control: 'select',
      options: ['month', 'sparse', 'empty'] as const,
      defaultValue: 'month',
    },
    explicitMax: { control: 'boolean', defaultValue: false },
    labelled: { control: 'boolean', defaultValue: true },
  },
  variants: [
    { name: '30-day series', props: { series: 'month' } },
    { name: 'Explicit max (40)', props: { series: 'month', explicitMax: true } },
    { name: 'Sparse series', props: { series: 'sparse' } },
    { name: 'Unlabelled', props: { series: 'month', labelled: false } },
    { name: 'Empty', props: { series: 'empty' } },
  ],
});
