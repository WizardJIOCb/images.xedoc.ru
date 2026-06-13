import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";

export async function ensureUploadDirs(rootDir: string) {
  for (const dir of ["generated", "thumbnails", "source"]) {
    await mkdir(path.join(rootDir, dir), { recursive: true });
  }
}

export async function saveGeneratedImage(rootDir: string, base64Data: string, fileName?: string) {
  const safeName = fileName ?? `${nanoid()}.png`;
  const finalName = safeName.endsWith(".png") ? safeName : `${safeName}.png`;
  const outputPath = path.join(rootDir, "generated", finalName);
  await writeFile(outputPath, Buffer.from(base64Data, "base64"));

  return {
    fileName: finalName,
    imageUrl: `/uploads/generated/${finalName}`,
    thumbnailUrl: `/uploads/generated/${finalName}`
  };
}
