import { createElement } from 'react';

import { defineSpecimen } from '../../../specimens/define';
import { Select } from '../index';
import type { SelectProps } from '../index';

const exampleOptions = [
  createElement('option', { value: '', key: 'placeholder' }, 'Choose…'),
  createElement('option', { value: 'apple', key: 'apple' }, 'Apple'),
  createElement('option', { value: 'banana', key: 'banana' }, 'Banana'),
  createElement('option', { value: 'cherry', key: 'cherry' }, 'Cherry'),
];

export const selectSpecimen = defineSpecimen<SelectProps>({
  title: 'Select',
  description: 'Native select element with custom chevron styling.',
  component: Select,
  argTypes: {
    disabled: { control: 'boolean', defaultValue: false },
  },
  variants: [
    { name: 'Default', props: { children: exampleOptions } },
    { name: 'Disabled', props: { children: exampleOptions, disabled: true } },
    { name: 'Multiple', props: { children: exampleOptions, multiple: true, size: 4 } },
  ],
});
