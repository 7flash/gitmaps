import type { Commit, FileRecord, HistoryResponse } from './types';

async function errorText(response: Response): Promise<string> {
  return (await response.text().catch(() => '')) || `${response.status} ${response.statusText}`;
}

export async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await errorText(response));
  return await response.json() as T;
}

export async function loadRepository(path: string, signal?: AbortSignal): Promise<Commit[]> {
  const response = await postJson<{ commits?: Commit[] }>('/api/repo/load', { path }, signal);
  return response.commits || [];
}

export async function loadChangedFiles(path: string, commit: string, signal?: AbortSignal): Promise<FileRecord[]> {
  const response = await postJson<{ files?: FileRecord[] }>('/api/repo/files', { path, commit }, signal);
  return response.files || [];
}

export async function loadFileContent(repoPath: string, commit: string, filePath: string, signal?: AbortSignal): Promise<string> {
  const response = await postJson<{ content?: string; truncated?: boolean }>('/api/repo/file-content', { path: repoPath, commit, filePath }, signal);
  return `${response.content || ''}${response.truncated ? '\n\n— File truncated by API —' : ''}`;
}

export async function loadHistoryComparison(repoPath: string, filePaths: string[], signal?: AbortSignal): Promise<HistoryResponse> {
  return await postJson<HistoryResponse>('/api/repo/file-history-compare', { path: repoPath, filePaths, limit: 5 }, signal);
}

export async function streamTree(
  path: string,
  signal: AbortSignal,
  onTotal: (total: number) => void,
  onBatch: (files: FileRecord[]) => void,
): Promise<void> {
  const response = await fetch('/api/repo/tree', {
    method: 'POST',
    signal,
    headers: { Accept: 'application/x-ndjson', 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, stream: true }),
  });
  if (!response.ok) throw new Error(await errorText(response));
  if (!response.body) throw new Error('Repository tree stream returned no body.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  const parse = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (typeof event.total === 'number') onTotal(event.total);
    if (Array.isArray(event.files)) onBatch(event.files as FileRecord[]);
  };

  while (true) {
    const result = await reader.read();
    if (result.done) break;
    buffered += decoder.decode(result.value, { stream: true });
    const lines = buffered.split('\n');
    buffered = lines.pop() || '';
    for (const line of lines) parse(line);
  }
  if (buffered.trim()) parse(buffered);
}

export async function uploadFolder(files: FileList): Promise<string> {
  const form = new FormData();
  for (const file of Array.from(files)) {
    const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    form.append('files', file, relativePath);
  }
  const response = await fetch('/api/repo/upload', { method: 'POST', body: form });
  if (!response.ok) throw new Error(await errorText(response));
  const data = await response.json() as { path?: string };
  if (!data.path) throw new Error('Upload endpoint did not return a repository path.');
  return data.path;
}

export async function cloneRepository(url: string, onProgress: (message: string) => void): Promise<string> {
  const response = await fetch('/api/repo/clone-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (response.headers.get('content-type')?.includes('application/json')) {
    const data = await response.json() as { path?: string; error?: string };
    if (!response.ok || !data.path) throw new Error(data.error || 'Clone failed.');
    return data.path;
  }
  if (!response.body) throw new Error('Clone stream returned no body.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    buffered += decoder.decode(result.value, { stream: true });
    const blocks = buffered.split('\n\n');
    buffered = blocks.pop() || '';
    for (const block of blocks) {
      const event = block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
      const raw = block.match(/^data:\s*(.+)$/m)?.[1]?.trim();
      if (!raw) continue;
      const data = JSON.parse(raw);
      if (event === 'progress') onProgress(data.message || 'Cloning repository…');
      if (event === 'error') throw new Error(data.error || 'Clone failed.');
      if (event === 'done' && data.path) return data.path;
    }
  }
  throw new Error('Clone completed without returning a path.');
}
