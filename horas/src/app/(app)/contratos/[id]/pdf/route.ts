import { getPrincipal } from '@/server/auth/session';
import { AppError } from '@/server/errors';
import { draftPdf } from '@/server/services/contract-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /contratos/:id/pdf → contrato assinado (se concluído) ou minuta. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const pdf = await draftPdf(await getPrincipal(), id);
    return new Response(new Uint8Array(pdf.bytes), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${pdf.fileName}"`, 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    if (e instanceof AppError) return new Response(e.message, { status: e.status });
    throw e;
  }
}
