import type { Commit, FileRecord, HistoryResponse } from './types';

async function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error((await response.text().catch(() => '')) || `${response.status} ${response.statusText}`);
  }

  return await response.json() as T;
}

export async function loadRepository(path: string, signal?: AbortSignal): Promise<Commit[]> {
  const result = await post<{ commits?: Commit[] }>('/api/repo/load', { path }, signal);
  return result.commits || [];
}

export async function changedFiles(path: string, commit: string, signal?: AbortSignal): Promise<FileRecord[]> {
  const result = await post<{ files?: FileRecord[] }>('/api/repo/files', { path, commit }, signal);
  return result.files || [];
}

export async function fileContent(path: string, commit: string, filePath: string, signal?: AbortSignal): Promise<string> {
  const result = await post<{ content?: string; truncated?: boolean }>(
    '/api/repo/file-content',
    { path, commit, filePath },
    signal,
  );
  return `${result.content || ''}${result.truncated ? '\n\n— File truncated by API —' : ''}`;
}

export async function historyCompare(path: string, filePaths: string[], signal?: AbortSignal): Promise<HistoryResponse> {
  return await post<HistoryResponse>(
    '/api/repo/file-history-compare',
    { path, filePaths, limit: 5 },
    signal,
  );
}

export async function streamTree(
  path: string,
  signal: AbortSignal,
  callbacks: { onTotal(total: number): void; onFiles(files: FileRecord[]): void },
): Promise<void> {
  const response = await fetch('/api/repo/tree', {
    method: 'POST',
    signal,
    headers: { Accept: 'application/x-ndjson', 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, stream: true }),
  });

  if (!response.ok) throw new Error(await response.text());
  if (!response.body) throw new Error('Tree stream returned no body.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (typeof event.total === 'number') callbacks.onTotal(event.total);
    if (Array.isArray(event.files)) callbacks.onFiles(event.files);
  };

  while (true) {
    const read = await reader.read();
    if (read.done) break;
    buffer += decoder.decode(read.value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    lines.forEach(consume);
  }

  if (buffer.trim()) consume(buffer);
}

export async function upload(files: FileList): Promise<string> {
  const form = new FormData();
  for (const file of Array.from(files)) {
    form.append('files', file, (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name);
  }

  const response = await fetch('/api/repo/upload', { method: 'POST', body: form });
  if (!response.ok) throw new Error(await response.text());

  const result = await response.json() as { path?: string };
  if (!result.path) throw new Error('Upload did not return a repository path.');
  return result.path;
}

export async function clone(url: string, onProgress: (message: string) => void): Promise<string> {
  const response = await fetch('/api/repo/clone-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });

  if (response.headers.get('content-type')?.includes('application/json')) {
    const result = await response.json() as { path?: string; error?: string };
    if (!result.path) throw new Error(result.error || 'Clone failed.');
    return result.path;
  }

  if (!response.body) throw new Error('Clone stream returned no body.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const read = await reader.read();
    if (read.done) break;
    buffer += decoder.decode(read.value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() || '';

    for (const block of blocks) {
      const event = block.match(/^event:\s*(.+)$/m)?.[1];
      const raw = block.match(/^data:\s*(.+)$/m)?.[1];
      if (!raw) continue;
      const data = JSON.parse(raw);
      if (event === 'progress') onProgress(data.message || 'Cloning repository…');
      if (event === 'error') throw new Error(data.error || 'Clone failed.');
      if (event === 'done' && data.path) return data.path;
    }
  }

  throw new Error('Clone finished without a repository path.');
}

export async function listRepositories(signal?: AbortSignal): Promise<Array<{ name: string; path: string }>> {
  const response = await fetch('/api/repo/list', {
    method: 'GET',
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error((await response.text().catch(() => '')) || `${response.status} ${response.statusText}`);
  }

  const result = await response.json() as { repos?: Array<{ name: string; path: string }> };
  return Array.isArray(result.repos) ? result.repos : [];
}

export async function resolveSlug(slug: string, signal?: AbortSignal): Promise<string | null> {
  const result = await post<{ path?: string | null }>('/api/repo/resolve-slug', { slug }, signal);
  return typeof result.path === 'string' && result.path.trim() ? result.path : null;
}