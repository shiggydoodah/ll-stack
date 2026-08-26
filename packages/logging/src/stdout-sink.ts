import type { LogSink } from './log-sink';

// The default transport, and the fallback the HTTP sinks degrade to: in a
// container, stdout is the one destination that is always up and already
// collected by the runtime, so records routed here survive any collector
// outage. Writes are intentionally unbuffered — pino hands over complete
// serialized lines and `process.stdout.write` already queues internally.
export class StdoutLogSink implements LogSink {
  public emit(serializedRecord: string): void {
    if (serializedRecord.length === 0) {
      return;
    }

    process.stdout.write(serializedRecord);
  }

  public async flush(): Promise<void> {
    return Promise.resolve();
  }

  public async shutdown(): Promise<void> {
    return Promise.resolve();
  }
}
