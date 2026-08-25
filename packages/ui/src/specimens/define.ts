import type { ComponentType } from 'react';

export type ControlType = 'text' | 'boolean' | 'select' | 'number' | 'color';

export type ArgDef<T> =
  | { control: 'text'; defaultValue: string }
  | { control: 'boolean'; defaultValue: boolean }
  | { control: 'number'; defaultValue: number }
  | { control: 'color'; defaultValue: string }
  | { control: 'select'; options: readonly T[]; defaultValue: T };

export type ArgTypes<Props extends object> = {
  [K in keyof Props]?: ArgDef<Props[K]>;
};

export type Variant<Props extends object> = {
  name: string;
  props: Partial<Props>;
};

export type SpecimenConfig<Props extends object> = {
  title: string;
  description?: string;
  component: ComponentType<Props>;
  argTypes: ArgTypes<Props>;
  variants: Variant<Props>[];
};

export function defineSpecimen<Props extends object>(
  config: SpecimenConfig<Props>,
): SpecimenConfig<Props> {
  return config;
}
