import { NextResponse, type NextRequest } from 'next/server';
import { getSnapshot } from '@/services/leaderboard-service';
import { buildLeaderboard } from '@/lib/scoring/build';
import { ADMIN_STATUSES, PUBLIC_STATUSES } from '@/lib/scoring/eligibility';
import { buildExportRows, toCsv } from '@/services/export-service';

export const dynamic = 'force-dynamic';

/**
 * Exportação (§42): /api/export?format=csv|json&incluir=rascunhos
 *
 * Só devolve rascunho para quem tem permissão de ver rascunho — a consulta
 * passa pelo RLS com a sessão de quem pediu, então o público jamais recebe
 * resultado não homologado, mesmo chamando a URL na mão.
 */
export async function GET(request: NextRequest) {
  try {
    const formato = request.nextUrl.searchParams.get('format') ?? 'csv';
    const incluirRascunhos = request.nextUrl.searchParams.get('incluir') === 'rascunhos';

    const snapshot = await getSnapshot();
    const board = buildLeaderboard(
      {
        teams: snapshot.teams,
        wod1: snapshot.wod1,
        wod2: snapshot.wod2,
        wod3: snapshot.wod3,
        settings: snapshot.settings,
      },
      { statuses: incluirRascunhos ? ADMIN_STATUSES : PUBLIC_STATUSES },
    );

    const rows = buildExportRows(board);
    const data = new Date().toISOString().slice(0, 10);
    const base = `nacao-athx-resultados-${data}`;

    if (formato === 'json') {
      return NextResponse.json(
        {
          evento: snapshot.event.name,
          data: snapshot.event.date,
          exportadoEm: new Date().toISOString(),
          inclui: incluirRascunhos ? 'rascunhos e publicados' : 'somente publicados',
          resultados: rows,
        },
        {
          headers: {
            'Content-Disposition': `attachment; filename="${base}.json"`,
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    return new NextResponse(toCsv(rows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${base}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao exportar';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
