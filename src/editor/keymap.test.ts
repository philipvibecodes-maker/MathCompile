import { afterEach, describe, expect, it, vi } from 'vitest';
import { installGlobalKeymap, type GlobalKeymapOptions } from './keymap';

// Node environment: no DOM — capture the window keydown listener and drive
// it with plain objects (the handler only reads modifier flags, code, and
// repeat, and calls preventDefault).

type FakeKeydown = {
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  code?: string;
  key?: string;
  repeat?: boolean;
  preventDefault: () => void;
};

function setup(over: Partial<GlobalKeymapOptions> = {}) {
  let handler: ((e: FakeKeydown) => void) | undefined;
  const removeEventListener = vi.fn();
  vi.stubGlobal('window', {
    addEventListener: vi.fn(
      (_type: string, h: (e: FakeKeydown) => void, _capture: boolean) => {
        handler = h;
      },
    ),
    removeEventListener,
  });
  const opts: GlobalKeymapOptions = {
    onPaletteToggle: vi.fn(),
    onSmartModeToggle: vi.fn(),
    isPaletteOpen: vi.fn(() => false),
    ...over,
  };
  const uninstall = installGlobalKeymap(opts);
  const press = (e: Partial<FakeKeydown> = {}) => {
    const ev = { preventDefault: vi.fn(), ...e };
    handler?.(ev as FakeKeydown);
    return ev;
  };
  return { opts, press, uninstall, removeEventListener };
}

afterEach(() => vi.unstubAllGlobals());

describe('Ctrl/Cmd+K palette toggle', () => {
  it('toggles the palette and prevents the default', () => {
    const { opts, press } = setup();
    const e = press({ ctrlKey: true, code: 'KeyK' });
    expect(opts.onPaletteToggle).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('fires on Cmd+K too (macOS)', () => {
    const { opts, press } = setup();
    press({ metaKey: true, code: 'KeyK' });
    expect(opts.onPaletteToggle).toHaveBeenCalledTimes(1);
  });

  it('does not re-toggle on key autorepeat while the chord is held', () => {
    const { opts, press } = setup();
    press({ ctrlKey: true, code: 'KeyK' });
    press({ ctrlKey: true, code: 'KeyK', repeat: true });
    press({ ctrlKey: true, code: 'KeyK', repeat: true });
    expect(opts.onPaletteToggle).toHaveBeenCalledTimes(1);
  });

  it('still prevents default on repeats so the browser shortcut stays suppressed', () => {
    const { press } = setup();
    const e = press({ ctrlKey: true, code: 'KeyK', repeat: true });
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('ignores Ctrl+Alt+K and a bare K', () => {
    const { opts, press } = setup();
    press({ ctrlKey: true, altKey: true, code: 'KeyK' });
    press({ code: 'KeyK' });
    expect(opts.onPaletteToggle).not.toHaveBeenCalled();
  });
});

describe('Alt+S smart-mode toggle', () => {
  it('toggles smart mode', () => {
    const { opts, press } = setup();
    const e = press({ altKey: true, code: 'KeyS' });
    expect(opts.onSmartModeToggle).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('does not re-toggle on autorepeat', () => {
    const { opts, press } = setup();
    press({ altKey: true, code: 'KeyS' });
    press({ altKey: true, code: 'KeyS', repeat: true });
    expect(opts.onSmartModeToggle).toHaveBeenCalledTimes(1);
  });

  it('is suppressed while the palette is open', () => {
    const { opts, press } = setup({ isPaletteOpen: () => true });
    press({ altKey: true, code: 'KeyS' });
    expect(opts.onSmartModeToggle).not.toHaveBeenCalled();
  });
});

describe('uninstall', () => {
  it('removes the window listener', () => {
    const { uninstall, removeEventListener } = setup();
    uninstall();
    expect(removeEventListener).toHaveBeenCalledWith(
      'keydown',
      expect.any(Function),
      true,
    );
  });
});
