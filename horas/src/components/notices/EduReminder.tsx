import Link from 'next/link';
import { GraduationCap } from 'lucide-react';

/** Lembrete da Universidade Nação: obrigatórios ainda não concluídos. */
export function EduReminder({ r }: { r: { pending: number; total: number } | null }) {
  if (!r) return null;
  return (
    <Link href="/universidade" className="mb-4 flex items-center gap-3 rounded-2xl border border-atencao/40 bg-atencao/5 px-4 py-3 text-sm hover:border-atencao print:hidden">
      <GraduationCap className="size-5 shrink-0 text-atencao" />
      <span className="min-w-0 flex-1"><b className="text-navy">Universidade Nação:</b> {r.pending} material(is) obrigatório(s) para concluir ({r.total - r.pending} de {r.total} feitos).</span>
      <span className="font-semibold text-nacao">Ver →</span>
    </Link>
  );
}
