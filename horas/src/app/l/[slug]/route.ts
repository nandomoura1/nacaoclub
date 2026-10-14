import { NextResponse } from 'next/server';
import { todayIso } from '@/lib/today';
import { clickLink } from '@/server/services/mkt-leads-service';

/** Link rastreável público: conta o clique e redireciona para o destino com UTM. */
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const to = await clickLink(slug.toLowerCase(), todayIso()).catch(() => null);
  return NextResponse.redirect(to ?? new URL('/', req.url), 302);
}
