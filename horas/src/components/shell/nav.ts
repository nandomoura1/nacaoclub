import type { PermissionKey } from '@/server/auth/permissions';

export type NavIcon =
  | 'hoje' | 'calendario' | 'pendencias' | 'grade' | 'professores'
  | 'fechamento' | 'relatorios' | 'usuarios' | 'historico' | 'cadastros';

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  permission?: PermissionKey;
  /** Etapa em que a tela chega. Itens futuros aparecem desabilitados: o roadmap fica visível. */
  soon?: string;
  mobile?: boolean;
}

export const NAV_MAIN: NavItem[] = [
  { href: '/hoje', label: 'Hoje', icon: 'hoje', mobile: true },
  { href: '/calendario', label: 'Calendário', icon: 'calendario', permission: 'schedule.view', soon: 'E4', mobile: true },
  { href: '/pendencias', label: 'Pendências', icon: 'pendencias', permission: 'occurrence.exception', soon: 'E5', mobile: true },
  { href: '/grade', label: 'Grade semanal', icon: 'grade', permission: 'schedule.view', soon: 'E3' },
  { href: '/professores', label: 'Professores', icon: 'professores', permission: 'teacher.view' },
  { href: '/fechamento', label: 'Fechamento', icon: 'fechamento', permission: 'payroll.view_hours', soon: 'E6', mobile: true },
  { href: '/relatorios', label: 'Relatórios', icon: 'relatorios', permission: 'payroll.view_hours', soon: 'E7' },
];

export const NAV_ADMIN: NavItem[] = [
  { href: '/admin/cadastros', label: 'Cadastros', icon: 'cadastros', permission: 'admin.catalog' },
  { href: '/admin/usuarios', label: 'Usuários', icon: 'usuarios', permission: 'admin.users' },
  { href: '/admin/historico', label: 'Histórico', icon: 'historico', permission: 'audit.view' },
];
