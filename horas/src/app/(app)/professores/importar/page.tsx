import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { TeacherImportClient } from './TeacherImportClient';

export const metadata: Metadata = { title: 'Importar professores' };
// Gravação em lote: folga para o servidor longe do banco.
export const maxDuration = 60;

export default async function ImportarProfessoresPage() {
  const principal = await requirePrincipal();
  if (!can(principal, 'teacher.edit')) redirect('/professores');
  return (
    <>
      <PageHeader
        title="Importar professores"
        description="Baixe o modelo (ou o espelho do cadastro atual), preencha e envie. Você vê quem entra e o que muda antes de confirmar."
      />
      <TeacherImportClient />
    </>
  );
}
