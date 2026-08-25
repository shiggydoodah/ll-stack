/**
 * A tiny, zero-dependency interactive multi-select for the CLI. Renders a
 * checkbox list to stderr and drives it with raw-mode keypresses, so the script
 * stays free of prompt-library dependencies. Requires an interactive TTY.
 */
import { emitKeypressEvents } from 'node:readline';

export interface MultiSelectOption {
  value: string;
  label?: string;
  checked?: boolean;
}

interface KeypressEvent {
  name?: string;
  ctrl?: boolean;
  sequence?: string;
}

const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

/**
 * Prompts the user to toggle any number of options.
 * Keys: ↑/↓ (or k/j) move · space toggles · `a` toggles all · enter confirms ·
 * esc / ctrl-c cancels (rejects).
 */
export function multiSelect(message: string, options: MultiSelectOption[]): Promise<string[]> {
  const input = process.stdin;
  const output = process.stderr;

  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error(
      '`--list` needs an interactive terminal (TTY). Pass domain names directly instead, e.g. `pnpm gen:client auth users`.',
    );
  }

  const items = options.map((option) => ({ ...option, checked: option.checked ?? false }));
  let cursor = 0;
  let lineCount = 0;

  const render = (): void => {
    if (lineCount > 0) {
      output.write(`\x1b[${lineCount}A`); // move to the top of the previous render
    }
    output.write('\x1b[0J'); // clear everything below the cursor
    const lines = [
      message,
      ...items.map((item, index) => {
        const pointer = index === cursor ? `${CYAN}›${RESET}` : ' ';
        const box = item.checked ? `${CYAN}◉${RESET}` : '◯';
        const label = item.label ?? item.value;
        return `${pointer} ${box} ${index === cursor ? `${CYAN}${label}${RESET}` : label}`;
      }),
      `${DIM}↑/↓ move · space toggle · a all · enter confirm · esc cancel${RESET}`,
    ];
    output.write(`${lines.join('\n')}\n`);
    lineCount = lines.length;
  };

  emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();
  output.write(HIDE_CURSOR);
  render();

  return new Promise<string[]>((resolve, reject) => {
    const cleanup = (): void => {
      input.removeListener('keypress', onKeypress);
      input.setRawMode(false);
      input.pause();
      output.write(`${SHOW_CURSOR}\n`);
    };

    const onKeypress = (_str: string | undefined, key: KeypressEvent | undefined): void => {
      if (!key) return;

      if (key.name === 'c' && key.ctrl) {
        cleanup();
        reject(new Error('Selection cancelled.'));
        return;
      }

      switch (key.name) {
        case 'up':
        case 'k':
          cursor = (cursor - 1 + items.length) % items.length;
          render();
          break;
        case 'down':
        case 'j':
          cursor = (cursor + 1) % items.length;
          render();
          break;
        case 'space': {
          const item = items[cursor];
          if (item) item.checked = !item.checked;
          render();
          break;
        }
        case 'a': {
          const allChecked = items.every((item) => item.checked);
          for (const item of items) item.checked = !allChecked;
          render();
          break;
        }
        case 'return':
        case 'enter':
          cleanup();
          resolve(items.filter((item) => item.checked).map((item) => item.value));
          break;
        case 'escape':
          cleanup();
          reject(new Error('Selection cancelled.'));
          break;
        default:
          break;
      }
    };

    input.on('keypress', onKeypress);
  });
}
