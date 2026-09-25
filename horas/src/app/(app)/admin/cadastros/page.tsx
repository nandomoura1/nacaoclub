import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { catalogOptions, listCatalog } from '@/server/services/catalog-service';
import { HOLIDAY_POLICIES, HOLIDAY_SCOPES, listHolidays } from '@/server/services/holiday-service';
import { CATALOGS, CATALOG_KEYS, isCatalogKey } from '@/shared/catalogs';
import { CatalogClient } from './CatalogClient';
import { HolidaysClient } from './HolidaysClient';

export const metadata: Metadata = { title: 'Cadastros' };

const TABS = [...CATALOG_KEYS.map((k) => ({ key: k, title: CATALOGS[k].title })), { key: 'feriados', title: 'Feriados' }];

export default async function CadastrosPage({ searchParams }: { searchParams: Promise<{ c?: string; ano?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'admin.catalog')) redirect('/hoje');
  const sp = await searchParams;
  const current = sp.c === 'feriados' || (sp.c && isCatalogKey(sp.c)) ? sp.c : 'modalidades';

  return (
    <>
      <PageHeader title="Cadastros" description="Tudo parametrizável: nenhuma modalidade, área ou motivo está preso no código." />
      <nav className="-mx-4 mb-6 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Cadastros">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/cadastros?c=${t.key}`}
            className={cn(
              'whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold',
              current === t.key ? 'bg-navy text-white' : 'bg-white text-tinta-suave ring-1 ring-borda hover:text-tinta',
            )}
          >
            {t.title}
          </Link>
        ))}
      </nav>
      {current === 'feriados' ? (
        <Holidays year={Number(sp.ano) || new Date().getFullYear()} />
      ) : (
        <Catalog catalogKey={current as (typeof CATALOG_KEYS)[number]} />
      )}
    </>
  );

  async function Catalog({ catalogKey }: { catalogKey: (typeof CATALOG_KEYS)[number] }) {
    const [rows, options] = await Promise.all([listCatalog(principal, catalogKey), catalogOptions(principal)]);
    return <CatalogClient def={CATALOGS[catalogKey]} rows={JSON.parse(JSON.stringify(rows))} options={options} />;
  }

  async function Holidays({ year }: { year: number }) {
    const rows = await listHolidays(principal, year);
    return (
      <HolidaysClient
        year={year}
        rows={rows.map((h) => ({ id: h.id, date: h.date, name: h.name, scope: h.scope, policy: h.policy }))}
        policies={HOLIDAY_POLICIES.map((p) => ({ ...p }))}
        scopes={HOLIDAY_SCOPES.map((s) => ({ ...s }))}
      />
    );
  }
}
