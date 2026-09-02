import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/session';
import { PerfilCliente } from './PerfilCliente';

export const dynamic = 'force-dynamic';

export default async function PerfilAlunoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { id } = await params;
  return <PerfilCliente studentId={id} usuarioId={user.id} papel={user.role} />;
}
