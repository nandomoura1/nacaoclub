import { NextResponse } from 'next/server';
import { tvTimerByToken } from '@/server/services/tv-service';

export const dynamic = 'force-dynamic';

/** GET /tv/:token/timer → estado do cronômetro + hora do servidor (a TV consulta a cada ~2 s). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await tvTimerByToken(token);
  if (!r) return NextResponse.json({ error: 'tela não encontrada' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}
