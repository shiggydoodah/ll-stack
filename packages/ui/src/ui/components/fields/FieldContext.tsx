'use client';

import { createContext, useContext, type ReactNode } from 'react';

/** How a field's {@link FieldLabel} associates with its control. */
export type FieldLabelAssociation = 'for' | 'labelledby';

export type FieldContextValue = {
  id: string;
  /** Id of the `<label>`, used as the `aria-labelledby` target for composite controls. */
  labelId: string;
  /**
   * Whether the label associates via `htmlFor` (native labelable controls —
   * input/select/textarea) or `aria-labelledby` (composite widgets whose
   * focusable element is not a labelable element, e.g. combobox/slider).
   */
  labelAssociation: FieldLabelAssociation;
  name: string;
  invalid: boolean;
  required: boolean;
  disabled: boolean;
  describedBy: string;
  registerHintId: (id: string) => () => void;
  registerErrorId: (id: string) => () => void;
};

export const FieldContext = createContext<FieldContextValue | null>(null);

export interface FieldContextProviderProps {
  children: ReactNode;
  value: FieldContextValue;
}

export const FieldContextProvider = ({ children, value }: FieldContextProviderProps) => (
  <FieldContext.Provider value={value}>{children}</FieldContext.Provider>
);

export const useFieldContext = () => {
  const context = useContext(FieldContext);

  if (context === null) {
    throw new Error('useFieldContext must be used within a Field.');
  }

  return context;
};
