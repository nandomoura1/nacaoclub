import type { Metadata } from 'next';
import { ProgramPage } from '../../../../_components/ProgramPage';

export const metadata: Metadata = { title: 'Planilha IA · CrossFit' };
// Cada aula gerada pela IA leva até 1–2 minutos.
export const maxDuration = 300;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ProgramPage slug="crossfit" id={(await params).id} />;
}
