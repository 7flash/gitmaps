import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { initStatusBar, updateStatusBarRepo } from './status-bar';

function makeContext() {
    return {
        snap() {
            return {
                context: {
                    zoom: 1,
                    repoPath: '',
                    mode: 'simple',
                    currentCommitHash: '',
                },
            };
        },
        fileCards: new Map(),
    } as any;
}

function pressKey(target: EventTarget, key: string, options: Record<string, any> = {}) {
    const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        ...options,
    });
    target.dispatchEvent(event);
    return event;
}

describe('status bar canonical slug accessibility', () => {
    let window: Window;

    beforeEach(() => {
        window = new Window({ url: 'http://localhost:3335/' });

        (window as any).SyntaxError = SyntaxError;

        Object.assign(globalThis, {
            window,
            document: window.document,
            navigator: window.navigator,
            HTMLElement: window.HTMLElement,
            HTMLButtonElement: window.HTMLButtonElement,
            Node: window.Node,
            Event: window.Event,
            MouseEvent: window.MouseEvent,
            KeyboardEvent: window.KeyboardEvent,
        });

        document.body.innerHTML = '<div class="canvas-area"></div>';
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: async () => {} },
            configurable: true,
        });
    });

    afterEach(() => {
        window?.close();
        document.body.innerHTML = '';
    });

    test('Enter opens slug popover and focuses first button', () => {
        initStatusBar(makeContext());
        updateStatusBarRepo('/repos/gitmaps', '7flash/gitmaps', 'github.com · https://github.com/7flash/gitmaps.git');

        const slugButton = document.getElementById('sbSlug') as HTMLButtonElement;
        slugButton.focus();
        pressKey(slugButton, 'Enter');

        const popover = document.getElementById('sbSlugPopover');
        expect(popover).toBeTruthy();
        expect(slugButton.getAttribute('aria-expanded')).toBe('true');
        expect((document.activeElement as HTMLElement | null)?.textContent).toBe('×');
    });

    test('ArrowDown opens popover and focuses first control', () => {
        initStatusBar(makeContext());
        updateStatusBarRepo('/repos/gitmaps', '7flash/gitmaps', 'github.com · https://github.com/7flash/gitmaps.git');

        const slugButton = document.getElementById('sbSlug') as HTMLButtonElement;
        slugButton.focus();
        pressKey(slugButton, 'ArrowDown');

        expect(document.getElementById('sbSlugPopover')).toBeTruthy();
        expect((document.activeElement as HTMLElement | null)?.textContent).toBe('×');
    });

    test('Escape closes popover and restores focus to slug button', () => {
        initStatusBar(makeContext());
        updateStatusBarRepo('/repos/gitmaps', '7flash/gitmaps', 'github.com · https://github.com/7flash/gitmaps.git');

        const slugButton = document.getElementById('sbSlug') as HTMLButtonElement;
        slugButton.focus();
        pressKey(slugButton, 'Enter');
        pressKey(document, 'Escape');

        expect(document.getElementById('sbSlugPopover')).toBeNull();
        expect(document.activeElement).toBe(slugButton);
        expect(slugButton.getAttribute('aria-expanded')).toBe('false');
    });

    test('Tab and arrow keys cycle between popover buttons', () => {
        initStatusBar(makeContext());
        updateStatusBarRepo('/repos/gitmaps', '7flash/gitmaps', 'github.com · https://github.com/7flash/gitmaps.git');

        const slugButton = document.getElementById('sbSlug') as HTMLButtonElement;
        slugButton.focus();
        pressKey(slugButton, 'Enter');

        const popover = document.getElementById('sbSlugPopover') as HTMLElement;
        expect((document.activeElement as HTMLElement | null)?.textContent).toBe('×');

        pressKey(popover, 'Tab');
        expect((document.activeElement as HTMLElement | null)?.textContent).toBe('Copy slug');

        pressKey(popover, 'ArrowRight');
        expect((document.activeElement as HTMLElement | null)?.textContent).toBe('Copy source');

        pressKey(popover, 'ArrowDown');
        expect((document.activeElement as HTMLElement | null)?.textContent).toBe('Copy both');

        pressKey(popover, 'ArrowLeft');
        expect((document.activeElement as HTMLElement | null)?.textContent).toBe('Copy source');

        pressKey(popover, 'Tab', { shiftKey: true });
        expect((document.activeElement as HTMLElement | null)?.textContent).toBe('Copy slug');
    });
});
