import { getCurrentUser } from '@/server/auth/session';
import { allowedTurnstileIds } from '@/server/auth/rbac';
import { subscribe, type RealtimeEvent } from '@/server/realtime/event-bus';
import { startPoller } from '@/server/services/poller-service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * ============================================================
 * REALTIME VIA SERVER-SENT EVENTS (seções 11 e 47)
 * ============================================================
 *
 * Por que SSE e não WebSocket: o fluxo é 100% servidor → cliente. SSE
 * reconecta sozinho, passa por proxy HTTP comum sem upgrade de protocolo e
 * custa uma fração da complexidade operacional. Se um dia houver interação
 * bidirecional, o contrato do event-bus permite trocar o transporte.
 *
 * O filtro de catraca é aplicado AQUI, no servidor. Um professor conectado
 * à catraca do Futevôlei jamais recebe o byte de uma entrada do Tênis —
 * não é a UI que esconde, é o servidor que não envia.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response('Não autenticado', { status: 401 });

  // O primeiro dashboard aberto liga o poller. Evita depender de processo
  // separado no MVP; ver docs/deployment.md para o modo worker dedicado.
  startPoller();

  const url = new URL(request.url);
  const raw = url.searchParams.get('turnstileId');
  const turnstileId = !raw || raw === 'all' ? null : raw;

  const allowed = await allowedTurnstileIds(user);

  if (turnstileId && allowed !== null && !allowed.includes(turnstileId)) {
    return new Response('Sem acesso a esta catraca', { status: 403 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Cliente já desconectou entre o evento e o enqueue. Nada a fazer.
        }
      };

      send('ready', { at: new Date().toISOString(), turnstileId });

      const relevant = (payloadTurnstileId: string | null): boolean => {
        // Filtro escolhido pelo usuário.
        if (turnstileId) return payloadTurnstileId === turnstileId;
        // "Todas" respeitando a permissão: sem restrição vê tudo.
        if (allowed === null) return true;
        // Entrada sem catraca reconhecida não vaza para quem tem acesso restrito.
        return payloadTurnstileId !== null && allowed.includes(payloadTurnstileId);
      };

      unsubscribe = subscribe((event: RealtimeEvent) => {
        if (event.type === 'arrival' && !relevant(event.payload.turnstileId)) return;
        send(event.type, event.payload);
      });

      // Heartbeat: mantém a conexão viva através de proxies com timeout
      // ocioso e alimenta o indicador "Última atualização" na tela.
      heartbeat = setInterval(() => send('heartbeat', { at: new Date().toISOString() }), 25_000);

      request.signal.addEventListener('abort', () => {
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Já fechado.
        }
        logger.debug('Cliente SSE desconectado', { userId: user.id });
      });
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Desliga o buffer do nginx, que senão engole o stream inteiro.
      'X-Accel-Buffering': 'no',
    },
  });
}
