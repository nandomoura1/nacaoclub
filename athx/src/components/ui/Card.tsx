import type { ReactNode } from 'react';

export function Card({
  children,
  className = '',
  raised = false,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  raised?: boolean;
  as?: 'div' | 'section' | 'article' | 'li';
}) {
  return (
    <Tag className={`${raised ? 'surface-raised' : 'surface'} ${className}`}>{children}</Tag>
  );
}

export function CardHeader({
  title,
  kicker,
  action,
  className = '',
}: {
  title: string;
  kicker?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {kicker ? (
          <p className="font-display text-[10px] tracking-kicker font-bold text-nacao-cyan uppercase">
            {kicker}
          </p>
        ) : null}
        <h2 className="mt-1 font-display text-xl font-extrabold uppercase sm:text-2xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

/** Estado vazio consistente — evita telas mudas durante o evento. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="surface flex flex-col items-center gap-3 px-6 py-14 text-center">
      <p className="font-display text-lg font-bold uppercase text-white/85">{title}</p>
      {description ? <p className="max-w-sm text-sm text-white/55">{description}</p> : null}
      {action}
    </div>
  );
}
