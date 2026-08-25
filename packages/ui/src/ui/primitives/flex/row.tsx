import { Flex, type FlexLayoutProps } from './flex';

/** Props for {@link Row}. */
export interface RowProps extends FlexLayoutProps {
  /**
   * Stack children vertically below the `sm` breakpoint, switching to a row at `sm`+.
   * Set `false` to stay a row at every width.
   *
   * @defaultValue `true`
   */
  responsive?: boolean;
}

/**
 * Horizontal flex container (`flex-row`). By default it stacks vertically on small
 * screens (`responsive`) and becomes a row at `sm`+; pass `responsive={false}` to keep
 * it a row at every width. Forwards `ref` and any native `<div>` attribute.
 *
 * @example
 * ```tsx
 * <Row gap="sm" align="center" justify="between">
 *   <Avatar initials="AL" />
 *   <button type="button">Follow</button>
 * </Row>
 * ```
 */
export const Row = ({ responsive = true, ...props }: RowProps) => (
  <Flex direction={responsive ? 'responsive-row' : 'row'} {...props} />
);
