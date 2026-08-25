import { Flex, type FlexLayoutProps } from './flex';

/** Props for {@link Stack}. */
export type StackProps = FlexLayoutProps;

/**
 * Vertical flex container (`flex-col`). Lays children top-to-bottom using the shared
 * `gap`/`padding` scale and `align`/`justify` props, so app layouts don't hand-roll
 * flex utilities. Forwards `ref` and any native `<div>` attribute.
 *
 * @example
 * ```tsx
 * <Stack gap="md" padding="lg" align="start">
 *   <h2>Title</h2>
 *   <p>Body copy</p>
 * </Stack>
 * ```
 */
export const Stack = (props: StackProps) => <Flex direction="col" {...props} />;
