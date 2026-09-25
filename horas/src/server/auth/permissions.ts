/**
 * Catálogo de permissões — a fonte da verdade.
 *
 * Permissão responde "o quê". O escopo (área de coordenação) responde "onde"
 * e é resolvido em authz.ts. Papéis são dados no banco; aqui ficam só os
 * papéis de sistema criados pelo seed. Ver docs/01-produto-e-arquitetura.md §4.
 */
export const PERMISSIONS = {
  'area.all': 'Enxerga todas as áreas de coordenação (sem restrição de escopo)',
  'schedule.view': 'Ver a grade semanal',
  'schedule.edit': 'Editar a grade semanal',
  'period.generate': 'Gerar a competência a partir da grade',
  'occurrence.exception': 'Registrar falta, substituição, cancelamento e aula avulsa',
  'leave.manage': 'Registrar férias e afastamentos',
  'hours.manual_entry': 'Lançar horas manualmente (coordenação, reunião, curso)',
  'teacher.view': 'Ver professores',
  'teacher.edit': 'Cadastrar e editar professores',
  'teacher.view_personal': 'Ver dados pessoais (CPF, telefone, e-mail)',
  'payroll.view_hours': 'Ver fechamento de horas e extratos',
  'payroll.approve_area': 'Aprovar as horas da própria área',
  'payroll.adjust': 'Lançar ajuste de competência anterior',
  'payroll.admin_review': 'Conduzir a revisão administrativa',
  'payroll.close': 'Fechar competência',
  'payroll.reopen': 'Reabrir competência fechada',
  'payroll.edit_closed': 'Alterar dados de competência fechada',
  'finance.view': 'Ver valores (Fase 2)',
  'finance.edit_rates': 'Editar tabelas de valor (Fase 2)',
  'admin.catalog': 'Cadastros: modalidades, áreas, espaços, feriados, motivos',
  'admin.users': 'Gerenciar usuários e permissões',
  'audit.view': 'Ver o histórico de alterações',
  'import.run': 'Importar planilhas',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export function isPermissionKey(value: string): value is PermissionKey {
  return Object.hasOwn(PERMISSIONS, value);
}

export const SYSTEM_ROLES: Record<
  'ADMIN' | 'COORDENADOR' | 'CONSULTA' | 'PROFESSOR',
  { name: string; description: string; permissions: PermissionKey[] }
> = {
  ADMIN: {
    name: 'Administrador',
    description: 'Acesso total. Fecha e reabre competências.',
    permissions: PERMISSION_KEYS,
  },
  COORDENADOR: {
    name: 'Coordenador',
    description: 'Opera a escala e aprova as horas das próprias áreas.',
    permissions: [
      'schedule.view',
      'schedule.edit',
      'occurrence.exception',
      'leave.manage',
      'teacher.view',
      'teacher.view_personal',
      'payroll.view_hours',
      'payroll.approve_area',
      'payroll.adjust',
    ],
  },
  CONSULTA: {
    name: 'Consulta (DP / Financeiro)',
    description: 'Leitura do fechamento e dos relatórios de todas as áreas.',
    permissions: ['area.all', 'schedule.view', 'teacher.view', 'payroll.view_hours'],
  },
  PROFESSOR: {
    name: 'Professor',
    description: 'Portal do professor (Fase 2): vê o próprio extrato.',
    permissions: [],
  },
};

export type SystemRoleKey = keyof typeof SYSTEM_ROLES;
