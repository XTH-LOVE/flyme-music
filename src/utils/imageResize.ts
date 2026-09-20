/**
 * Client-side image downscale for avatar uploads: center-crop to a square
 * and re-encode as JPEG. A phone photo (3-8 MB) becomes ~30-80 KB, which
 * uploads in under a second even on mobile data and never hits the storage
 * size limit.
 */

export async function resizeToSquareJpeg(
  file: Blob,
  size = 256,
  quality = 0.85,
): Promise<Blob> {
  const bitmap = await loadBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画布不可用");

  // Center-crop: scale the shorter edge to fill, keep the middle.
  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const drawW = bitmap.width * scale;
  const drawH = bitmap.height * scale;
  ctx.drawImage(
    bitmap,
    (bitmap.width - drawW) / 2,
    (bitmap.height - drawH) / 2,
    drawW,
    drawH,
    0,
    0,
    size,
    size,
  );
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
  );
  if (!blob) throw new Error("图片处理失败");
  return blob;
}

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall back to <img> for formats ImageBitmap rejects */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("图片无法读取"));
      img.src = url;
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }
}
