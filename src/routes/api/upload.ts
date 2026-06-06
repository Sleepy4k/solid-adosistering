import type { APIEvent } from "@solidjs/start/server";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { getSession } from "~/server/session";
import { assertSuperadmin } from "~/server/security";

const MAX_SIZE = 2 * 1024 * 1024;

function getUploadDir(): string {
  const prodClient = join(process.cwd(), "dist", "client");
  const base = existsSync(prodClient) ? prodClient : join(process.cwd(), "public");
  return join(base, "uploads", "cms");
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
  )
    return "png";
  return null;
}

function hasAllowedExtension(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ext === "jpg" || ext === "jpeg" || ext === "png";
}

export async function POST(event: APIEvent): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  try {
    assertSuperadmin(session);
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await event.request.formData();
  } catch {
    return new Response("Format request tidak valid.", { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return new Response("File tidak ditemukan.", { status: 400 });

  if (!hasAllowedExtension(file.name))
    return new Response("Ekstensi file tidak didukung. Hanya PNG, JPG, JPEG.", { status: 400 });

  if (file.size > MAX_SIZE) return new Response("Ukuran file melebihi batas 2MB.", { status: 400 });

  const buffer = new Uint8Array(await file.arrayBuffer());

  const imageType = detectImageType(buffer);
  if (!imageType) return new Response("File bukan gambar PNG atau JPEG yang valid.", { status: 400 });

  const safeExt = imageType === "png" ? ".png" : ".jpg";
  const filename = randomBytes(16).toString("hex") + safeExt;

  const uploadDir = getUploadDir();
  await mkdir(uploadDir, { recursive: true });
  await writeFile(join(uploadDir, filename), buffer);

  return new Response(JSON.stringify({ url: `/uploads/cms/${filename}` }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
