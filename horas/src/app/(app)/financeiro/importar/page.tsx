import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { finHistory, listCategories, listFinPeriods } from '@/server/services/fin-service';
import { ImportClient } from './ImportClient';

export const metadata: Metadata = { title: 'Importar relatórios antigos' };
// A leitura do relatório chama a IA.
export const maxDuration = 300;

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'fin.import')) redirect('/financeiro');
  const [periods, history, cats] = await Promise.all([listFinPeriods(principal), finHistory(principal), listCategories()]);
  return (
    <>
      <PageHeader title="Importar relatórios antigos" description="Envie um relatório financeiro já pronto (PDF, XLSX, DOCX…). O sistema lê, mostra o que encontrou para você conferir e só grava depois da sua confirmação. Nada é sobrescrito." />
      <ImportClient
        periods={periods.map((p) => ({ month: p.month, status: p.status, version: p.version }))}
        approved={Object.fromEntries(history.map((h) => [h.month, h.m]))}
        categories={cats.map((c) => ({ key: c.key, label: c.label, kind: c.kind, active: c.active }))}
        canApprove={can(principal, 'fin.approve')} />
    </>
  );
}
