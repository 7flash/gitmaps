import path from 'path';

function runGit(args: string[]): string {
    const repoRoot = path.resolve(import.meta.dir, '../../..');
    const proc = Bun.spawnSync(['git', ...args], {
        cwd: repoRoot,
        stdout: 'pipe',
        stderr: 'pipe',
    });

    if (proc.exitCode !== 0) {
        return '';
    }

    return proc.stdout.toString().trim();
}

export async function GET() {
    const commit = process.env.GIT_COMMIT_HASH || runGit(['rev-parse', '--short', 'HEAD']) || 'unknown';
    const commitDate = process.env.GIT_COMMIT_DATE || runGit(['log', '-1', '--format=%cs']) || '';

    return Response.json({
        commit,
        commitDate,
    });
}
