import type { ReactNode } from 'react';

export function FeaturePage({ title, subtitle, actions, children }: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="feature-page" aria-label={title}>
      <header className="feature-page-header">
        <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
        {actions && <div className="feature-page-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}
