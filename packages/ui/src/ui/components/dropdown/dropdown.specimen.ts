import { defineSpecimen } from '../../../specimens/define';
import { DropDown } from '../index';
import type { DropDownOption, DropDownProps } from '../index';

const sampleOptions: DropDownOption[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
  { value: 'date', label: 'Date' },
  { value: 'elderberry', label: 'Elderberry' },
];

export const dropDownSpecimen = defineSpecimen<DropDownProps>({
  title: 'DropDown',
  description: 'Combobox with single/multi-select and optional search.',
  component: DropDown,
  argTypes: {
    placeholder: { control: 'text', defaultValue: 'Select…' },
    disabled: { control: 'boolean', defaultValue: false },
    multiple: { control: 'boolean', defaultValue: false },
    searchable: { control: 'boolean', defaultValue: false },
  },
  variants: [
    { name: 'Single select', props: { options: sampleOptions, placeholder: 'Select…' } },
    {
      name: 'Multi-select',
      props: { options: sampleOptions, multiple: true, placeholder: 'Select…' },
    },
    {
      name: 'Searchable',
      props: { options: sampleOptions, searchable: true, placeholder: 'Search…' },
    },
    {
      name: 'Disabled',
      props: { options: sampleOptions, disabled: true, placeholder: 'Select…' },
    },
  ],
});
