import { getPrincipal } from '@/server/auth/session';
import { AppError } from '@/server/errors';
import { gradeTemplate } from '@/server/services/import-service';

export const dynamic = 'force-dynamic';

/** GET /grade/modelo (em branco) ou /grade/modelo?espelho=1 (grade vigente). */
export async function GET(req: Request) {
  const mirror = new URL(req.url).searchParams.get('espelho') === '1';
  try {
    const { fileName, buffer } = await gradeTemplate(await getPrincipal(), mirror);
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    if (e instanceof AppError) return new Response(e.message, { status: e.status ?? 403 });
    throw e;
  }
}
