import st from './app.module.css';

/** Seitenrahmen mit großem Titel (wie iOS) – Inhalt darunter. */
export function AppPage({
  title,
  action,
  children,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={st.screen}>
      <header className={st.header}>
        <h1 className={st.title}>{title}</h1>
        {action}
      </header>
      <div className={st.content}>{children}</div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className={st.screen} aria-hidden="true">
      <header className={st.header}>
        <div className="skeleton" style={{ width: 180, height: 34 }} />
      </header>
      <div className={st.content}>
        <div className="skeleton" style={{ height: 150, borderRadius: 16 }} />
        <div className="skeleton" style={{ height: 64, borderRadius: 16 }} />
        <div className="skeleton" style={{ height: 64, borderRadius: 16 }} />
      </div>
    </div>
  );
}
