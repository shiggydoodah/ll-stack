import { defineSpecimen } from '../../../specimens/define';
import { PasswordStrengthMeter } from '../index';
import type { PasswordStrength, PasswordStrengthMeterProps } from '../index';

export const passwordStrengthMeterSpecimen = defineSpecimen<PasswordStrengthMeterProps>({
  title: 'PasswordStrengthMeter',
  description: 'Visual indicator of password strength on a 0–4 scale.',
  component: PasswordStrengthMeter,
  argTypes: {
    strength: {
      control: 'select',
      options: [0, 1, 2, 3, 4] as const satisfies readonly PasswordStrength[],
      defaultValue: 0,
    },
  },
  variants: [
    { name: 'Too short (0)', props: { strength: 0 } },
    { name: 'Weak (1)', props: { strength: 1 } },
    { name: 'Medium (2)', props: { strength: 2 } },
    { name: 'Strong (3)', props: { strength: 3 } },
    { name: 'Very strong (4)', props: { strength: 4 } },
  ],
});
