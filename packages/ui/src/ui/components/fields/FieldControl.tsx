import {
  Children,
  cloneElement,
  isValidElement,
  type AriaAttributes,
  type ReactElement,
} from 'react';

import { useFieldContext } from './FieldContext';

type FieldControlInjectedProps = {
  'aria-describedby'?: string;
  'aria-invalid'?: AriaAttributes['aria-invalid'];
  'aria-labelledby'?: string;
  'aria-required'?: AriaAttributes['aria-required'];
  disabled?: boolean;
  id?: string;
  name?: string;
};

export interface FieldControlProps {
  children: ReactElement<FieldControlInjectedProps>;
}

export const FieldControl = ({ children }: FieldControlProps) => {
  const { describedBy, disabled, id, invalid, labelAssociation, labelId, name, required } =
    useFieldContext();
  const child = Children.only(children);

  if (!isValidElement<FieldControlInjectedProps>(child)) {
    throw new Error('FieldControl expects exactly one React element child.');
  }

  const childProps = child.props;
  const injectedProps: FieldControlInjectedProps = {
    id: childProps.id ?? id,
    name: childProps.name ?? name,
    'aria-invalid': childProps['aria-invalid'] ?? (invalid ? true : undefined),
    'aria-labelledby':
      childProps['aria-labelledby'] ?? (labelAssociation === 'labelledby' ? labelId : undefined),
    'aria-describedby':
      childProps['aria-describedby'] ?? (describedBy.length > 0 ? describedBy : undefined),
    'aria-required': childProps['aria-required'] ?? (required ? true : undefined),
    disabled: childProps.disabled ?? (disabled ? true : undefined),
  };

  return cloneElement(child, injectedProps);
};
