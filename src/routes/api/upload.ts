import type { APIEvent } from "@solidjs/start/server";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { serverConfig } from "~/server/config";
import { checkRateLimit, rateLimitResponse } from "~/server/rateLimit";
import { assertSuperadmin } from "~/server/security";
import { getSession } from "~/server/session";

const MAX_SIZE = serverConfig.uploads.maxBytes;

function uploadDir(): string {
  return isAbsolute(serverConfig.uploads.dir)
    ? join(serverConfig.uploads.dir, "cms")
    : resolve(process.cwd(), serverConfig.uploads.dir, "cms");
}

function detectImageType(buf: Uint8Array): "jpg" | "png" | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "png";
  }
  return null;
}

function hasAllowedExtension(name: string): boolean {
  return /\.(jpe?g|png)$/i.test(name);
}

export async function POST(event: APIEvent): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  try {
    assertSuperadmin(session);
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const limit = checkRateLimit(`upload:${session.id}`, 20, 60 * 60_000);
  if (!limit.allowed) return rateLimitResponse(limit);

  const contentLength = Number(event.request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_SIZE + 64 * 1024) {
    return new Response("Ukuran file melebihi batas 2MB.", { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await event.request.formData();
  } catch {
    return new Response("Format request tidak valid.", { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return new Response("File tidak ditemukan.", { status: 400 });
  if (!hasAllowedExtension(file.name)) {
    return new Response("Ekstensi file tidak didukung. Hanya PNG, JPG, JPEG.", { status: 400 });
  }
  if (file.size > MAX_SIZE) return new Response("Ukuran file melebihi batas 2MB.", { status: 413 });
  if (file.type && file.type !== "image/png" && file.type !== "image/jpeg") {
    return new Response("Tipe file tidak didukung. Hanya PNG atau JPEG.", { status: 415 });
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const imageType = detectImageType(buffer);
  if (!imageType) return new Response("File bukan gambar PNG atau JPEG yang valid.", { status: 400 });

  const filename = `${randomBytes(16).toString("hex")}.${imageType}`;
  const targetDir = uploadDir();
  await mkdir(targetDir, { recursive: true, mode: 0o750 });
  await writeFile(join(targetDir, filename), buffer, { mode: 0o640 });

  return new Response(JSON.stringify({ url: `/uploads/cms/${filename}` }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
