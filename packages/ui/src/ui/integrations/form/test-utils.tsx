import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

export const requireElement = <TElement extends Element>(
  element: TElement | null,
  label: string,
) => {
  if (element === null) {
    throw new Error(`Expected ${label} to exist.`);
  }

  return element;
};

export const requireValue = <TValue,>(value: TValue | null | undefined, label: string) => {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${label} to exist.`);
  }

  return value;
};

export const renderReact = async (element: ReactElement) => {
  const container = document.createElement('div');
  document.body.append(container);

  const root: Root = createRoot(container);

  await act(async () => {
    root.render(element);
  });

  return {
    container,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
};

export const submitForm = async (form: HTMLFormElement) => {
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
};

export const typeIntoInput = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

export const blurInput = async (input: HTMLElement) => {
  await act(async () => {
    input.dispatchEvent(new FocusEvent('blur', { bubbles: false, cancelable: false }));
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, cancelable: false }));
  });
};

export const createDeferred = <TValue,>() => {
  let resolvePromise: (value: TValue | PromiseLike<TValue>) => void = () => {
    throw new Error('Deferred promise was resolved before initialization.');
  };
  let rejectPromise: (reason?: unknown) => void = () => {
    throw new Error('Deferred promise was rejected before initialization.');
  };

  const promise = new Promise<TValue>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    reject: rejectPromise,
    resolve: resolvePromise,
  };
};
