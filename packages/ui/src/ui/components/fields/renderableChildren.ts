import { Fragment, isValidElement, type ReactNode } from 'react';

export const hasRenderableChildren = (children: ReactNode): boolean => {
  if (
    children === null ||
    children === undefined ||
    typeof children === 'boolean' ||
    (typeof children === 'string' && children.trim().length === 0)
  ) {
    return false;
  }

  if (Array.isArray(children)) {
    return children.some(hasRenderableChildren);
  }

  if (isValidElement<{ children?: ReactNode }>(children) && children.type === Fragment) {
    return hasRenderableChildren(children.props.children);
  }

  return true;
};
