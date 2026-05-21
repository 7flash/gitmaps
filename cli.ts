#!/usr/bin/env bun
/**
 * gitmaps CLI — run GitMaps locally on any repository
 * Usage: npx gitmaps [path] [--port 3335]
 */

import net from 'node:net';

const args = process.argv.slice(2);
let repoPath = process.cwd();
let port: number | null = null;

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
        port = parseInt(args[i + 1]);
        i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
        console.log(`
🪐 GitMaps — Spatial Code Explorer

Usage:
  npx gitmaps                  # Open current directory
  npx gitmaps /path/to/repo    # Open specific repo
  npx gitmaps --port 4000      # Custom port

Options:
  --port <number>    Force a specific port
  --help, -h         Show this help
`);
        process.exit(0);
    } else if (!args[i].startsWith('-')) {
        repoPath = args[i];
    }
}

process.env.GITMAPS_REPO = repoPath;

async function isPortAvailable(candidate: number): Promise<boolean> {
    return await new Promise((resolve) => {
        const server = net.createServer();
        server.unref();
        server.once('error', () => resolve(false));
        server.listen(candidate, '127.0.0.1', () => {
            server.close(() => resolve(true));
        });
    });
}

async function findAvailablePort(startPort: number, attempts = 50): Promise<number> {
    for (let offset = 0; offset < attempts; offset++) {
        const candidate = startPort + offset;
        if (await isPortAvailable(candidate)) {
            return candidate;
        }
    }
    throw new Error(`No free port found in range ${startPort}-${startPort + attempts - 1}`);
}

if (port !== null) {
    process.env.BUN_PORT = String(port);
} else {
    port = await findAvailablePort(3335);
    process.env.BUN_PORT = String(port);
}

console.log(`🪐 GitMaps starting...`);
console.log(`   Repo: ${repoPath}`);
console.log(`   Port: ${port}`);
console.log(`   URL:  http://localhost:${port}`);
console.log();

// Import and run the server
import('./server.ts');
