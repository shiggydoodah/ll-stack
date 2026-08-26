import { useSelector } from '@tanstack/react-form';
import type { ReactNode } from 'react';

import { cn } from '../../../../lib/cn';
import { useFormContext } from '../createAppForm';

const hasMessageProperty = (error: unknown): error is { message: unknown } =>
  error !== null && typeof error === 'object' && 'message' in error;

const extractFormErrorMessages = (errors: ReadonlyArray<unknown>): string[] => {
  const messages: string[] = [];

  for (const error of errors) {
    if (typeof error === 'string' && error.length > 0) {
      messages.push(error);
      continue;
    }

    if (hasMessageProperty(error)) {
      const { message } = error;

      if (typeof message === 'string' && message.length > 0) {
        messages.push(message);
      }
    }
  }

  return messages;
};

export interface FormErrorsProps {
  className?: string;
  fallback?: ReactNode;
}

export const FormErrors = ({ className, fallback }: FormErrorsProps) => {
  const form = useFormContext();
  const errors = useSelector(form.store, (state) => state.errors);
  const messages = extractFormErrorMessages(errors);

  if (messages.length === 0) {
    return fallback ?? null;
  }

  return (
    // text-tone-red, not the accent: errors carry the same semantic tone as FieldError.
    <div className={cn('text-tone-red', className)} role="alert">
      <ul className="list-inside list-none space-y-1 text-xs">
        {messages.map((message, index) => (
          <li key={`${index}-${message}`}>{message}</li>
        ))}
      </ul>
    </div>
  );
};
