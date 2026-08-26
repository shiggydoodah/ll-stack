import { defineSpecimen } from '../../../specimens/define';
import { Checkbox } from '../index';
import type { CheckboxProps } from '../index';

export const checkboxSpecimen = defineSpecimen<CheckboxProps>({
  title: 'Checkbox',
  description: 'Checkbox input with shared UI styling; works controlled or uncontrolled.',
  component: Checkbox,
  argTypes: {
    checked: { control: 'boolean', defaultValue: false },
    disabled: { control: 'boolean', defaultValue: false },
  },
  variants: [
    { name: 'Unchecked', props: { checked: false } },
    { name: 'Checked', props: { checked: true } },
    // `checked` is an argType, so its default sits under every variant — an
    // uncontrolled variant has to clear it explicitly or React sees both
    // `checked` and `defaultChecked` on the same input and warns.
    {
      name: 'Uncontrolled (defaultChecked)',
      props: { checked: undefined, defaultChecked: true, name: 'remember' },
    },
    { name: 'Disabled unchecked', props: { checked: false, disabled: true } },
    { name: 'Disabled checked', props: { checked: true, disabled: true } },
  ],
});
