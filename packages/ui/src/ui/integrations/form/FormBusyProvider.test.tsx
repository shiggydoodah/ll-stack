// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { FormBusyProvider, useFormTask, type UseFormTaskResult } from './index';
import { createDeferred, renderReact, requireElement, requireValue } from './test-utils';

describe('FormBusyProvider and useFormTask', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('tracks busy state while a task resolves', async () => {
    let runTask: UseFormTaskResult['runTask'] | undefined;

    const Probe = () => {
      const task = useFormTask();
      runTask = task.runTask;

      return <output data-busy={task.isBusy} data-count={task.busyCount} />;
    };

    const rendered = await renderReact(
      <FormBusyProvider>
        <Probe />
      </FormBusyProvider>,
    );
    const output = requireElement(rendered.container.querySelector('output'), 'busy output');
    const deferred = createDeferred<string>();

    expect(output.dataset.busy).toBe('false');
    expect(output.dataset.count).toBe('0');

    const taskRunner = requireValue(runTask, 'runTask');
    let taskPromise: Promise<string> | undefined;

    act(() => {
      taskPromise = taskRunner(deferred.promise);
    });

    expect(output.dataset.busy).toBe('true');
    expect(output.dataset.count).toBe('1');

    await act(async () => {
      deferred.resolve('complete');
      await taskPromise;
    });

    expect(output.dataset.busy).toBe('false');
    expect(output.dataset.count).toBe('0');

    await rendered.unmount();
  });

  it('tracks busy state while a task rejects', async () => {
    let runTask: UseFormTaskResult['runTask'] | undefined;

    const Probe = () => {
      const task = useFormTask();
      runTask = task.runTask;

      return <output data-busy={task.isBusy} data-count={task.busyCount} />;
    };

    const rendered = await renderReact(
      <FormBusyProvider>
        <Probe />
      </FormBusyProvider>,
    );
    const output = requireElement(rendered.container.querySelector('output'), 'busy output');
    const deferred = createDeferred<never>();
    const taskRunner = requireValue(runTask, 'runTask');
    let taskPromise: Promise<never> | undefined;
    const error = new Error('lookup failed');

    act(() => {
      taskPromise = taskRunner(deferred.promise);
    });

    expect(output.dataset.busy).toBe('true');
    expect(output.dataset.count).toBe('1');

    await act(async () => {
      deferred.reject(error);
      await expect(taskPromise).rejects.toThrow(error);
    });

    expect(output.dataset.busy).toBe('false');
    expect(output.dataset.count).toBe('0');

    await rendered.unmount();
  });
});
