import { getPrincipal } from '@/server/auth/session';
import { AppError } from '@/server/errors';
import { todayIso } from '@/lib/today';
import { chargeDocs } from '@/server/services/condo-period-service';
import { condoChargesPdf } from '@/server/condominio/pdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** GET /condominio/competencias/AAAA-MM/pdf[?cobranca=id] → documento(s) de cobrança, uma página por parceiro. */
export async function GET(req: Request, { params }: { params: Promise<{ mes: string }> }) {
  try {
    const { mes } = await params;
    const id = new URL(req.url).searchParams.get('cobranca');
    if (id && !/^[0-9a-f-]{36}$/i.test(id)) throw new AppError('Cobrança inválida.');
    const docs = await chargeDocs(await getPrincipal(), mes, id, todayIso());
    const pdf = await condoChargesPdf(docs);
    const name = docs.length === 1 ? `Condominio_${slug(docs[0]!.name)}_${mes}.pdf` : `Condominio_${mes}_todos.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${name}"`, 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    if (e instanceof AppError) return new Response(e.message, { status: e.status });
    throw e;
  }
}
