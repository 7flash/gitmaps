// @ts-nocheck
/**
 * Settings Modal — gear icon opens a premium settings panel
 * with organized toggle switches and sliders.
 */
import { render } from 'tradjs/client';
import { getCanvasContext } from './context';
import { getCardManager } from './xydraw-bridge';
import { getDefaultCardAspectRatio, getDefaultCardHeight, getDefaultCardWidth, MAX_CARD_ASPECT_RATIO, MIN_CARD_ASPECT_RATIO, getSettings, updateSettings, resetSettings, type GitCanvasSettings } from './settings';

let _modal: HTMLElement | null = null;

// ─── JSX Components ─────────────────────────────────────

function ToggleGroup({ id, value, options }: {
    id: string;
    value: string;
    options: { value: string; label: string }[];
}) {
    return (
        <div className="settings-toggle-group" id={id}>
            {options.map(opt => (
                <button
                    key={opt.value}
                    className={`settings-toggle-btn ${value === opt.value ? 'active' : ''}`}
                    data-value={opt.value}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}

function Slider({ id, valueId, min, max, step, value, suffix }: {
    id: string; valueId: string;
    min: number; max: number; step: number;
    value: number; suffix: string;
}) {
    return (
        <div className="settings-slider-group">
            <input type="range" id={id} className="settings-slider"
                min={String(min)} max={String(max)} step={String(step)} value={String(value)} />
            <span className="settings-slider-value" id={valueId}>{value}{suffix}</span>
        </div>
    );
}

function Switch({ id, checked }: { id: string; checked: boolean }) {
    return (
        <label className="settings-switch">
            <input type="checkbox" id={id} checked={checked} />
            <span className="settings-switch-slider"></span>
        </label>
    );
}

function SettingsRow({ label, desc, children }: {
    label: string; desc: string; children: any;
}) {
    return (
        <div className="settings-row">
            <div className="settings-label">
                <span className="settings-label-text">{label}</span>
                <span className="settings-label-desc">{desc}</span>
            </div>
            {children}
        </div>
    );
}

function SettingsSection({ title, children }: { title: string; children: any }) {
    return (
        <div className="settings-section">
            <h3 className="settings-section-title">{title}</h3>
            {children}
        </div>
    );
}

function SettingsPanel({ settings }: { settings: GitCanvasSettings }) {
    const aspect = Number.isFinite(settings.cardAspectRatio) ? settings.cardAspectRatio : getDefaultCardAspectRatio();
    const derivedWidth = getDefaultCardWidth();
    const derivedHeight = getDefaultCardHeight();
    const aspectLabel = aspect < 0.72 ? 'Tall' : aspect > 1.05 ? 'Wide' : 'Balanced';
    return (
        <div className="settings-modal">
            <div className="settings-header">
                <h2 className="settings-title">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
                        stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                    </svg>
                    Settings
                </h2>
                <button className="settings-close" id="closeSettings">✕</button>
            </div>
            <div className="settings-body">
                <SettingsSection title="Rendering">
                    <SettingsRow label="Text Rendering" desc="Canvas (fast) or DOM (rich interactions)">
                        <ToggleGroup id="settingRenderMode" value={settings.renderMode}
                            options={[{ value: 'canvas', label: 'Canvas' }, { value: 'dom', label: 'DOM' }]} />
                    </SettingsRow>
                    <SettingsRow label="Font Size" desc="Code font size in full cards and editor views">
                        <Slider id="settingFontSize" valueId="fontSizeValue"
                            min={6} max={40} step={1} value={settings.fontSize} suffix="px" />
                    </SettingsRow>
                    <SettingsRow label="Card proportion" desc="Tall ↔ wide shape for map cards; zoom controls overall scale">
                        <Slider id="settingCardAspectRatio" valueId="cardAspectRatioValue"
                            min={MIN_CARD_ASPECT_RATIO} max={MAX_CARD_ASPECT_RATIO} step={0.01} value={aspect} suffix=":1" />
                    </SettingsRow>
                </SettingsSection>

                <SettingsSection title="Interface">
                    <SettingsRow label="Theme" desc="Dark or light appearance">
                        <ToggleGroup id="settingTheme" value={settings.theme}
                            options={[{ value: 'dark', label: '🌙 Dark' }, { value: 'light', label: '☀️ Light' }]} />
                    </SettingsRow>
                    <SettingsRow label="Control Mode" desc="Simple: drag=pan / Advanced: space+drag=pan">
                        <ToggleGroup id="settingControlMode" value={settings.controlMode}
                            options={[{ value: 'simple', label: 'Simple' }, { value: 'advanced', label: 'Advanced' }]} />
                    </SettingsRow>
                    <SettingsRow label="Show Minimap" desc="Overview map in the corner">
                        <Switch id="settingMinimap" checked={settings.showMinimap} />
                    </SettingsRow>
                    <SettingsRow label="Show Connections" desc="Lines between importing files">
                        <Switch id="settingConnections" checked={settings.showConnections} />
                    </SettingsRow>
                    <SettingsRow label="Auto-detect Imports" desc="Scan files for imports on load">
                        <Switch id="settingAutoImports" checked={settings.autoDetectImports} />
                    </SettingsRow>
                </SettingsSection>

                <SettingsSection title="Visualization">
                    <SettingsRow label="Git Heatmap" desc="Color-code cards by commit frequency (H key)">
                        <Switch id="settingHeatmap" checked={settings.heatmapEnabled} />
                    </SettingsRow>
                    <SettingsRow label="Heatmap Range" desc="Time range for commit activity">
                        <Slider id="settingHeatmapDays" valueId="heatmapDaysValue"
                            min={7} max={365} step={7} value={settings.heatmapDays} suffix=" days" />
                    </SettingsRow>
                </SettingsSection>

                <SettingsSection title="Map View">
                    <SettingsRow label="Map font size" desc="Fixed text size used by map cards at every zoom level">
                        <Slider id="settingPreviewFontPx" valueId="previewFontPxValue"
                            min={4} max={28} step={1} value={settings.previewFontPx} suffix="px" />
                    </SettingsRow>
                </SettingsSection>

                <SettingsSection title="Card Shape Preview">
                    <div className="settings-dimension-preview" id="settingsDimensionPreview">
                        <div className="settings-dimension-preview__card" id="settingsDimensionPreviewCard">
                            <div className="settings-dimension-preview__header">
                                <span>example.ts</span>
                                <span id="settingsDimensionPreviewBadge">{aspectLabel} · {aspect.toFixed(2)}:1</span>
                            </div>
                            <div className="settings-dimension-preview__body">
                                <div className="settings-dimension-preview__line short"></div>
                                <div className="settings-dimension-preview__line"></div>
                                <div className="settings-dimension-preview__line"></div>
                                <div className="settings-dimension-preview__line medium"></div>
                                <div className="settings-dimension-preview__line"></div>
                            </div>
                        </div>
                        <div className="settings-label-desc" style={{ marginTop: '12px' }}>
                            Current derived size: {derivedWidth} × {derivedHeight}px
                        </div>
                    </div>
                </SettingsSection>
            </div>
            <div className="settings-footer">
                <button className="settings-reset-btn" id="settingsReset">Reset to Defaults</button>
                <span className="settings-footer-note">Changes are saved automatically</span>
            </div>
        </div>
    );
}

/** Open the settings modal */
export function openSettingsModal(ctx?: any) {
    // Remove existing modal if any
    if (_modal) { _modal.remove(); _modal = null; }

    const settings = getSettings();

    _modal = document.createElement('div');
    _modal.id = 'settingsModal';
    _modal.className = 'settings-modal-backdrop';
    Object.assign(_modal.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        zIndex: '10000',
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    });

    document.body.appendChild(_modal);
    render(<SettingsPanel settings={settings} />, _modal);

    // Wire close
    const close = () => { if (_modal) { _modal.remove(); _modal = null; } };
    _modal.querySelector('#closeSettings')!.addEventListener('click', close);
    _modal.addEventListener('click', (e) => { if (e.target === _modal) close(); });
    document.addEventListener('keydown', function onEsc(e) {
        if (e.key === 'Escape' && _modal) { close(); document.removeEventListener('keydown', onEsc); }
    });

    // Wire render mode toggle
    const renderModeBtns = _modal.querySelectorAll('#settingRenderMode .settings-toggle-btn');
    renderModeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            renderModeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateSettings({ renderMode: btn.dataset.value as 'canvas' | 'dom' });
            applyRenderMode(ctx, btn.dataset.value as string);
        });
    });

    // Wire control mode toggle
    const controlModeBtns = _modal.querySelectorAll('#settingControlMode .settings-toggle-btn');
    controlModeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            controlModeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateSettings({ controlMode: btn.dataset.value as 'simple' | 'advanced' });
            applyControlMode(btn.dataset.value as string);
        });
    });

    // Wire theme toggle
    const themeBtns = _modal.querySelectorAll('#settingTheme .settings-toggle-btn');
    themeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            themeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateSettings({ theme: btn.dataset.value as 'dark' | 'light' });
            applyTheme(btn.dataset.value as string);
        });
    });

    // Wire sliders
    const fontSlider = _modal.querySelector('#settingFontSize') as HTMLInputElement;
    const fontValue = _modal.querySelector('#fontSizeValue')!;
    fontSlider?.addEventListener('input', () => {
        fontValue.textContent = `${fontSlider.value}px`;
        updateSettings({ fontSize: parseInt(fontSlider.value) });
        applyFontSize(parseInt(fontSlider.value));
    });

    const cardAspectRatioSlider = _modal.querySelector('#settingCardAspectRatio') as HTMLInputElement;
    const cardAspectRatioValue = _modal.querySelector('#cardAspectRatioValue')!;
    const dimensionPreviewCard = _modal.querySelector('#settingsDimensionPreviewCard') as HTMLElement;
    const dimensionPreviewBadge = _modal.querySelector('#settingsDimensionPreviewBadge') as HTMLElement;

    const deriveCardDimensionsForAspect = (aspectRatio: number) => {
        const safeAspect = Math.max(MIN_CARD_ASPECT_RATIO, Math.min(MAX_CARD_ASPECT_RATIO, aspectRatio));
        const widthPx = Math.max(1, Math.round(Math.sqrt(540 * 700 * safeAspect)));
        const heightPx = Math.max(1, Math.round(widthPx / safeAspect));
        return { widthPx, heightPx, aspectRatio: safeAspect };
    };

    const getAspectLabel = (aspectRatio: number) => aspectRatio < 0.72 ? 'Tall' : aspectRatio > 1.05 ? 'Wide' : 'Balanced';

    const updateDimensionPreview = (aspectRatio: number) => {
        const { widthPx, heightPx, aspectRatio: safeAspect } = deriveCardDimensionsForAspect(aspectRatio);
        if (dimensionPreviewCard) {
            const previewScale = Math.min(1, 220 / Math.max(1, widthPx), 160 / Math.max(1, heightPx));
            dimensionPreviewCard.style.width = `${Math.max(88, Math.round(widthPx * previewScale))}px`;
            dimensionPreviewCard.style.height = `${Math.max(72, Math.round(heightPx * previewScale))}px`;
        }
        if (dimensionPreviewBadge) {
            dimensionPreviewBadge.textContent = `${getAspectLabel(safeAspect)} · ${safeAspect.toFixed(2)}:1`;
        }
    };

    updateDimensionPreview(parseFloat(cardAspectRatioSlider.value));

    const commitCardDimensions = () => {
        const aspectRatio = parseFloat(cardAspectRatioSlider.value);
        const { widthPx, heightPx, aspectRatio: safeAspect } = deriveCardDimensionsForAspect(aspectRatio);
        cardAspectRatioValue.textContent = `${safeAspect.toFixed(2)}:1`;
        updateSettings({ cardAspectRatio: safeAspect });
        applyCardDimensions(widthPx, heightPx, { persist: false, commitLayout: true });
    };

    cardAspectRatioSlider?.addEventListener('input', () => {
        _cardDimensionDragging = true;
        const aspectRatio = parseFloat(cardAspectRatioSlider.value);
        const { widthPx, heightPx, aspectRatio: safeAspect } = deriveCardDimensionsForAspect(aspectRatio);
        cardAspectRatioValue.textContent = `${safeAspect.toFixed(2)}:1`;
        updateDimensionPreview(safeAspect);
        applyCardDimensions(widthPx, heightPx, { persist: false, commitLayout: false });
    });
    cardAspectRatioSlider?.addEventListener('change', () => {
        _cardDimensionDragging = false;
        commitCardDimensions();
    });

    const previewFontSlider = _modal.querySelector('#settingPreviewFontPx') as HTMLInputElement;
    const previewFontValue = _modal.querySelector('#previewFontPxValue')!;
    previewFontSlider?.addEventListener('input', () => {
        previewFontValue.textContent = `${previewFontSlider.value}px`;
        updateSettings({ previewFontPx: parseInt(previewFontSlider.value) });
        window.dispatchEvent(new CustomEvent('gitcanvas:preview-settings-changed'));
    });


    // Wire switches
    const minimapSwitch = _modal.querySelector('#settingMinimap') as HTMLInputElement;
    minimapSwitch?.addEventListener('change', () => {
        updateSettings({ showMinimap: minimapSwitch.checked });
        applyMinimap(minimapSwitch.checked);
    });

    const connectionsSwitch = _modal.querySelector('#settingConnections') as HTMLInputElement;
    connectionsSwitch?.addEventListener('change', () => {
        updateSettings({ showConnections: connectionsSwitch.checked });
    });

    const autoImportsSwitch = _modal.querySelector('#settingAutoImports') as HTMLInputElement;
    autoImportsSwitch?.addEventListener('change', () => {
        updateSettings({ autoDetectImports: autoImportsSwitch.checked });
    });

    // Wire heatmap switch
    const heatmapSwitch = _modal.querySelector('#settingHeatmap') as HTMLInputElement;
    heatmapSwitch?.addEventListener('change', () => {
        updateSettings({ heatmapEnabled: heatmapSwitch.checked });
        const repoPath = ctx?.snap?.()?.context?.repoPath;
        if (repoPath) {
            import('./heatmap').then(async ({ toggleHeatmap, injectHeatmapCSS, isHeatmapActive }) => {
                injectHeatmapCSS();
                // Only toggle if state differs from setting
                if (heatmapSwitch.checked !== isHeatmapActive()) {
                    await toggleHeatmap(repoPath);
                }
            });
        }
    });

    // Wire heatmap days slider
    const heatmapDaysSlider = _modal.querySelector('#settingHeatmapDays') as HTMLInputElement;
    const heatmapDaysValue = _modal.querySelector('#heatmapDaysValue')!;
    heatmapDaysSlider?.addEventListener('input', () => {
        heatmapDaysValue.textContent = `${heatmapDaysSlider.value} days`;
        updateSettings({ heatmapDays: parseInt(heatmapDaysSlider.value) });
        const repoPath = ctx?.snap?.()?.context?.repoPath;
        if (repoPath) {
            import('./heatmap').then(async ({ refreshHeatmap, injectHeatmapCSS }) => {
                injectHeatmapCSS();
                await refreshHeatmap(repoPath);
            });
        }
    });

    // Wire reset
    _modal.querySelector('#settingsReset')!.addEventListener('click', () => {
        const defaults = resetSettings();
        close();
        setTimeout(() => openSettingsModal(ctx), 50);
    });
}

// ─── Apply functions ─────────────────────────────────────

function applyRenderMode(ctx: any, mode: string) {
    if (!ctx) return;
    ctx.useCanvasText = mode === 'canvas';
    localStorage.setItem('gitcanvas:useCanvasText', String(ctx.useCanvasText));
    const textToggle = document.getElementById('toggleCanvasText');
    if (textToggle) textToggle.classList.toggle('active', ctx.useCanvasText);
}

function applyControlMode(mode: string) {
    localStorage.setItem('gitcanvas:controlMode', mode);
    const toggle = document.getElementById('toggleControlMode');
    const icon = document.getElementById('controlModeIcon');
    if (toggle) toggle.title = mode === 'simple'
        ? 'Toggle control mode: Simple (drag=pan) / Advanced (space+drag=pan)'
        : 'Toggle control mode: Advanced (space+drag=pan) / Simple (drag=pan)';
}

function applyFontSize(size: number) {
    document.documentElement.style.setProperty('--code-font-size', `${size}px`);
}

function applyMinimap(show: boolean) {
    const minimap = document.getElementById('minimapCanvas') || document.querySelector('.minimap-container');
    if (minimap) (minimap as HTMLElement).style.display = show ? '' : 'none';
}

type ApplyCardDimensionOptions = {
    persist?: boolean;
    commitLayout?: boolean;
};

let _cardDimensionPreviewRaf: number | null = null;
let _cardDimensionCullRaf: number | null = null;
let _cardDimensionCullTimer: ReturnType<typeof setTimeout> | null = null;
let _cardDimensionDragIdleTimer: ReturnType<typeof setTimeout> | null = null;
let _cardDimensionDragging = false;
const CARD_DIMENSION_PREVIEW_CULL_MS = 50;
const CARD_DIMENSION_DRAG_IDLE_MS = 140;

export function applyCardDimensions(width: number, height: number, options: ApplyCardDimensionOptions = {}) {
    const { persist = false, commitLayout = false } = options;

    document.documentElement.style.setProperty('--card-width', `${width}px`);
    document.documentElement.style.setProperty('--card-height', `${height}px`);
    window.dispatchEvent(new CustomEvent('gitcanvas:card-width-changed', { detail: width }));
    window.dispatchEvent(new CustomEvent('gitcanvas:card-height-changed', { detail: height }));

    if (persist) {
        updateSettings({ cardWidth: width, cardHeight: height });
    }

    const applyDomPreview = () => {
        document.querySelectorAll('.file-pill').forEach(card => {
            const el = card as HTMLElement;
            el.style.width = `${width}px`;
            el.style.height = `${height}px`;
        });
    };

    if (_cardDimensionPreviewRaf != null) {
        cancelAnimationFrame(_cardDimensionPreviewRaf);
    }
    _cardDimensionPreviewRaf = requestAnimationFrame(() => {
        _cardDimensionPreviewRaf = null;
        applyDomPreview();
    });

    const ctx = getCanvasContext();
    const manager = getCardManager();
    if (!ctx) return;

    for (const deferred of ctx.deferredCards.values()) {
        deferred.size = { ...(deferred.size || {}), width, height };
    }

    if (manager) {
        for (const [id, deferred] of manager.deferred.entries()) {
            manager.deferred.set(id, { ...deferred, width, height });
        }
    }

    if (!commitLayout) {
        if (_cardDimensionDragIdleTimer != null) {
            clearTimeout(_cardDimensionDragIdleTimer);
        }
        _cardDimensionDragIdleTimer = setTimeout(() => {
            _cardDimensionDragIdleTimer = null;
            _cardDimensionDragging = false;
            if (_cardDimensionCullTimer != null) {
                clearTimeout(_cardDimensionCullTimer);
            }
            _cardDimensionCullTimer = setTimeout(() => {
                _cardDimensionCullTimer = null;
                if (_cardDimensionCullRaf != null) {
                    cancelAnimationFrame(_cardDimensionCullRaf);
                }
                _cardDimensionCullRaf = requestAnimationFrame(() => {
                    _cardDimensionCullRaf = null;
                    import('./viewport-culling').then(({ performViewportCulling }) => performViewportCulling(ctx)).catch(() => { });
                });
            }, CARD_DIMENSION_PREVIEW_CULL_MS);
        }, CARD_DIMENSION_DRAG_IDLE_MS);

        if (_cardDimensionDragging) {
            return;
        }
        return;
    }

    for (const [path, card] of ctx.fileCards.entries()) {
        const el = card as HTMLElement;
        el.style.width = `${width}px`;
        el.style.height = `${height}px`;
        el.style.maxHeight = `${height}px`;
        ctx.actor.send({ type: 'RESIZE_CARD', path, width, height });
    }

    if (manager) {
        for (const [, card] of manager.cards.entries()) {
            const el = card as HTMLElement;
            el.style.width = `${width}px`;
            el.style.height = `${height}px`;
            el.style.maxHeight = `${height}px`;
        }
    }

    if (_cardDimensionDragIdleTimer != null) {
        clearTimeout(_cardDimensionDragIdleTimer);
        _cardDimensionDragIdleTimer = null;
    }
    if (_cardDimensionCullTimer != null) {
        clearTimeout(_cardDimensionCullTimer);
        _cardDimensionCullTimer = null;
    }
    if (_cardDimensionCullRaf != null) {
        cancelAnimationFrame(_cardDimensionCullRaf);
        _cardDimensionCullRaf = null;
    }
    requestAnimationFrame(() => {
        import('./viewport-culling').then(({ performViewportCulling }) => performViewportCulling(ctx)).catch(() => { });
    });
}

export function applyCardWidth(width: number) {
    applyCardDimensions(width, getDefaultCardHeight(), { persist: false, commitLayout: false });
}

/** Apply theme to document */
export function applyTheme(theme: string) {
    document.documentElement.setAttribute('data-theme', theme);
}

/** Apply all settings on startup */
export function applyAllSettings(ctx?: any) {
    const s = getSettings();
    applyFontSize(s.fontSize);
    applyCardDimensions(s.cardWidth, s.cardHeight, { persist: false, commitLayout: true });
    applyTheme(s.theme);
    if (ctx) {
        ctx.useCanvasText = s.renderMode === 'canvas';
    }
    requestAnimationFrame(() => applyMinimap(s.showMinimap));
}
