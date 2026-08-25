const hasMessageProperty = (error: unknown): error is { message: unknown } =>
  error !== null && typeof error === 'object' && 'message' in error;

export const firstFieldErrorMessage = (errors: ReadonlyArray<unknown>): string | undefined => {
  for (const error of errors) {
    if (typeof error === 'string' && error.length > 0) {
      return error;
    }

    if (hasMessageProperty(error)) {
      const { message } = error;

      if (typeof message === 'string' && message.length > 0) {
        return message;
      }
    }
  }

  return undefined;
};
