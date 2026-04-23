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
        return Response.json({ content });
      }

      const fullPath = path.join(repoPath, filePath);
      const buffer = readFileSync(fullPath);

      if (isLikelyBinary(filePath, buffer)) {
        return new Response("Binary file cannot be copied as text", {
          status: 415,
        });
      }

      return Response.json({ content: buffer.toString("utf8") });
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
