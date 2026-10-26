import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { fromUtc } from '@/domain/dates';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { listLegal } from '@/server/services/ws-service';
import { LegalClient } from './LegalClient';

export const metadata: Metadata = { title: 'Parâmetros legais — Escalas 5x2' };

export default async function ParametrosPage() {
  const principal = await requirePrincipal();
  if (!can(principal, 'ws.view')) redirect('/hoje');
  const rows = await listLegal(principal);
  return (
    <>
      <PageHeader title="Parâmetros legais e contratuais" description="Jornada, intervalos, descansos e domingos por vínculo, com data de vigência. Quem cadastra e valida é o Departamento Pessoal (CLT, convenção coletiva, contrato FUNAP). Sem parâmetro validado, a escala mostra a pendência e nunca é declarada regular." />
      <LegalClient rows={rows.map((r) => ({ ...r, validFrom: fromUtc(r.validFrom), validatedAt: r.validatedAt?.toISOString() ?? null, createdAt: undefined, updatedAt: undefined }))} canEdit={can(principal, 'ws.admin')} />
    </>
  );
}
