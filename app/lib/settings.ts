// @ts-nocheck
/**
 * Settings — persistent user preferences stored in localStorage.
 * All settings have safe defaults and are loaded synchronously.
 */

const STORAGE_KEY = 'gitcanvas:settings';

export const MIN_CARD_WIDTH = 240;
export const MAX_CARD_WIDTH = 1800;
export const MIN_CARD_HEIGHT = 220;
export const MAX_CARD_HEIGHT = 1000;
export const MIN_CARD_ASPECT_RATIO = 0.45;
export const MAX_CARD_ASPECT_RATIO = 1.8;
const DEFAULT_CARD_WIDTH = 540;
const DEFAULT_CARD_HEIGHT = 700;
const DEFAULT_CARD_AREA = DEFAULT_CARD_WIDTH * DEFAULT_CARD_HEIGHT;

export interface GitCanvasSettings {
    /** Text rendering mode: 'canvas' (default, fast) or 'dom' (rich, slower) */
    renderMode: 'canvas' | 'dom';
    /** Font size for code display (px) */
    fontSize: number;
    /** Show connection lines between imports */
    showConnections: boolean;
    /** Control mode: 'simple' (drag=pan) or 'advanced' (space+drag=pan) */
    controlMode: 'simple' | 'advanced';
    /** Show minimap */
    showMinimap: boolean;
    /** Card width (derived/persisted for layout compatibility) */
    cardWidth: number;
    /** Card height (derived/persisted for layout compatibility) */
    cardHeight: number;
    /** Width/height proportion for map cards */
    cardAspectRatio: number;
    /** Auto-detect import connections on load */
    autoDetectImports: boolean;
    /** Theme: 'dark' (default) or 'light' */
    theme: 'dark' | 'light';
    /** Font size for hover popup (px) */
    popupFontSize: number;
    /** Git heatmap overlay enabled */
    heatmapEnabled: boolean;
    /** Heatmap time range in days */
    heatmapDays: number;
    /** Fixed text size used by map/preview cards (screen px) */
    previewFontPx: number;
    /** JSON array defining context-menu file actions */
    fileActionsJson: string;
}

const DEFAULTS: GitCanvasSettings = {
    renderMode: 'canvas',
    fontSize: 12,
    showConnections: true,
    controlMode: 'simple',
    showMinimap: true,
    cardWidth: DEFAULT_CARD_WIDTH,
    cardHeight: DEFAULT_CARD_HEIGHT,
    cardAspectRatio: DEFAULT_CARD_WIDTH / DEFAULT_CARD_HEIGHT,
    autoDetectImports: false,
    theme: 'dark',
    popupFontSize: 14,
    heatmapEnabled: false,
    heatmapDays: 90,
    previewFontPx: 10,
    fileActionsJson: JSON.stringify([
        {
            id: "patch-resolve",
            label: "Patch Resolve Preview",
            command: "bunx patch-resolve \"{file}\"",
            extensions: [".md"],
            openInModal: true,
        },
    ], null, 2),
};

let _settings: GitCanvasSettings | null = null;

export function __resetSettingsCacheForTests() {
    _settings = null;
}

/** Load settings from localStorage (synchronous, uses cache) */
export function getSettings(): GitCanvasSettings {
    if (_settings) return _settings;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.previewFontPx == null) {
                const far = typeof parsed.previewFarTitlePx === 'number' ? parsed.previewFarTitlePx : DEFAULTS.previewFontPx;
                const near = typeof parsed.previewNearTitlePx === 'number' ? parsed.previewNearTitlePx : DEFAULTS.previewFontPx;
                parsed.previewFontPx = Math.round((far + near) / 2);
            }
            if (parsed.cardAspectRatio == null) {
                const width = Number(parsed.cardWidth);
                const height = Number(parsed.cardHeight);
                if (Number.isFinite(width) && Number.isFinite(height) && height > 0) {
                    parsed.cardAspectRatio = width / height;
                }
            }
            _settings = { ...DEFAULTS, ...parsed };
        } else {
            _settings = { ...DEFAULTS };
        }
    } catch {
        _settings = { ...DEFAULTS };
    }
    return _settings!;
}

function clampCardAspectRatio(value: number) {
    if (!Number.isFinite(value)) return DEFAULTS.cardAspectRatio;
    return Math.max(MIN_CARD_ASPECT_RATIO, Math.min(MAX_CARD_ASPECT_RATIO, value));
}

function getDerivedCardDimensions(aspectRatio: number) {
    const aspect = clampCardAspectRatio(aspectRatio);
    let width = Math.round(Math.sqrt(DEFAULT_CARD_AREA * aspect));
    let height = Math.max(1, Math.round(width / aspect));

    width = Math.max(MIN_CARD_WIDTH, Math.min(MAX_CARD_WIDTH, width));
    height = Math.max(MIN_CARD_HEIGHT, Math.min(MAX_CARD_HEIGHT, height));

    return { width, height, aspect };
}

/** Update one or more settings and persist */
export function updateSettings(partial: Partial<GitCanvasSettings>): GitCanvasSettings {
    const current = getSettings();
    Object.assign(current, partial);

    const nextAspect = partial.cardAspectRatio != null
        ? Number(partial.cardAspectRatio)
        : (Number.isFinite(Number(current.cardAspectRatio)) && Number(current.cardAspectRatio) > 0
            ? Number(current.cardAspectRatio)
            : Number(current.cardWidth) / Math.max(1, Number(current.cardHeight)));
    const derived = getDerivedCardDimensions(nextAspect);
    current.cardAspectRatio = derived.aspect;
    current.cardWidth = derived.width;
    current.cardHeight = derived.height;

    _settings = current;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch { }

    // Dispatch custom event so listeners can react
    window.dispatchEvent(new CustomEvent('gitcanvas:settings-changed', { detail: current }));
    return current;
}

/** Reset all settings to defaults */
export function resetSettings(): GitCanvasSettings {
    _settings = { ...DEFAULTS };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(_settings));
    } catch { }
    window.dispatchEvent(new CustomEvent('gitcanvas:settings-changed', { detail: _settings }));
    return _settings;
}

/** Get a single setting value */
export function getSetting<K extends keyof GitCanvasSettings>(key: K): GitCanvasSettings[K] {
    return getSettings()[key];
}

export function getDefaultCardWidth(): number {
    return getDerivedCardDimensions(getSettings().cardAspectRatio).width;
}

export function getDefaultCardHeight(): number {
    return getDerivedCardDimensions(getSettings().cardAspectRatio).height;
}

export function getDefaultCardAspectRatio(): number {
    return getDerivedCardDimensions(getSettings().cardAspectRatio).aspect;
}