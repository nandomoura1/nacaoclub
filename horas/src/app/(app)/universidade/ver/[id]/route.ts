import { NextResponse } from 'next/server';
import { getPrincipal } from '@/server/auth/session';
import { AppError } from '@/server/errors';
import { eduFileForView } from '@/server/services/edu-service';
import { fakeGet, signedReadUrls, storageConfig } from '@/server/storage';

/**
 * Abre um arquivo da Universidade (feito para HTML enviado pela equipe).
 * Segurança: o HTML roda em "sandbox" sem a mesma origem do sistema — scripts
 * da página funcionam, mas ela não acessa a sessão, os cookies nem o resto do app.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const f = await eduFileForView(await getPrincipal(), id);
    const cfg = storageConfig();
    let body: ArrayBuffer;
    if (cfg.fake) body = new Uint8Array(await fakeGet(f.path)).buffer as ArrayBuffer;
    else {
      const url = (await signedReadUrls([f.path]))[f.path];
      const res = url ? await fetch(url, { cache: 'no-store' }) : null;
      if (!res?.ok) return new NextResponse('Arquivo não encontrado no armazenamento.', { status: 404 });
      body = await res.arrayBuffer();
    }
    const html = f.mime === 'text/html';
    return new NextResponse(body, {
      headers: {
        'Content-Type': html ? 'text/html; charset=utf-8' : f.mime,
        'Content-Disposition': `inline; filename="${encodeURIComponent(f.fileName)}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
        ...(html ? { 'Content-Security-Policy': 'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals allow-presentation allow-downloads' } : {}),
      },
    });
  } catch (e) {
    if (e instanceof AppError) return new NextResponse(e.message, { status: 404 });
    throw e;
  }
}
