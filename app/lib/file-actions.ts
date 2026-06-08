// @ts-nocheck
import { getSettings } from './settings';

export interface FileAction {
    id: string;
    label: string;
    command: string;
    extensions?: string[];
    openInModal?: boolean;
}

const FALLBACK_ACTIONS: FileAction[] = [
    {
        id: 'patch-resolve',
        label: 'Patch Resolve Preview',
        command: 'bunx patch-resolve "{file}"',
        extensions: ['.md'],
        openInModal: true,
    },
];

export function getConfiguredFileActions(): FileAction[] {
    const settings = getSettings() as any;
    const raw = settings.fileActionsJson;
    if (!raw || typeof raw !== 'string') return FALLBACK_ACTIONS;
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return FALLBACK_ACTIONS;
        const cleaned = parsed
            .filter(Boolean)
            .map((a: any) => ({
                id: String(a.id || a.label || 'action').trim(),
                label: String(a.label || a.id || 'Action').trim(),
                command: String(a.command || '').trim(),
                extensions: Array.isArray(a.extensions) ? a.extensions.map((e: any) => String(e).toLowerCase()) : undefined,
                openInModal: a.openInModal !== false,
            }))
            .filter((a: FileAction) => !!a.id && !!a.label && !!a.command);
        return cleaned.length > 0 ? cleaned : FALLBACK_ACTIONS;
    } catch {
        return FALLBACK_ACTIONS;
    }
}

export function getFileActionsForPath(filePath: string): FileAction[] {
    const lower = String(filePath || '').toLowerCase();
    const extMatch = lower.includes('.') ? lower.slice(lower.lastIndexOf('.')) : '';
    return getConfiguredFileActions().filter((action) => {
        if (!action.extensions || action.extensions.length === 0) return true;
        return action.extensions.includes(extMatch);
    });
}