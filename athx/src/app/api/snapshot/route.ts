import { NextResponse } from 'next/server';
import { getSnapshot } from '@/services/leaderboard-service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Estado completo do evento em JSON.
 *
 * É o que o cliente busca quando o Realtime avisa que algo mudou. São 20
 * duplas: o payload é pequeno e uma consulta só evita N idas ao banco a
 * cada evento (§34).
 */
export async function GET() {
  try {
    const snapshot = await getSnapshot();
    return NextResponse.json(snapshot, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao carregar o evento';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
