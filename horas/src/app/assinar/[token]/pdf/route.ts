import { signerPdf } from '@/server/services/contract-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /assinar/:token/pdf → contrato assinado (se concluído) ou a minuta para leitura. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const pdf = await signerPdf(token);
  if (!pdf) return new Response('Link inválido ou contrato indisponível.', { status: 404 });
  return new Response(new Uint8Array(pdf.bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${pdf.fileName}"`,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
