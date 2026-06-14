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

export async function saveSourceImage(rootDir: string, buffer: Buffer, fileName?: string) {
  const extension = path.extname(fileName ?? "") || ".png";
  const baseName = path.basename(fileName ?? `${nanoid()}${extension}`, extension);
  const finalName = `${baseName}-${nanoid()}${extension}`;
  const outputPath = path.join(rootDir, "source", finalName);

  await writeFile(outputPath, buffer);

  return {
    fileName: finalName,
    imageUrl: `/uploads/source/${finalName}`
  };
}
