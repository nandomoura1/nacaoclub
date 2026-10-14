import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { AppError } from '@/server/errors';

/**
 * Arquivos no Supabase Storage (bucket privado). O navegador envia direto ao
 * Supabase por URL assinada (sem passar pelo limite de 4,5 MB da Vercel) e lê
 * por URL assinada de curta duração. A chave service_role fica só no servidor.
 *
 * STORAGE_FAKE=1 (dev/testes): grava numa pasta temporária, servida por
 * /api/dev-storage.
 */
export const BUCKET = 'marketing';

export function storageConfig() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '') ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
  const fake = process.env.STORAGE_FAKE === '1';
  return { url, key, fake, configured: fake || Boolean(url && key) };
}

export const FAKE_DIR = join(tmpdir(), 'nacao-storage');
export function fakeFile(path: string): string {
  const p = normalize(join(FAKE_DIR, BUCKET, path));
  if (!p.startsWith(join(FAKE_DIR, BUCKET))) throw new AppError('Caminho inválido.');
  return p;
}

function cfg() {
  const c = storageConfig();
  if (!c.configured) throw new AppError('Armazenamento de arquivos não configurado (Marketing → Integrações → Arquivos).');
  return c;
}

async function call<T>(method: string, route: string, body?: unknown): Promise<T> {
  const c = cfg();
  const res = await fetch(`${c.url}/storage/v1${route}`, {
    method,
    headers: { Authorization: `Bearer ${c.key}`, apikey: c.key, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('[storage]', method, route.replace(/\?.*/, ''), res.status, text.slice(0, 200));
    throw new AppError(res.status === 404 ? 'Arquivo não encontrado no armazenamento.' : 'O armazenamento de arquivos não respondeu. Tente de novo.');
  }
  return (text ? JSON.parse(text) : null) as T;
}

/** URL para o navegador enviar o arquivo (PUT, válida por 2 horas). */
export async function signedUploadUrl(path: string): Promise<string> {
  const c = cfg();
  if (c.fake) return `/api/dev-storage?path=${encodeURIComponent(path)}`;
  const r = await call<{ url: string }>('POST', `/object/upload/sign/${BUCKET}/${path}`, {});
  return `${c.url}/storage/v1${r.url}`;
}

/** Tamanho real do arquivo enviado (null = não existe). */
export async function objectSize(path: string): Promise<number | null> {
  const c = cfg();
  if (c.fake) { try { return (await stat(fakeFile(path))).size; } catch { return null; } }
  const slash = path.lastIndexOf('/');
  const r = await call<{ name: string; metadata?: { size?: number } }[]>('POST', `/object/list/${BUCKET}`, { prefix: path.slice(0, slash), search: path.slice(slash + 1), limit: 5 });
  const hit = r.find((o) => o.name === path.slice(slash + 1));
  return hit ? hit.metadata?.size ?? 0 : null;
}

/** URLs de leitura (1 hora). `download` força baixar com esse nome. */
export async function signedReadUrls(paths: string[], opts: { download?: Record<string, string> } = {}): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const c = cfg();
  const dl = (p: string) => (opts.download?.[p] ? `&download=${encodeURIComponent(opts.download[p])}` : '');
  if (c.fake) return Object.fromEntries(paths.map((p) => [p, `/api/dev-storage?path=${encodeURIComponent(p)}${dl(p)}`]));
  const out: Record<string, string> = {};
  for (let i = 0; i < paths.length; i += 100) {
    const r = await call<{ path: string | null; signedURL: string | null }[]>('POST', `/object/sign/${BUCKET}`, { expiresIn: 3600, paths: paths.slice(i, i + 100) });
    for (const x of r) if (x.path && x.signedURL) out[x.path] = `${c.url}/storage/v1${x.signedURL}${dl(x.path)}`;
  }
  return out;
}

export async function removeObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const c = cfg();
  if (c.fake) { for (const p of paths) await rm(fakeFile(p), { force: true }); return; }
  await call('DELETE', `/object/${BUCKET}`, { prefixes: paths });
}

// ── Modo fake (dev/testes) ──
export async function fakePut(path: string, data: Buffer) { const f = fakeFile(path); await mkdir(dirname(f), { recursive: true }); await writeFile(f, data); }
export async function fakeGet(path: string) { return readFile(fakeFile(path)); }
