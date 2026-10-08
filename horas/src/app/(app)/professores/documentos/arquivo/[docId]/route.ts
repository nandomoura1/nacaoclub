import { getPrincipal } from '@/server/auth/session';
import { AppError } from '@/server/errors';
import { getTeacherDocFile } from '@/server/services/staff-doc-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Tipo pela extensão (nunca o declarado no envio): só PDF e foto abrem no navegador.
const INLINE: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

/** GET /professores/documentos/arquivo/:id → o arquivo como foi enviado (só com "teacher.docs"). */
export async function GET(_req: Request, { params }: { params: Promise<{ docId: string }> }) {
  try {
    const { docId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(docId)) throw new AppError('Documento inválido.');
    const f = await getTeacherDocFile(await getPrincipal(), docId);
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
