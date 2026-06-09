import { cloneRepository, uploadFolder } from './api';
import { lastRepository, readRecentRepositories, rememberRepository } from './state';
import type { CanvasRefs } from './types';
import { addListener, fileName, statusMessage, toast } from './utils';
import { getRepoPathFromLocation, normalizeRepoPathForUi, syncRepoUrl } from './route';

export class RepositoryControls {
  private disposers: Array<() => void> = [];
  private readonly opened = new Set<string>();

  constructor(private readonly refs: CanvasRefs, private readonly openRepository: (path: string) => Promise<void>) {}

  mount(): void {
    const selectedBeforePopulate = this.refs.repoSelect?.value || '';
    this.populate();

    addListener(this.disposers, this.refs.repoSelect, 'change', (() => {
      const value = normalizeRepoPathForUi(this.refs.repoSelect!.value);
      if (!value) return;
      if (value.startsWith('__')) { this.refs.folderPicker?.click(); return; }
      void this.openAndRemember(value, true);
    }) as EventListener);

    addListener(this.disposers, this.refs.repoPath, 'keydown', ((event: KeyboardEvent) => {
      if (event.key !== 'Enter') return;
      const value = normalizeRepoPathForUi(this.refs.repoPath?.value || '');
      if (value) void this.openAndRemember(value, true);
    }) as EventListener);

    addListener(this.disposers, this.refs.folderPicker, 'change', (() => {
      const files = this.refs.folderPicker!.files;
      if (!files?.length) return;
      statusMessage(this.refs, `Uploading ${files.length} files…`, 'loading');
      void uploadFolder(files)
        .then(path => this.openAndRemember(path, true))
        .catch(error => toast(error.message || 'Upload failed.', true));
    }) as EventListener);

    addListener(this.disposers, document.getElementById('githubImportBtn'), 'click', (() => {
      const url = window.prompt('Paste a Git repository URL', 'https://github.com/')?.trim();
      if (!url) return;
      void cloneRepository(url, message => statusMessage(this.refs, message, 'loading'))
        .then(path => this.openAndRemember(path, true))
        .catch(error => toast(error.message || 'Clone failed.', true));
    }) as EventListener);

    addListener(this.disposers, window, 'popstate', (() => {
      const routed = getRepoPathFromLocation();
      if (routed) void this.openAndRemember(routed, false);
    }) as EventListener);

    const routed = getRepoPathFromLocation();
    const selected = selectedBeforePopulate || this.refs.repoSelect?.value || '';
    const input = normalizeRepoPathForUi(this.refs.repoPath?.value || '');
    const initial = routed || input || (selected && !selected.startsWith('__') ? normalizeRepoPathForUi(selected) : '') || lastRepository();
    if (initial) void this.openAndRemember(initial, false);
  }

  dispose(): void { for (const dispose of this.disposers.splice(0)) dispose(); }

  select(path: string): void {
    const clean = normalizeRepoPathForUi(path);
    rememberRepository(clean);
    this.populate();
    if (this.refs.repoSelect) this.refs.repoSelect.value = clean;
    if (this.refs.repoPath) this.refs.repoPath.value = clean;
  }

  private async openAndRemember(path: string, pushUrl: boolean): Promise<void> {
    const clean = normalizeRepoPathForUi(path);
    if (!clean) return;
    this.select(clean);
    if (pushUrl) syncRepoUrl(clean);
    this.opened.add(clean);
    await this.openRepository(clean);
  }

  private populate(): void {
    const select = this.refs.repoSelect;
    if (!select) return;

    const special = Array.from(select.options).find(option => option.value.startsWith('__'));
    const existingPaths = Array.from(select.options)
      .map(option => option.value)
      .filter(value => value && !value.startsWith('__'));
    const routed = getRepoPathFromLocation();
    const paths = Array.from(new Set([
      ...(routed ? [routed] : []),
      ...existingPaths,
      ...Array.from(this.opened),
      ...readRecentRepositories(),
    ].map(normalizeRepoPathForUi).filter(Boolean)));

    const current = normalizeRepoPathForUi(select.value || this.refs.repoPath?.value || routed || '');
    select.replaceChildren();

    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = 'Select a repository…';
    select.appendChild(blank);

    for (const path of paths) {
      const option = document.createElement('option');
      option.value = path;
      option.textContent = fileName(path);
      option.title = path;
      select.appendChild(option);
    }

    const browse = document.createElement('option');
    browse.value = special?.value || '__browse__';
    browse.textContent = special?.textContent || '＋ Open folder…';
    select.appendChild(browse);

    if (current && paths.includes(current)) select.value = current;
  }
}
