import { defineSpecimen } from '../../../specimens/define';
import { Switch } from '../index';
import type { SwitchProps } from '../index';

export const switchSpecimen = defineSpecimen<SwitchProps>({
  title: 'Switch',
  description: 'iOS-style on/off switch rendered as a native button[role="switch"].',
  component: Switch,
  argTypes: {
    checked: { control: 'boolean', defaultValue: false },
    disabled: { control: 'boolean', defaultValue: false },
    size: {
      control: 'select',
      options: ['small', 'medium'] as const,
      defaultValue: 'medium',
    },
    'aria-label': { control: 'text', defaultValue: 'Toggle setting' },
  },
  variants: [
    { name: 'Off', props: { checked: false, 'aria-label': 'Toggle setting' } },
    { name: 'On', props: { checked: true, 'aria-label': 'Toggle setting' } },
    { name: 'Small on', props: { checked: true, size: 'small', 'aria-label': 'Toggle setting' } },
    {
      name: 'Disabled off',
      props: { checked: false, disabled: true, 'aria-label': 'Toggle setting' },
    },
    {
      name: 'Disabled on',
      props: { checked: true, disabled: true, 'aria-label': 'Toggle setting' },
    },
  ],
});
