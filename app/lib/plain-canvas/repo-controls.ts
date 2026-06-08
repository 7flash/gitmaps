import { cloneRepository, uploadFolder } from './api';
import { lastRepository, readRecentRepositories, rememberRepository } from './state';
import type { CanvasRefs } from './types';
import { addListener, fileName, statusMessage, toast } from './utils';

export class RepositoryControls {
  private disposers: Array<() => void> = [];
  constructor(private readonly refs: CanvasRefs, private readonly openRepository: (path: string) => Promise<void>) {}
  mount(): void {
    const selectedBeforePopulate = this.refs.repoSelect?.value || '';
    this.populate();
    addListener(this.disposers, this.refs.repoSelect, 'change', (() => {
      const value = this.refs.repoSelect!.value; if (!value) return;
      if (value.startsWith('__')) { this.refs.folderPicker?.click(); return; }
      void this.openRepository(value);
    }) as EventListener);
    addListener(this.disposers, this.refs.folderPicker, 'change', (() => {
      const files = this.refs.folderPicker!.files; if (!files?.length) return;
      statusMessage(this.refs, `Uploading ${files.length} files…`, 'loading');
      void uploadFolder(files).then(path => { this.add(path); return this.openRepository(path); }).catch(error => toast(error.message || 'Upload failed.', true));
    }) as EventListener);
    addListener(this.disposers, document.getElementById('githubImportBtn'), 'click', (() => {
      const url = window.prompt('Paste a Git repository URL', 'https://github.com/')?.trim(); if (!url) return;
      void cloneRepository(url, message => statusMessage(this.refs, message, 'loading')).then(path => { this.add(path); return this.openRepository(path); }).catch(error => toast(error.message || 'Clone failed.', true));
    }) as EventListener);
    const selected = selectedBeforePopulate || this.refs.repoSelect?.value || '';
    const initial = this.refs.repoPath?.value?.trim() || (selected && !selected.startsWith('__') ? selected : '') || lastRepository();
    if (initial) void this.openRepository(initial);
  }
  dispose(): void { for (const dispose of this.disposers.splice(0)) dispose(); }
  select(path: string): void { rememberRepository(path); this.populate(); if (this.refs.repoSelect) this.refs.repoSelect.value = path; if (this.refs.repoPath) this.refs.repoPath.value = path; }
  private add(path: string): void { rememberRepository(path); this.populate(); }
  private populate(): void {
    const select = this.refs.repoSelect; if (!select) return;
    const special = Array.from(select.options).find(option => option.value.startsWith('__'));
    const existingPaths = Array.from(select.options)
      .map(option => option.value)
      .filter(value => value && !value.startsWith('__'));
    const paths = Array.from(new Set([...existingPaths, ...readRecentRepositories()]));
    select.replaceChildren();
    const blank = document.createElement('option'); blank.value = ''; blank.textContent = 'Select a repository…'; select.appendChild(blank);
    for (const path of paths) { const option = document.createElement('option'); option.value = path; option.textContent = fileName(path); option.title = path; select.appendChild(option); }
    const browse = document.createElement('option'); browse.value = special?.value || '__browse__'; browse.textContent = special?.textContent || '＋ Open folder…'; select.appendChild(browse);
  }
}