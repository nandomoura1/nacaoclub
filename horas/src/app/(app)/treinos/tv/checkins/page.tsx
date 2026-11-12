import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { listClassLinks, todayCheckins } from '@/server/services/tv-checkin-service';
import { ClassLinks } from './ClassLinks';
import { Privacy } from './Privacy';

export const metadata: Metadata = { title: 'Check-ins na TV' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const principal = await requirePrincipal();
  const links = can(principal, 'workout.edit');
  const privacy = can(principal, 'tv.privacy');
  if (!links && !privacy) redirect('/hoje');
  const [l, p] = await Promise.all([links ? listClassLinks(principal) : null, privacy ? todayCheckins(principal) : null]);
  return (
    <>
      <PageHeader
        title="Check-ins na TV"
        description="Durante a aula, a TV mostra quem fez check-in na Tecnofit — só o primeiro nome e a inicial (ex.: “Ana S.”), sem horário de chegada. Quem não quiser aparecer, a recepção marca aqui. A Tecnofit é consultada no máximo uma vez por minuto, só com TV ligada em aula."
      />
      {p && <Privacy data={p} />}
      {l && (
        <Card className="mt-4 p-4">
          <h2 className="font-bold text-navy">Turmas da Tecnofit ↔ aulas da grade</h2>
          <p className="mb-3 text-xs text-tinta-suave">
            Diga a qual modalidade (e, se precisar, espaço) da nossa grade cada turma da Tecnofit corresponde. O check-in entra na aula da TV quando a turma está vinculada à
            modalidade da tela e o horário bate (até 10 min de diferença). A sugestão vem pelo nome — confira e salve.
          </p>
          {l.error && <p className="mb-2 text-sm text-atencao">{l.error}</p>}
          <ClassLinks rows={l.rows} modalities={l.modalities} spaces={l.spaces} />
        </Card>
      )}
    </>
  );
}
