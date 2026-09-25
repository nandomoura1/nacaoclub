/**
 * Cadastros parametrizáveis — configuração declarativa ÚNICA.
 *
 * O servidor lê isto para validar (zod) e gravar; a tela lê para montar
 * tabela e formulário. Serializável de propósito (sem funções).
 */
export type FieldType = 'text' | 'color' | 'number' | 'checkbox' | 'select';

export type OptionSource = 'areas' | 'costCenters' | 'activityKinds';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  min?: number;
  max?: number;
  options?: OptionSource;
  help?: string;
  /** Mostrar como coluna na lista. */
  column?: boolean;
  default?: string | number | boolean;
}

export interface CatalogDef {
  key: CatalogKey;
  title: string;
  singular: string;
  description: string;
  model: CatalogModel;
  fields: FieldDef[];
}

export const CATALOG_KEYS = [
  'modalidades',
  'atividades',
  'espacos',
  'motivos',
  'areas',
  'centros-de-custo',
  'cargos',
  'vinculos',
] as const;
export type CatalogKey = (typeof CATALOG_KEYS)[number];

export type CatalogModel =
  | 'modality'
  | 'activityType'
  | 'space'
  | 'cancellationReason'
  | 'coordinationArea'
  | 'costCenter'
  | 'position'
  | 'contractType';

export const ACTIVITY_KINDS = [
  { value: 'AULA', label: 'Aula' },
  { value: 'PLANTAO', label: 'Plantão' },
  { value: 'COORDENACAO', label: 'Coordenação' },
  { value: 'REUNIAO', label: 'Reunião' },
  { value: 'CURSO', label: 'Curso' },
  { value: 'EVENTO', label: 'Evento' },
  { value: 'PERSONAL', label: 'Personal' },
] as const;

const name = (label = 'Nome'): FieldDef => ({ key: 'name', label, type: 'text', required: true, column: true });
const active: FieldDef = { key: 'active', label: 'Ativo', type: 'checkbox', default: true, column: true };

export const CATALOGS: Record<CatalogKey, CatalogDef> = {
  modalidades: {
    key: 'modalidades',
    title: 'Modalidades',
    singular: 'modalidade',
    description: 'Cada modalidade pertence a uma área de coordenação. É isso que define quem enxerga o quê.',
    model: 'modality',
    fields: [
      name(),
      { key: 'areaId', label: 'Área de coordenação', type: 'select', options: 'areas', required: true, column: true },
      { key: 'defaultDurationMin', label: 'Duração padrão (min)', type: 'number', min: 5, max: 600, default: 60, column: true, help: 'Sugestão ao criar aula. Mobilidade = 30.' },
      { key: 'color', label: 'Cor', type: 'color', default: '#0169E9', column: true },
      { key: 'costCenterId', label: 'Centro de custo', type: 'select', options: 'costCenters' },
      { key: 'requiresConfirmation', label: 'Exige confirmação manual da aula', type: 'checkbox', default: false, help: 'Desligado = aula sem exceção conta como dada (gestão por exceção).' },
      active,
    ],
  },
  atividades: {
    key: 'atividades',
    title: 'Tipos de atividade',
    singular: 'tipo de atividade',
    description: 'Aula, plantão, coordenação, reunião, personal… cada tipo diz se conta hora.',
    model: 'activityType',
    fields: [
      name(),
      { key: 'kind', label: 'Natureza', type: 'select', options: 'activityKinds', required: true, column: true },
      { key: 'countsHours', label: 'Conta hora para o professor', type: 'checkbox', default: true, column: true, help: 'Personal: desligado (só controle de espaço).' },
      active,
    ],
  },
  espacos: {
    key: 'espacos',
    title: 'Espaços',
    singular: 'espaço',
    description: 'Salas, quadras e boxes onde as atividades acontecem.',
    model: 'space',
    fields: [name(), active],
  },
  motivos: {
    key: 'motivos',
    title: 'Motivos de cancelamento',
    singular: 'motivo',
    description: 'Todo cancelamento exige um motivo. A ordem define o que aparece primeiro.',
    model: 'cancellationReason',
    fields: [
      name(),
      { key: 'countsTeacherHours', label: 'O professor recebe a hora mesmo assim', type: 'checkbox', default: false, column: true },
      { key: 'requiresNote', label: 'Exige observação', type: 'checkbox', default: false, column: true },
      active,
    ],
  },
  areas: {
    key: 'areas',
    title: 'Áreas de coordenação',
    singular: 'área',
    description: 'O escopo dos coordenadores. Atribua pessoas às áreas em Usuários.',
    model: 'coordinationArea',
    fields: [name(), { key: 'color', label: 'Cor', type: 'color', default: '#0169E9', column: true }, active],
  },
  'centros-de-custo': {
    key: 'centros-de-custo',
    title: 'Centros de custo',
    singular: 'centro de custo',
    description: 'Para saber quanto de hora-aula cada centro consome.',
    model: 'costCenter',
    fields: [{ key: 'code', label: 'Código', type: 'text', column: true }, name(), active],
  },
  cargos: {
    key: 'cargos',
    title: 'Cargos',
    singular: 'cargo',
    description: 'Professor, instrutor, estagiário, coordenador…',
    model: 'position',
    fields: [name(), active],
  },
  vinculos: {
    key: 'vinculos',
    title: 'Tipos de vínculo',
    singular: 'tipo de vínculo',
    description: 'CLT, MEI/PJ, estágio, horista, bolsista…',
    model: 'contractType',
    fields: [name(), active],
  },
};

export function isCatalogKey(value: string): value is CatalogKey {
  return (CATALOG_KEYS as readonly string[]).includes(value);
}
