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
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    HTMLButtonElement: window.HTMLButtonElement,
    HTMLInputElement: window.HTMLInputElement,
    HTMLSelectElement: window.HTMLSelectElement,
    HTMLTextAreaElement: window.HTMLTextAreaElement,
    SVGElement: window.SVGElement,
    DocumentFragment: window.DocumentFragment,
    Node: window.Node,
    Text: window.Text,
    DOMRect: window.DOMRect,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    MouseEvent: window.MouseEvent,
    KeyboardEvent: window.KeyboardEvent,
    MutationObserver: window.MutationObserver,
    ResizeObserver: window.ResizeObserver,
    getComputedStyle: window.getComputedStyle.bind(window),
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
    try {
      delete (globalThis as any).window;
      delete (globalThis as any).document;
      delete (globalThis as any).navigator;
      delete (globalThis as any).localStorage;
      delete (globalThis as any).Element;
      delete (globalThis as any).HTMLElement;
      delete (globalThis as any).HTMLButtonElement;
      delete (globalThis as any).HTMLInputElement;
      delete (globalThis as any).HTMLSelectElement;
      delete (globalThis as any).HTMLTextAreaElement;
      delete (globalThis as any).SVGElement;
      delete (globalThis as any).DocumentFragment;
      delete (globalThis as any).Node;
      delete (globalThis as any).Text;
      delete (globalThis as any).DOMRect;
      delete (globalThis as any).Event;
      delete (globalThis as any).CustomEvent;
      delete (globalThis as any).MouseEvent;
      delete (globalThis as any).KeyboardEvent;
      delete (globalThis as any).MutationObserver;
      delete (globalThis as any).ResizeObserver;
      delete (globalThis as any).getComputedStyle;
    } catch {}
  };

  return { window, cleanup };
}

export function installFetchMock(fetchImpl: typeof globalThis.fetch): RestoreHandle {
  const originalFetch = globalThis.fetch;
  const originalWindowFetch = window.fetch;
  (globalThis as any).fetch = fetchImpl;
  (window as any).fetch = fetchImpl;
  return {
    restore() {
      (globalThis as any).fetch = originalFetch;
      (window as any).fetch = originalWindowFetch;
    },
  };
}

export function installWindowOpenMock(openImpl: typeof window.open): RestoreHandle {
  const originalOpen = window.open;
  (window as any).open = openImpl;
  return {
    restore() {
      (window as any).open = originalOpen;
    },
  };
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
