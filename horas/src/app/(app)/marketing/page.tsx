import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { commandCenter, mktOptions } from '@/server/services/marketing-service';
import { CommandCenter } from './CommandCenter';

export const metadata: Metadata = { title: 'Marketing' };
// "Atualizar recomendações" chama a IA.
export const maxDuration = 300;

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'mkt.view')) redirect('/hoje');
  const today = todayIso();
  const [v, options] = await Promise.all([commandCenter(principal, today), mktOptions()]);
  return <CommandCenter v={v} options={options} today={today} perms={{ edit: can(principal, 'mkt.edit'), ai: can(principal, 'mkt.ai') }} />;
}
