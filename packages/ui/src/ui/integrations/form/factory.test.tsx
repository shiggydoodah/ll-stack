// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import {
  extendForm,
  Form,
  useAppForm,
  useFormValue,
  useTanStackFieldContext,
  useTypedAppFormContext,
  withFieldGroup,
} from './index';
import { renderReact, requireElement } from './test-utils';
import { toPathSegments } from './useFormValue';

type ProbeValues = {
  account: {
    email: string;
  };
};

describe('form factory', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('exports intentional TanStack extension helpers', () => {
    expect(typeof extendForm).toBe('function');
    expect(typeof useTanStackFieldContext).toBe('function');
    expect(typeof useTypedAppFormContext).toBe('function');
    expect(typeof withFieldGroup).toBe('function');
  });

  it('returns a form with store, state, and handleSubmit', async () => {
    let snapshot:
      | {
          handleSubmitType: string;
          storeType: string;
          values: ProbeValues;
        }
      | undefined;

    const Probe = () => {
      const form = useAppForm({
        defaultValues: {
          account: {
            email: 'person@example.com',
          },
        },
      });

      snapshot = {
        handleSubmitType: typeof form.handleSubmit,
        storeType: typeof form.store,
        values: form.state.values,
      };

      return null;
    };

    const rendered = await renderReact(<Probe />);
    await rendered.unmount();

    expect(snapshot).toEqual({
      handleSubmitType: 'function',
      storeType: 'object',
      values: {
        account: {
          email: 'person@example.com',
        },
      },
    });
  });

  it('reads a nested value with useFormValue', async () => {
    const ValueReader = () => {
      const email = useFormValue<ProbeValues, 'account.email'>('account.email');

      return <output data-testid="email">{email}</output>;
    };

    const Probe = () => {
      const form = useAppForm({
        defaultValues: {
          account: {
            email: 'nested@example.com',
          },
        },
      });

      return (
        <Form form={form}>
          <ValueReader />
        </Form>
      );
    };

    const rendered = await renderReact(<Probe />);
    const output = requireElement(
      rendered.container.querySelector<HTMLOutputElement>('[data-testid="email"]'),
      'email output',
    );

    expect(output.textContent).toBe('nested@example.com');

    await rendered.unmount();
  });

  it('parses numeric bracket path segments', () => {
    expect(toPathSegments('items[0].name')).toEqual(['items', 0, 'name']);
  });

  it('parses chained numeric bracket path segments', () => {
    expect(toPathSegments('a[1][2].b')).toEqual(['a', 1, 2, 'b']);
  });

  it('preserves quoted bracket path segments as literal tokens', () => {
    expect(toPathSegments("obj['key']")).toEqual(['obj', "'key'"]);
    expect(toPathSegments('obj["key"]')).toEqual(['obj', '"key"']);
  });
});
