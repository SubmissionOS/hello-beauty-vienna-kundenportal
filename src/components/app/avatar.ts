/**
 * Bilder im Browser vorbereiten, bevor sie hochgeladen werden: verkleinert, als WebP (JPEG als Rückfall).
 * Durch das Neuzeichnen auf ein Canvas fallen EXIF-Daten inkl. Standort weg.
 */
async function prepareImage(file: File, opts: { max: number; square: boolean }): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) || file.size > 20 * 1024 * 1024) throw new Error('type');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const side = Math.min(bitmap.width, bitmap.height);
  const [sw, sh] = opts.square ? [side, side] : [bitmap.width, bitmap.height];
  const scale = Math.min(1, opts.max / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  const webp = await toBlob('image/webp');
  const blob = webp && webp.type === 'image/webp' ? webp : await toBlob('image/jpeg');
  if (!blob) throw new Error('encode');
  return blob;
}

/** Profilbild: quadratisch, max. 512 px */
export const prepareAvatar = (file: File) => prepareImage(file, { max: 512, square: true });

/** Bild einer Neuigkeit: Seitenverhältnis bleibt, max. 1280 px */
export const prepareNewsImage = (file: File) => prepareImage(file, { max: 1280, square: false });
