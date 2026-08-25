import { defineSpecimen } from '../../../specimens/define';
import { Checkbox } from '../index';
import type { CheckboxProps } from '../index';

export const checkboxSpecimen = defineSpecimen<CheckboxProps>({
  title: 'Checkbox',
  description: 'Controlled checkbox input with shared UI styling.',
  component: Checkbox,
  argTypes: {
    checked: { control: 'boolean', defaultValue: false },
    disabled: { control: 'boolean', defaultValue: false },
  },
  variants: [
    { name: 'Unchecked', props: { checked: false } },
    { name: 'Checked', props: { checked: true } },
    { name: 'Disabled unchecked', props: { checked: false, disabled: true } },
    { name: 'Disabled checked', props: { checked: true, disabled: true } },
  ],
});
