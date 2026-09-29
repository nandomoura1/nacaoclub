import type { PermissionKey } from '@/server/auth/permissions';

export type NavIcon =
  | 'hoje' | 'calendario' | 'pendencias' | 'grade' | 'professores'
  | 'fechamento' | 'relatorios' | 'escalas' | 'treinos' | 'treinos-ia' | 'usuarios' | 'historico' | 'cadastros';

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  permission?: PermissionKey;
  /** Etapa em que a tela chega ("E5", "breve"). Itens futuros aparecem desabilitados: o roadmap fica visível. */
  soon?: string;
  /** Atalho na barra inferior do celular (o resto fica no botão Menu). */
  mobile?: boolean;
  /** Rótulo curto para a barra inferior. */
  short?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_HORAS: NavItem[] = [
  { href: '/hoje', label: 'Hoje', icon: 'hoje', mobile: true },
  { href: '/calendario', label: 'Calendário', icon: 'calendario', permission: 'schedule.view', mobile: true },
  { href: '/pendencias', label: 'Pendências', icon: 'pendencias', permission: 'occurrence.exception', soon: 'E5', mobile: true },
  { href: '/grade', label: 'Grade semanal', icon: 'grade', permission: 'schedule.view' },
  { href: '/escalas', label: 'Escalas', icon: 'escalas', permission: 'duty.edit', mobile: true },
  { href: '/professores', label: 'Professores', icon: 'professores', permission: 'teacher.view' },
  { href: '/fechamento', label: 'Fechamento', icon: 'fechamento', permission: 'payroll.view_hours', soon: 'E6', mobile: true },
  { href: '/relatorios', label: 'Relatórios', icon: 'relatorios', permission: 'payroll.view_hours' },
];

export const NAV_TREINOS: NavItem[] = [
  { href: '/treinos', label: 'Cadastro de Treino', short: 'Treinos', icon: 'treinos', permission: 'workout.edit', mobile: true },
  { href: '/treinos/ia', label: 'Geração de Treino IA', icon: 'treinos-ia', permission: 'workout.edit', soon: 'breve' },
];

export const NAV_ADMIN: NavItem[] = [
  { href: '/admin/cadastros', label: 'Cadastros', icon: 'cadastros', permission: 'admin.catalog' },
  { href: '/admin/usuarios', label: 'Usuários', icon: 'usuarios', permission: 'admin.users' },
  { href: '/admin/historico', label: 'Histórico', icon: 'historico', permission: 'audit.view' },
];

/** Menu lateral: uma seção por ferramenta. Seção sem item visível some. */
export const NAV_SECTIONS: NavSection[] = [
  { title: 'Gestão de Horas', items: NAV_HORAS },
  { title: 'Treinos', items: NAV_TREINOS },
  { title: 'Administração', items: NAV_ADMIN },
];
