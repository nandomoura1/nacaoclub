import { NextResponse } from 'next/server';
import { checkinsByToken } from '@/server/services/tv-checkin-service';

export const dynamic = 'force-dynamic';

/** GET /tv/:token/checkins → check-ins da aula atual (só "Nome I.", contagem e vagas). A TV consulta a cada ~45 s. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await checkinsByToken(token);
  if (!r) return NextResponse.json({ error: 'tela não encontrada' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}
