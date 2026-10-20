import type { APIEvent } from "@solidjs/start/server";
import { readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, join, resolve } from "node:path";
import { serverConfig } from "~/server/config";

const FILE_PATTERN = /^[a-f0-9]{32}\.(png|jpg)$/;
const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

function baseDir(): string {
  return isAbsolute(serverConfig.uploads.dir)
    ? serverConfig.uploads.dir
    : resolve(process.cwd(), serverConfig.uploads.dir);
}

export async function GET(event: APIEvent): Promise<Response> {
  const raw = event.params.path;
  const path = Array.isArray(raw) ? raw.join("/") : (raw ?? "");
  if (!FILE_PATTERN.test(path)) return new Response("Not Found", { status: 404 });

  const filePath = join(baseDir(), "cms", path);
  const expectedPrefix = join(baseDir(), "cms") + "/";
  if (!filePath.startsWith(expectedPrefix)) return new Response("Not Found", { status: 404 });

  try {
    const info = await stat(filePath);
    if (!info.isFile()) return new Response("Not Found", { status: 404 });
    const body = new Uint8Array(await readFile(filePath));
    return new Response(body, {
      headers: {
        "Content-Type": CONTENT_TYPES[extname(path)] ?? "application/octet-stream",
        "Content-Length": String(body.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
