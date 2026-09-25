import type { Metadata } from 'next';
import { CalendarCheck2, LayoutGrid, Repeat2, ShieldCheck } from 'lucide-react';
import { Card, PageHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';

export const metadata: Metadata = { title: 'Hoje' };

const saudacao = () => {
  const h = Number(
    new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date()),
  );
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
};

const ROADMAP = [
  { icon: LayoutGrid, etapa: 'E2–E3', titulo: 'Professores e grade semanal', texto: 'Cadastros, grade com vigência e importação da planilha atual.' },
  { icon: CalendarCheck2, etapa: 'E4', titulo: 'Competência 26 → 25', texto: 'O sistema gera todas as aulas do período e calcula as horas previstas.' },
  { icon: Repeat2, etapa: 'E5', titulo: 'Exceções em 4 toques', texto: 'Falta, substituição, cancelamento com motivo e aula avulsa, direto do celular.' },
  { icon: ShieldCheck, etapa: 'E6', titulo: 'Fechamento por área', texto: 'Cada coordenação aprova a sua parte; o admin fecha e exporta.' },
];

export default async function HojePage() {
  const principal = await requirePrincipal();
  const areas = await prisma.coordinationArea.findMany({
    where: principal.areaIds === null ? { deletedAt: null } : { id: { in: [...principal.areaIds] } },
    orderBy: { sortOrder: 'asc' },
  });

  return (
    <>
      <PageHeader
        title={`${saudacao()}, ${principal.name.split(' ')[0]}`}
        description="As aulas de hoje aparecem aqui assim que a grade estiver cadastrada."
      />

      <Card className="mb-6 p-5">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-tinta-fraca">
          {principal.areaIds === null ? 'Você enxerga todas as áreas' : 'Suas áreas de coordenação'}
        </p>
        <div className="flex flex-wrap gap-2">
          {areas.length === 0 && <span className="text-sm text-tinta-suave">Nenhuma área atribuída ainda.</span>}
          {areas.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-2 rounded-full border border-borda px-3 py-1 text-sm font-semibold">
              <span className="size-2.5 rounded-full" style={{ background: a.color }} />
              {a.name}
            </span>
          ))}
        </div>
      </Card>

      <h2 className="mb-3 text-sm font-bold text-navy">O que chega nas próximas etapas</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {ROADMAP.map(({ icon: Icon, etapa, titulo, texto }) => (
          <Card key={titulo} className="flex gap-4 p-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-nacao/10 text-nacao">
              <Icon className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-bold text-navy">{titulo}</p>
                <Badge tone="cyan">{etapa}</Badge>
              </div>
              <p className="mt-1 text-sm text-tinta-suave">{texto}</p>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
