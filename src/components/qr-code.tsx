import qrcode from 'qrcode-generator';

/** QR-Code als SVG – lokal erzeugt, kein externer Dienst. Fehlerkorrektur M, 4 Module Ruhezone. */
export function QrCode({ value, size = 240, label }: { value: string; size?: number; label: string }) {
  const qr = qrcode(0, 'M');
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  const total = n + quiet * 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${total} ${total}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      style={{ background: 'var(--qr-bg)', borderRadius: 'var(--r-sm)' }}
    >
      <path d={d} style={{ fill: 'var(--qr-fg)' }} />
    </svg>
  );
}
