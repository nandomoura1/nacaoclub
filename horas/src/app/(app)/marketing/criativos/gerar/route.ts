import { can } from '@/server/auth/authz';
import { getPrincipal } from '@/server/auth/session';
import { normalizeNoticeArt, type NoticeArtInput } from '@/domain/marketing/notice-art';
import { renderNoticeArt } from '@/server/marketing/notice-art';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/** POST (multipart: data = JSON do formulário, photo = foto de fundo opcional) → PNG do comunicado. */
export async function POST(req: Request) {
  const principal = await getPrincipal();
  if (!can(principal, 'mkt.view')) return new Response('Sem acesso ao Marketing.', { status: 403 });
  let form: FormData;
  try { form = await req.formData(); } catch { return new Response('Envio inválido.', { status: 400 }); }
  let raw: Partial<NoticeArtInput>;
  try { raw = JSON.parse(String(form.get('data') ?? '{}')); } catch { return new Response('Dados inválidos.', { status: 400 }); }
  const v = normalizeNoticeArt(raw);
  if (!v.ok) return new Response(v.error, { status: 400 });
  const photo = form.get('photo');
  const buf = photo instanceof File && photo.size > 0 ? Buffer.from(await photo.arrayBuffer()) : null;
  if (buf && buf.length > 4.2 * 1024 * 1024) return new Response('A foto de fundo passa de 4 MB.', { status: 400 });
  const png = await renderNoticeArt(v.value, buf);
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } });
}
