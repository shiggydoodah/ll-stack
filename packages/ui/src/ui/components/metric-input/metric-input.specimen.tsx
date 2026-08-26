import { useState } from 'react';
import { defineSpecimen } from '../../../specimens/define';
import { MetricInput } from '../../../index';
import type { MetricDimension, MetricInputSelector } from '../../../index';

type MetricInputDemoProps = {
  dimension: MetricDimension;
  selector: MetricInputSelector;
  invalid: boolean;
  disabled: boolean;
};

// Curated unit subsets per dimension keep the toggle compact in the lab.
const unitsByDimension: Record<MetricDimension, string[]> = {
  weight: ['kg', 'lb'],
  length: ['cm', 'in', 'ft'],
  volume: ['l', 'ml', 'gal'],
};

// Initial value expressed in each dimension's canonical (first) unit.
const initialByDimension: Record<MetricDimension, number> = {
  weight: 10, // kg
  length: 180, // cm
  volume: 1.5, // L
};

/**
 * Stateful wrapper so the controlled `MetricInput` can be driven by the lab's
 * prop editor. Keeps an independent value per dimension so switching dimension
 * is lossless.
 */
const MetricInputDemo = ({
  dimension = 'weight',
  selector = 'auto',
  invalid = false,
  disabled = false,
}: Partial<MetricInputDemoProps>) => {
  const [values, setValues] = useState<Record<MetricDimension, number | null>>(initialByDimension);

  const setValue = (next: number | null) => setValues((prev) => ({ ...prev, [dimension]: next }));

  return (
    <div className="w-full max-w-sm p-8">
      <MetricInput
        aria-label={`${dimension} value`}
        id={`metric-input-${dimension}`}
        dimension={dimension}
        disabled={disabled}
        invalid={invalid}
        onChange={setValue}
        selector={selector}
        unitLabel={`${dimension} unit`}
        units={unitsByDimension[dimension]}
        value={values[dimension]}
      />
    </div>
  );
};

export const metricInputSpecimen = defineSpecimen<MetricInputDemoProps>({
  title: 'MetricInput',
  description:
    'Controlled number input paired with a switchable unit. The value/onChange stay in one ' +
    'canonical unit (e.g. kg) while the user views/edits another (e.g. lb) — switching units only ' +
    're-formats the display. Built-in weight/length/volume presets + a custom `units` escape hatch. ' +
    'For form-bound use, see MetricField.',
  component: MetricInputDemo,
  argTypes: {
    dimension: {
      control: 'select',
      options: ['weight', 'length', 'volume'] as const,
      defaultValue: 'weight',
    },
    selector: {
      control: 'select',
      options: ['auto', 'toggle', 'select'] as const,
      defaultValue: 'auto',
    },
    invalid: { control: 'boolean', defaultValue: false },
    disabled: { control: 'boolean', defaultValue: false },
  },
  variants: [
    { name: 'Weight (kg · lb toggle)', props: { dimension: 'weight', selector: 'toggle' } },
    { name: 'Length (dropdown)', props: { dimension: 'length', selector: 'select' } },
    { name: 'Volume (auto)', props: { dimension: 'volume', selector: 'auto' } },
    { name: 'Invalid + disabled', props: { dimension: 'weight', invalid: true, disabled: true } },
  ],
});
