'use client';

import { langs } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n/use-i18n';

/** Sprachwahl DE / EN / HU (kompakt) */
export function LangSwitch({ onChange }: { onChange?: (lang: (typeof langs)[number]) => void }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="segmented" role="group" aria-label={t.common.language} style={{ minWidth: 150 }}>
      {langs.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={lang === l}
          aria-label={`${l.toUpperCase()} – ${t.common.langNames[l]}`}
          onClick={() => {
            setLang(l);
            onChange?.(l);
          }}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
