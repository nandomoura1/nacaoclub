import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/session';
import { TurnstileService } from '@/server/services/turnstile-service';
import { DashboardClient } from './DashboardClient';

export const dynamic = 'force-dynamic';

/**
 * Casca do dashboard, renderizada no servidor.
 *
 * A catraca padrão do usuário (seção 8) é resolvida AQUI, antes do primeiro
 * pixel: o professor abre o sistema e já está na catraca dele, sem clique.
 */
export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const turnstiles = await TurnstileService.listVisible(user);

  // Padrão do usuário, se ainda visível. Senão, "Todas" para quem pode ver
  // várias, ou a única catraca disponível para quem só tem uma.
  const padraoVisivel =
    user.defaultTurnstileId && turnstiles.some((t) => t.id === user.defaultTurnstileId)
      ? user.defaultTurnstileId
      : turnstiles.length === 1
        ? turnstiles[0]!.id
        : null;

  return (
    <DashboardClient
      usuario={{ id: user.id, nome: user.name, papel: user.role }}
      catracaInicial={padraoVisivel}
      catracas={turnstiles.map((t) => ({ id: t.id, name: t.name, location: t.location }))}
    />
  );
}
