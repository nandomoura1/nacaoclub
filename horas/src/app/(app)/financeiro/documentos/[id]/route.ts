import { getPrincipal } from '@/server/auth/session';
import { AppError } from '@/server/errors';
import { getFinDocumentFile } from '@/server/services/fin-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Tipo pela extensão (nunca o declarado no upload): só PDF, imagem raster e texto abrem no navegador.
const INLINE: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', txt: 'text/plain; charset=utf-8', csv: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8' };

/** GET /financeiro/documentos/:id → o arquivo original, como foi enviado. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError('Documento inválido.');
    const f = await getFinDocumentFile(await getPrincipal(), id);
    const type = INLINE[f.filename.split('.').pop()?.toLowerCase() ?? ''];
    return new Response(new Uint8Array(f.data), {
      headers: {
        'Content-Type': type ?? 'application/octet-stream',
        'Content-Disposition': `${type ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    if (e instanceof AppError) return new Response(e.message, { status: e.status });
    throw e;
  }
}
