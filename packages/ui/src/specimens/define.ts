import type { ComponentType } from 'react';

// The individual control shapes. `ControlType` is derived from this union so
// adding an arm automatically widens it — no hand-maintained string union to
// drift out of sync.
type TextArgDef = { control: 'text'; defaultValue: string };
type BooleanArgDef = { control: 'boolean'; defaultValue: boolean };
type NumberArgDef = { control: 'number'; defaultValue: number };
type ColorArgDef = { control: 'color'; defaultValue: string };
type SelectArgDef<T> = { control: 'select'; options: readonly T[]; defaultValue: T };

type AnyArgDef = TextArgDef | BooleanArgDef | NumberArgDef | ColorArgDef | SelectArgDef<unknown>;

export type ControlType = AnyArgDef['control'];

/**
 * The control definition allowed for a prop of type `T`. Conditional on `T` so
 * control and prop type stay correlated — `{ control: 'text' }` on a boolean
 * prop is a compile error, and literal unions (`'sm' | 'md'`) get `'select'`
 * with matching `options`/`defaultValue` instead of free text.
 *
 * Arms (checked against `NonNullable<T>`, since optional props include
 * `undefined`):
 * - boolean → `'boolean'`
 * - number → `'number'` (or `'select'` to constrain the editor); numeric
 *   literal unions → `'select'` only
 * - string → `'text'`/`'color'` (or `'select'` to constrain the editor);
 *   string literal unions → `'select'` only
 * - anything that *accepts* a string (`ReactNode` children, `string | string[]`
 *   props) → `'text'` or `'select'`
 * - everything else → `'select'` over the prop's own union members
 */
export type ArgDef<T> = [NonNullable<T>] extends [boolean]
  ? BooleanArgDef
  : [NonNullable<T>] extends [number]
    ? number extends NonNullable<T>
      ? NumberArgDef | SelectArgDef<number>
      : SelectArgDef<NonNullable<T>>
    : [NonNullable<T>] extends [string]
      ? string extends NonNullable<T>
        ? TextArgDef | ColorArgDef | SelectArgDef<string>
        : SelectArgDef<NonNullable<T>>
      : string extends NonNullable<T>
        ? TextArgDef | SelectArgDef<NonNullable<T>>
        : SelectArgDef<NonNullable<T>>;

export type ArgTypes<Props extends object> = {
  [K in keyof Props]?: ArgDef<Props[K]>;
};

/**
 * A named showcase configuration. `props` is deliberately `Partial<Props>`:
 * variants describe deltas on top of the argType defaults, and forcing every
 * required prop here would bury the interesting ones in boilerplate. The
 * specimen render test mounts every variant (defaults + `props`), so a variant
 * that genuinely misses a required prop fails there rather than at the type
 * level.
 */
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

/**
 * Existential specimen type for heterogeneous collections (the registry,
 * render tests). `SpecimenConfig<any>` is deliberate: every entry has a
 * different concrete `Props`, TypeScript has no existential quantification,
 * and `SpecimenConfig<Record<string, unknown>>` fails because `ComponentType`
 * is contravariant in its props. Keep `any` confined to this one alias.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySpecimen = SpecimenConfig<any>;

export function defineSpecimen<Props extends object>(
  config: SpecimenConfig<Props>,
): SpecimenConfig<Props> {
  return config;
}

/**
 * The prop set a specimen renders with before anyone touches a control: every
 * argType's `defaultValue`, plus the *static* props of the first variant —
 * the ones it declares that no argType controls (e.g. DropDown's `options`).
 *
 * argType-controlled keys are filtered out deliberately. Those belong to the
 * PropEditor, and leaving variant 0's values underneath means selecting another
 * variant leaks variant 0's `tone`/`variant`/… through wherever the newly
 * selected variant doesn't override them.
 *
 * Shared by ui-lab's SpecimenPage, the render/SSR test matrices and the
 * design-kit exporter so all four agree on the default state.
 */
export function defaultRenderProps(specimen: AnySpecimen): Record<string, unknown> {
  const argDefaults = Object.fromEntries(
    Object.entries(specimen.argTypes).map(([k, def]) => [k, def?.defaultValue]),
  );
  const staticProps = Object.fromEntries(
    Object.entries(specimen.variants[0]?.props ?? {}).filter(([k]) => !(k in specimen.argTypes)),
  );
  return { ...argDefaults, ...staticProps };
}
