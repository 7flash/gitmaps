import { Window } from 'happy-dom';

export interface SetupDomTestOptions {
  url?: string;
  html?: string;
  clipboard?: { writeText: (text: string) => Promise<void> };
  raf?: boolean;
}

export interface DomTestHandle {
  window: Window;
  cleanup: () => void;
}

export function setupDomTest(options: SetupDomTestOptions = {}): DomTestHandle {
  const {
    url = 'http://localhost:3335/',
    html = '',
    clipboard,
    raf = false,
  } = options;

  const window = new Window({ url });
  (window as any).SyntaxError = SyntaxError;

  Object.assign(globalThis, {
    window,
    document: window.document,
    navigator: window.navigator,
    localStorage: window.localStorage,
    HTMLElement: window.HTMLElement,
    HTMLButtonElement: window.HTMLButtonElement,
    SVGElement: window.SVGElement,
    Node: window.Node,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    KeyboardEvent: window.KeyboardEvent,
  });

  if (raf) {
    Object.assign(globalThis, {
      requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0),
      cancelAnimationFrame: (id: any) => clearTimeout(id),
    });
  }

  if (html) {
    document.body.innerHTML = html;
  }

  if (clipboard) {
    Object.defineProperty(navigator, 'clipboard', {
      value: clipboard,
      configurable: true,
    });
  }

  const cleanup = () => {
    window?.close();
    document.body.innerHTML = '';
    try {
      localStorage.clear();
    } catch {}
    try {
      delete (globalThis as any).requestAnimationFrame;
      delete (globalThis as any).cancelAnimationFrame;
    } catch {}
  };

  return { window, cleanup };
}

export function setElementRect(el: HTMLElement, width: number, height: number) {
  Object.defineProperty(el, 'offsetWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'offsetHeight', { value: height, configurable: true });
  (el as any).getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width,
    height,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON() {},
  });
}
