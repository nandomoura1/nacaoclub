'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Rolagem horizontal com uma segunda barra no topo, presa no alto da tela
 * enquanto a página desce. Em quadros longos (Kanban com muito backlog, grade
 * do mês) a barra de baixo fica longe; a de cima está sempre à mão.
 * A barra só aparece quando o conteúdo é mais largo que a área.
 */
export function TopScroll({ className, children }: { className?: string; children: React.ReactNode }) {
  const top = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const [width, setWidth] = useState(0);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const measure = () => {
      setWidth(el.scrollWidth);
      setOverflow(el.scrollWidth > el.clientWidth + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, [children]);

  const follow = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (!from || !to) return;
    if (syncing.current) { syncing.current = false; return; }
    syncing.current = true;
    to.scrollLeft = from.scrollLeft;
  };

  return (
    <div>
      {overflow && (
        <div ref={top} aria-hidden onScroll={() => follow(top.current, body.current)}
          className="sticky top-0 z-20 mb-1 h-4 overflow-x-auto overflow-y-hidden rounded bg-fundo/90 backdrop-blur print:hidden">
          <div style={{ width, height: 1 }} />
        </div>
      )}
      <div ref={body} onScroll={() => follow(body.current, top.current)} className={cn('overflow-x-auto', className)}>
        {children}
      </div>
    </div>
  );
}
