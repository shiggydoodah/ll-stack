import { defineSpecimen } from '../../../specimens/define';
import { Radio } from '../index';
import type { RadioProps } from '../index';

export const radioSpecimen = defineSpecimen<RadioProps>({
  title: 'Radio',
  description: 'Radio button input with shared UI styling.',
  component: Radio,
  argTypes: {
    disabled: { control: 'boolean', defaultValue: false },
  },
  variants: [
    { name: 'Unselected', props: {} },
    { name: 'Selected', props: { defaultChecked: true } },
    { name: 'Disabled', props: { disabled: true } },
    { name: 'Disabled selected', props: { defaultChecked: true, disabled: true } },
  ],
});
