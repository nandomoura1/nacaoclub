import { NextResponse, type NextRequest } from 'next/server';
import { getPrincipal } from '@/server/auth/session';
import { can } from '@/server/auth/authz';
import { assetMime } from '@/domain/marketing/assets';
import { eduMime } from '@/domain/universidade';
import { fakeGet, fakePut } from '@/server/storage';

/** Armazenamento local para dev/testes (STORAGE_FAKE=1). Em produção responde 404. */
const off = () => process.env.STORAGE_FAKE !== '1';

export async function PUT(req: NextRequest) {
  if (off()) return new NextResponse(null, { status: 404 });
  const p = await getPrincipal();
  if (!can(p, 'mkt.edit') && !can(p, 'edu.edit')) return new NextResponse(null, { status: 403 });
  const path = req.nextUrl.searchParams.get('path') ?? '';
  await fakePut(path, Buffer.from(await req.arrayBuffer()));
  return NextResponse.json({ Key: path });
}

export async function GET(req: NextRequest) {
  if (off()) return new NextResponse(null, { status: 404 });
  const p = await getPrincipal();
  if (!can(p, 'mkt.view') && !can(p, 'edu.view')) return new NextResponse(null, { status: 403 });
  const path = req.nextUrl.searchParams.get('path') ?? '';
  const dl = req.nextUrl.searchParams.get('download');
  try {
    const data = await fakeGet(path);
    return new NextResponse(new Uint8Array(data), { headers: { 'Content-Type': assetMime(path) ?? eduMime(path) ?? 'application/octet-stream', ...(dl ? { 'Content-Disposition': `attachment; filename="${dl.replace(/"/g, '')}"` } : {}) } });
  } catch { return new NextResponse(null, { status: 404 }); }
}
