/* eslint-disable @next/next/no-img-element -- Bilder sind vorab skaliert, kein Optimierer nötig */

/** Querformat-Logo der Salon-CI (gold; im Dunkelmodus weiß). Höhe wie im Website-Header: Token --logo-h. */
export function LogoWide({ priority = false }: { priority?: boolean }) {
  const width = 180;
  const height = 40;
  return (
    <span className="logo-wide" style={{ display: 'inline-block', height: 'var(--logo-h)', aspectRatio: '1000 / 222' }}>
      <img
        className="logo-light"
        src="/brand/logo-quer-gold.png"
        alt="Hello Beauty"
        width={width}
        height={height}
        fetchPriority={priority ? 'high' : 'auto'}
      />
      <img className="logo-dark" src="/brand/logo-quer-weiss.png" alt="Hello Beauty" width={width} height={height} loading="lazy" />
    </span>
  );
}

export function Monogram({ size = 72, alt = '' }: { size?: number; alt?: string }) {
  return <img src="/brand/monogramm-gold.png" alt={alt} width={size} height={size} />;
}
