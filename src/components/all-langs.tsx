import { dicts, langs, type Dict } from '@/lib/i18n';

/**
 * Text in allen drei Sprachen vorrendern; sichtbar ist nur die Sprache von <html lang>, die das Boot-Skript
 * vor dem ersten Paint setzt. Nach der Hydrierung wird nichts ausgetauscht (ruhiger Aufbau, frühes LCP).
 */
export function AllLangs({ pick }: { pick: (t: Dict) => string }) {
  return (
    <>
      {langs.map((l) => (
        <span key={l} lang={l} data-l={l}>
          {pick(dicts[l])}
        </span>
      ))}
    </>
  );
}
