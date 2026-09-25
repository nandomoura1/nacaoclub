import type { Metadata } from 'next';
import { Card, PageHeader } from '@/components/ui/card';
import { requirePrincipal } from '@/server/auth/session';
import { PasswordForm } from './PasswordForm';

export const metadata: Metadata = { title: 'Trocar senha' };

export default async function SenhaPage() {
  const principal = await requirePrincipal();
  return (
    <>
      <PageHeader
        title="Trocar senha"
        description={
          principal.mustChangePassword
            ? 'Você entrou com uma senha provisória. Crie a sua para continuar.'
            : 'Mínimo de 8 caracteres.'
        }
      />
      <Card className="max-w-md p-6">
        <PasswordForm forced={principal.mustChangePassword} />
      </Card>
    </>
  );
}
