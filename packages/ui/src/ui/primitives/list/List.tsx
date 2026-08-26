import { isValidElement } from 'react';
import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';
import { AlertTriangle, Ban, Check, Info, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '../../../lib/cn';
import { Icon } from '../icon';
import {
  listItemBaseClass,
  listItemIconAccentClass,
  listItemIconBaseClass,
  listItemIconInnerSize,
  listItemIconSizeClasses,
  listItemIconToneClasses,
  listRootBaseClass,
  type ListItemIconSize,
  type ListItemIconTone,
} from './list.styles';

/** Props for {@link List.Root}, which renders a `ul`. */
export interface ListRootProps extends ComponentPropsWithoutRef<'ul'> {
  ref?: Ref<HTMLUListElement>;
}

/** Props for {@link List.Item}, which renders a flex-row `li`. */
export interface ListItemProps extends ComponentPropsWithoutRef<'li'> {
  ref?: Ref<HTMLLIElement>;
}

/** Props for {@link List.ItemIcon} and the semantic preset icons. */
export interface ListItemIconProps extends ComponentPropsWithoutRef<'div'> {
  /**
   * Icon to render. Pass a Lucide icon component (rendered through the shared `Icon`
   * primitive at the mapped size) or any React element to render verbatim.
   *
   * @defaultValue `Check`
   */
  icon?: LucideIcon | ReactNode;

  /**
   * Brand tone for the icon colour and its soft tinted background. When omitted, the
   * brand accent colour is used.
   */
  tone?: ListItemIconTone;

  /**
   * Chip and icon size.
   *
   * @defaultValue `'medium'`
   */
  size?: ListItemIconSize;

  ref?: Ref<HTMLDivElement>;
}

/** Props for the semantic preset icons (`List.SuccessIcon` and friends) — icon and tone are fixed. */
export type ListPresetIconProps = Omit<ListItemIconProps, 'icon' | 'tone'>;

/**
 * Whether `icon` is a renderable component type (a Lucide icon) rather than an already-rendered
 * node. Lucide icons are `forwardRef` objects, so a `typeof === 'function'` check alone is not
 * enough. Anything else — elements, `null`, `false`, strings, numbers — is rendered verbatim.
 */
const isIconComponent = (icon: LucideIcon | ReactNode): icon is LucideIcon =>
  typeof icon === 'function' ||
  (typeof icon === 'object' && icon !== null && '$$typeof' in icon && !isValidElement(icon));

const ListRoot = ({ className, ref, ...props }: ListRootProps) => (
  <ul ref={ref} className={cn(listRootBaseClass, className)} {...props} />
);

ListRoot.displayName = 'List.Root';

const ListItem = ({ className, ref, ...props }: ListItemProps) => (
  <li ref={ref} className={cn(listItemBaseClass, className)} {...props} />
);

ListItem.displayName = 'List.Item';

const ListItemIcon = ({
  icon = Check,
  tone,
  size = 'medium',
  className,
  ref,
  ...props
}: ListItemIconProps) => (
  <div
    ref={ref}
    aria-hidden
    className={cn(
      listItemIconBaseClass,
      tone ? listItemIconToneClasses[tone] : listItemIconAccentClass,
      listItemIconSizeClasses[size],
      className,
    )}
    {...props}
  >
    {isIconComponent(icon) ? <Icon icon={icon} size={listItemIconInnerSize[size]} /> : icon}
  </div>
);

ListItemIcon.displayName = 'List.ItemIcon';

const SuccessIcon = (props: ListPresetIconProps) => (
  <ListItemIcon icon={Check} tone="green" {...props} />
);

SuccessIcon.displayName = 'List.SuccessIcon';

const DangerIcon = (props: ListPresetIconProps) => <ListItemIcon icon={X} tone="red" {...props} />;

DangerIcon.displayName = 'List.DangerIcon';

const WarningIcon = (props: ListPresetIconProps) => (
  <ListItemIcon icon={AlertTriangle} tone="amber" {...props} />
);

WarningIcon.displayName = 'List.WarningIcon';

const InfoIcon = (props: ListPresetIconProps) => (
  <ListItemIcon icon={Info} tone="blue" {...props} />
);

InfoIcon.displayName = 'List.InfoIcon';

const DisabledIcon = ({ className, ...props }: ListPresetIconProps) => (
  <ListItemIcon
    icon={Ban}
    tone="neutral"
    className={cn('bg-(--ui-text-subtle)/10 text-(--ui-text-subtle)', className)}
    {...props}
  />
);

DisabledIcon.displayName = 'List.DisabledIcon';

/**
 * Compound list for displaying items with optional leading icons.
 *
 * Compose `List.Root` (a styled `ul`) with `List.Item`s (flex-row `li`s). Place a
 * `List.ItemIcon` — or one of the semantic presets — as the leading child of an item.
 * Item text defaults to `--ui-foreground`; style your own children to override it.
 *
 * - `List.ItemIcon` — generic icon chip with a custom `icon` (Lucide component or React
 *   element) and `tone` (defaults to the brand accent) plus a soft tinted background.
 * - `List.SuccessIcon` / `DangerIcon` / `WarningIcon` / `InfoIcon` / `DisabledIcon` —
 *   thin presets over `List.ItemIcon` with a fixed icon + tone, still taking `size`/`className`.
 *
 * @example
 * ```tsx
 * <List.Root>
 *   <List.Item><List.SuccessIcon /> Backup complete</List.Item>
 *   <List.Item><List.DangerIcon /> Upload failed</List.Item>
 *   <List.Item>
 *     <List.ItemIcon icon={Star} tone="amber" size="large" />
 *     <span className="text-(--ui-accent)">Custom</span>
 *   </List.Item>
 * </List.Root>
 * ```
 */
export const List = {
  Root: ListRoot,
  Item: ListItem,
  ItemIcon: ListItemIcon,
  SuccessIcon,
  DangerIcon,
  WarningIcon,
  InfoIcon,
  DisabledIcon,
};
