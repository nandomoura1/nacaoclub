import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { NAV_ADMIN, NAV_MAIN, type NavItem } from '@/components/shell/nav';
import { SYSTEM_ROLES, type SystemRoleKey } from '@/server/auth/permissions';
import { getPrincipal } from '@/server/auth/session';
import type { Principal } from '@/server/auth/principal';

function visible(items: NavItem[], p: Principal) {
  return items.filter((i) => !i.permission || p.permissions.has(i.permission));
}

function roleLabel(p: Principal): string {
  const key = p.roleKeys.find((k): k is SystemRoleKey => k in SYSTEM_ROLES);
  return key ? SYSTEM_ROLES[key].name : (p.roleKeys[0] ?? 'Usuário');
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const principal = await getPrincipal();
  if (!principal) redirect('/login');

  // Senha provisória: troca obrigatória antes de qualquer outra tela.
  const path = (await headers()).get('x-pathname') ?? '';
  if (principal.mustChangePassword && path !== '/conta/senha') redirect('/conta/senha');

  return (
    <AppShell
      user={{ name: principal.name, roleLabel: roleLabel(principal) }}
      main={visible(NAV_MAIN, principal)}
      admin={visible(NAV_ADMIN, principal)}
    >
      {children}
    </AppShell>
  );
}
