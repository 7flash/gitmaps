import { measure } from "measure-fn";
import simpleGit from "simple-git";
import { readFileSync } from "fs";
import path from "path";
import { validateRepoPath } from "../validate-path";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
};

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".tar",
  ".mp3",
  ".mp4",
  ".mov",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
]);

// Size limits to prevent OOM
const MAX_TEXT_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_IMAGE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_LINES = 10000;

function isLikelyBinary(filePath: string, buffer: Buffer) {
  const ext = path.extname(filePath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) return true;
  const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
  return sample.includes(0);
}

export async function POST(req: Request) {
  return measure("api:repo:file-content", async () => {
    try {
      const { path: repoPath, commit, filePath } = await req.json();

      console.log(`[file-content] Request: repoPath=${repoPath}, commit=${commit}, filePath=${filePath}`);

      if (!repoPath || !filePath) {
        return new Response("Repository path and file path are required", {
          status: 400,
        });
      }

      const blocked = validateRepoPath(repoPath);
      if (blocked) return blocked;

      if (commit && commit !== "__working__") {
        const git = simpleGit(repoPath);
        const content = await git.show([`${commit}:${filePath}`]);
        console.log(`[file-content] Git show returned ${content.length} chars`);
        // Truncate if too large
        if (content.length > MAX_TEXT_FILE_SIZE) {
          return Response.json({
            content: content.slice(0, MAX_TEXT_FILE_SIZE) + "\n\n--- File truncated, too large to display ---",
            truncated: true,
            originalSize: content.length,
          });
        }
        return Response.json({ content });
      }

      const fullPath = path.join(repoPath, filePath);
      console.log(`[file-content] Full path: ${fullPath}`);
      const file = Bun.file(fullPath);
      const size = file.size;
      console.log(`[file-content] File size: ${size} bytes`);

      // Check size before reading
      if (size > MAX_TEXT_FILE_SIZE) {
        console.log(`[file-content] File too large, truncating`);
        // Read only the first part for large files
        const buffer = readFileSync(fullPath);
        const sample = buffer.subarray(0, MAX_TEXT_FILE_SIZE).toString("utf8");
        const lineCount = sample.split("\n").length;
        if (lineCount > MAX_LINES) {
          const lines = sample.split("\n").slice(0, MAX_LINES);
          return Response.json({
            content: lines.join("\n") + "\n\n--- Truncated to first " + MAX_LINES + " lines (file is too large) ---",
            truncated: true,
            originalSize: size,
            lineCount: lineCount,
          });
        }
        return Response.json({
          content: sample + "\n\n--- File truncated, too large to display ---",
          truncated: true,
          originalSize: size,
        });
      }

      const buffer = readFileSync(fullPath);
      console.log(`[file-content] Read ${buffer.length} bytes`);

      if (isLikelyBinary(filePath, buffer)) {
        console.log(`[file-content] File detected as binary, rejecting`);
        return new Response("Binary file cannot be copied as text", {
          status: 415,
        });
      }

      const content = buffer.toString("utf8");
      const lines = content.split("\n");
      console.log(`[file-content] Converted to text, ${lines.length} lines, ${content.length} chars`);

      // Truncate by line count
      if (lines.length > MAX_LINES) {
        return Response.json({
          content: lines.slice(0, MAX_LINES).join("\n") + "\n\n--- Truncated to first " + MAX_LINES + " lines ---",
          truncated: true,
          originalSize: size,
          lineCount: lines.length,
        });
      }

      console.log(`[file-content] Returning content`);
      return Response.json({ content });
    } catch (error: any) {
      console.error("api:repo:file-content:error", error);
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  });
}

export async function GET(req: Request) {
  return measure("api:repo:file-image", async () => {
    try {
      const url = new URL(req.url);
      const repoPath = url.searchParams.get("path");
      const file = url.searchParams.get("file");

      if (!repoPath || !file) {
        return new Response("Repository path and file are required", {
          status: 400,
        });
      }

      const blocked = validateRepoPath(repoPath);
      if (blocked) return blocked;

      const ext = path.extname(file).toLowerCase();
      const mimeType = MIME_TYPES[ext];

      if (!mimeType) {
        return new Response("Not an image file", { status: 400 });
      }

      const fullPath = path.join(repoPath, file);
      const fileObj = Bun.file(fullPath);
      const size = fileObj.size;

      // Check size before reading
      if (size > MAX_IMAGE_SIZE) {
        return new Response(`Image too large (max ${MAX_IMAGE_SIZE / 1024 / 1024}MB)`, {
          status: 413,
        });
      }

      const buffer = readFileSync(fullPath);

      return new Response(buffer, {
        headers: {
          "Content-Type": mimeType,
          "Cache-Control": "public, max-age=31536000",
        },
      });
    } catch (error: any) {
      console.error("api:repo:file-image:error", error);
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  });
}
