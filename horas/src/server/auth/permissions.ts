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
  'teacher.docs': 'Documentos da equipe: ver e enviar identidade, CREF e contratos',
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
  'company.view': 'Empresas: ver dados gerais, contas bancárias e documentos',
  'company.edit': 'Empresas: cadastrar dados e enviar/arquivar documentos',
  'mkt.view': 'Marketing: ver Command Center, calendário, campanhas e Kanban',
  'mkt.edit': 'Marketing: criar e editar campanhas, eventos e tarefas',
  'mkt.approve': 'Marketing: aprovar campanhas (programar/ativar)',
  'mkt.ai': 'Marketing: usar a IA (sugerir tarefas, ata, recomendações)',
  'mkt.admin': 'Marketing: áreas e responsáveis padrão',
  'audit.view': 'Ver o histórico de alterações',
  'import.run': 'Importar planilhas',
  'workout.edit': 'Lançar treinos da semana e gerar a arte de divulgação',
  'duty.edit': 'Lançar escalas de fim de semana e feriados',
  'hours.own': 'Ver o próprio extrato de horas (usuário vinculado a um professor)',
  'workout.view': 'Ver os treinos lançados no Cadastro de Treino',
  'workout.personal': 'Criar treinos de Personal para as próprias aulas',
  'condo.view': 'Condomínio: ver painel, competências e cobranças',
  'condo.edit': 'Condomínio: lançar a competência e os cadastros',
  'condo.close': 'Condomínio: fechar e reabrir competências',
  'condo.payments': 'Condomínio: marcar cobranças como enviadas e pagas',
  'fin.view': 'Financeiro: ver relatórios, histórico e painel',
  'fin.import': 'Financeiro: enviar documentos e importar relatórios antigos',
  'fin.edit': 'Financeiro: conferir e corrigir os dados extraídos',
  'fin.approve': 'Financeiro: aprovar a competência (gera uma versão)',
  'fin.export': 'Financeiro: imprimir/exportar relatórios',
  'fin.admin': 'Financeiro: metas, limites e categorias',
  'whatsapp.send': 'WhatsApp: enviar mensagens pelo sistema (Z-API)',
  'whatsapp.admin': 'WhatsApp: ver a conexão, testar e consultar o registro de envios',
  'proc.view': 'Gestão de Processos: ver o painel e as demandas dos setores que lidera',
  'proc.edit': 'Gestão de Processos: atualizar e comentar as demandas dos próprios setores e abrir novas nelas',
  'proc.admin': 'Gestão de Processos: ver todos os setores, cobrar demandas de qualquer setor e definir setores e líderes',
  'edu.view': 'Universidade Nação: ver materiais e trilhas de capacitação e marcar como concluído',
  'edu.edit': 'Universidade Nação: publicar e editar materiais e trilhas, ver quem concluiu (diretoria e líderes)',
  'edu.admin': 'Universidade Nação: editar e excluir qualquer material e trilha',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export function isPermissionKey(value: string): value is PermissionKey {
  return Object.hasOwn(PERMISSIONS, value);
}

export const SYSTEM_ROLES: Record<
  'ADMIN' | 'COORDENADOR' | 'CONSULTA' | 'PROFESSOR' | 'MARKETING' | 'LIDER',
  { name: string; description: string; permissions: PermissionKey[] }
> = {
  ADMIN: {
    name: 'Administrador',
    description: 'Acesso total. Fecha e reabre competências.',
    // "Meu extrato" é do perfil Professor; o admin vê o extrato de todos na ficha e nos relatórios.
    permissions: PERMISSION_KEYS.filter((k) => k !== 'hours.own'),
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
      'workout.edit',
      'workout.view',
      'workout.personal',
      'duty.edit',
      'whatsapp.send',
      'edu.view',
    ],
  },
  CONSULTA: {
    name: 'DP / Financeiro',
    description: 'Departamento Pessoal e Financeiro com acesso pleno: horas e fechamento, professores e documentos, Relatório Financeiro, Condomínio (competências e boletos) e Empresas. Não administra usuários, grade nem marketing.',
    permissions: [
      'area.all',
      // Gestão de Horas (DP): lançar, corrigir, aprovar, fechar e reabrir.
      'schedule.view', 'period.generate', 'occurrence.exception', 'leave.manage', 'hours.manual_entry',
      'teacher.view', 'teacher.edit', 'teacher.view_personal', 'teacher.docs',
      'payroll.view_hours', 'payroll.approve_area', 'payroll.adjust', 'payroll.admin_review', 'payroll.close', 'payroll.reopen', 'payroll.edit_closed',
      'finance.view', 'finance.edit_rates', 'import.run',
      // Relatório Financeiro completo.
      'fin.view', 'fin.import', 'fin.edit', 'fin.approve', 'fin.export', 'fin.admin',
      // Condomínio: competências, cadastros, boletos, fechamento e pagamentos.
      'condo.view', 'condo.edit', 'condo.close', 'condo.payments',
      // Empresas, histórico, envio de cobranças/acessos e demandas do setor.
      'company.view', 'company.edit', 'audit.view', 'whatsapp.send', 'proc.view', 'proc.edit',
      'edu.view',
    ],
  },
  PROFESSOR: {
    name: 'Professor',
    description: 'Vê o próprio extrato de horas e os treinos; cria treinos de Personal para as próprias aulas.',
    permissions: ['hours.own', 'workout.view', 'workout.personal', 'edu.view'],
  },
  MARKETING: {
    name: 'Marketing',
    description: 'Equipe de marketing e comercial: campanhas, eventos, tarefas, calendário e IA de marketing.',
    permissions: ['mkt.view', 'mkt.edit', 'mkt.ai', 'edu.view'],
  },
  LIDER: {
    name: 'Líder de setor',
    description: 'Acompanha e atualiza as demandas do próprio setor (Gestão de Processos), registra atas, publica materiais na Universidade Nação, cadastra colaboradores, cuida dos documentos da equipe (inclusive atestados) e lança faltas, folgas e afastamentos. Combine com o perfil da função.',
    permissions: ['proc.view', 'proc.edit', 'edu.view', 'edu.edit', 'teacher.view', 'teacher.edit', 'teacher.docs', 'schedule.view', 'leave.manage'],
  },
};

export type SystemRoleKey = keyof typeof SYSTEM_ROLES;
