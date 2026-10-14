import { Fragment } from 'react';
import { IconMore } from '@/components/icons';

/** Ersetzt „•••“ im Text durch das echte Drei-Punkte-Symbol (die Textschrift zeichnet eckige Punkte). */
export function withIcons(text: string) {
  const parts = text.split('•••');
  return parts.map((part, i) => (
    <Fragment key={i}>
      {part}
      {i < parts.length - 1 && (
        <span
          role="img"
          aria-label="•••"
          style={{
            display: 'inline-grid',
            placeItems: 'center',
            width: 30,
            height: 22,
            margin: '0 2px',
            verticalAlign: -5,
            borderRadius: 11,
            background: 'var(--surface)',
            border: '1px solid var(--line-strong)',
          }}
        >
          <IconMore size={18} />
        </span>
      )}
    </Fragment>
  ));
}
