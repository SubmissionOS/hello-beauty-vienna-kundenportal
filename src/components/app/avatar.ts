/**
 * Profilbild im Browser vorbereiten: quadratisch zugeschnitten, max. 512 px, als WebP (JPEG als Rückfall).
 * Durch das Neuzeichnen auf ein Canvas fallen EXIF-Daten inkl. Standort weg.
 */
const SIZE = 512;

export async function prepareAvatar(file: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) || file.size > 20 * 1024 * 1024) throw new Error('type');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const side = Math.min(bitmap.width, bitmap.height);
  const target = Math.min(SIZE, side);
  const canvas = document.createElement('canvas');
  canvas.width = target;
  canvas.height = target;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, target, target);
  bitmap.close();
  const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  const webp = await toBlob('image/webp');
  const blob = webp && webp.type === 'image/webp' ? webp : await toBlob('image/jpeg');
  if (!blob) throw new Error('encode');
  return blob;
}
