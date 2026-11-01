import { EquipeManager } from '@/components/admin/EquipeManager';
import { EventErrorScreen } from '@/components/EventErrorScreen';
import { emailDeQuemEstaLogado, listarEquipe, type Colaborador } from '@/services/equipe-service';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Colaboradores' };

export default async function AdminEquipePage() {
  let equipe: Colaborador[];
  let meuEmail: string | null;

  try {
    [equipe, meuEmail] = await Promise.all([listarEquipe(), emailDeQuemEstaLogado()]);
  } catch (error) {
    return <EventErrorScreen message={error instanceof Error ? error.message : ''} />;
  }

  return <EquipeManager equipe={equipe} meuEmail={meuEmail} />;
}
