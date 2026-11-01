import { z } from 'zod';
import {
  CATEGORIES,
  TEAM_STATUSES,
  DNF_POLICIES,
  TIE_POINTS_MODES,
  ehTieBreaker,
} from '@/types/domain';
import { DIRECOES, ORIGENS, UNIDADES } from '@/types/wod';

/**
 * Campo numérico do formulário: aceita string com vírgula, número, null ou
 * ausente. Vazio significa "não lançado", não zero — a diferença importa:
 * zero é um resultado, ausente é uma lacuna.
 */
const numeroOpcional = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  });

export const teamSchema = z.object({
  id: z.string().uuid().optional(),
  teamNumber: z.coerce.number().int().min(1, 'Número da dupla é obrigatório').max(999),
  teamName: z.string().trim().min(1, 'Nome da dupla é obrigatório').max(80),
  category: z.enum(CATEGORIES),
  athlete1: z.string().trim().max(80).default(''),
  athlete2: z.string().trim().max(80).default(''),
  // Quantas baterias existem é do evento (event_settings.baterias); aqui só
  // garantimos que é um número de bateria possível.
  battery: z.coerce.number().int().min(1, 'Bateria inválida').max(20, 'Bateria inválida'),
  status: z.enum(TEAM_STATUSES),
});




/** 'NENHUM' ou 'WOD<n>' — a lista de WODs é do evento, não do código. */
const criterioDeDesempate = z
  .string()
  .transform((v) => v.trim().toUpperCase())
  .refine(ehTieBreaker, { message: 'Critério de desempate inválido' });

export const settingsSchema = z.object({
  tiePointsMode: z.enum(TIE_POINTS_MODES),
  dnfPolicy: z.enum(DNF_POLICIES),
  tieBreaker1: criterioDeDesempate,
  tieBreaker2: criterioDeDesempate,
  tieBreaker3: criterioDeDesempate,
  baterias: z.number().int().min(1).max(20),
  // Só volta para o banco como estava; nunca entra no cálculo.
  tieBreakerLegado: z.string().trim().max(600).nullable().optional(),
  liveMode: z.boolean(),
  maintenanceMode: z.boolean(),
});

export type TeamInput = z.input<typeof teamSchema>;
export type SettingsInput = z.input<typeof settingsSchema>;

/* ==========================================================================
   O EVENTO: WODs, PROVAS, AGENDA E LANÇAMENTOS
   ========================================================================== */

const textoCurto = z.string().trim().min(1).max(120);
const textoLongo = z.string().trim().max(2000);
const listaDeTextos = z.array(z.string().trim().min(1).max(500)).max(40);

export const wodSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  numero: z.number().int().min(1).max(99),
  nome: textoCurto,
  formato: z.string().trim().max(60).nullable(),
  capSegundos: z.number().int().min(1).max(36000).nullable(),
  resumo: textoLongo.nullable(),
  permiteCap: z.boolean(),
  regras: listaDeTextos,
  pendencias: listaDeTextos,
  ordem: z.number().int().min(1).max(99),
  blocos: z
    .array(
      z.object({
        ordem: z.number().int().min(1).max(99),
        janela: z.string().trim().max(60),
        movimento: textoCurto,
        detalhe: z.string().trim().max(500).nullable(),
        masculino: z.string().trim().max(60).nullable(),
        feminino: z.string().trim().max(60).nullable(),
      }),
    )
    .max(40),
});

export const provaSchema = z
  .object({
    id: z.string().uuid().nullable().optional(),
    wodId: z.string().uuid(),
    codigo: z
      .string()
      .trim()
      .min(1)
      .max(8)
      .regex(/^[0-9A-Za-z]+$/, { message: 'Use apenas letras e números no código' }),
    descricao: textoCurto,
    criterio: z.string().trim().max(300).nullable(),
    unidade: z.enum(UNIDADES),
    direcao: z.enum(DIRECOES),
    origem: z.enum(ORIGENS),
    porAtleta: z.boolean(),
    componentes: z.array(z.string().trim().min(1).max(8)).max(20),
    pontua: z.boolean(),
    ordem: z.number().int().min(1).max(99),
  })
  // Prova calculada não é digitada, e precisa saber o que somar.
  .refine((p) => p.origem !== 'SOMA' || p.componentes.length > 0, {
    message: 'Escolha ao menos uma prova para somar',
    path: ['componentes'],
  })
  .refine((p) => p.origem !== 'SOMA' || !p.porAtleta, {
    message: 'Prova calculada não é lançada por atleta',
    path: ['porAtleta'],
  })
  .refine((p) => p.origem !== 'DIGITADA' || p.componentes.length === 0, {
    message: 'Prova lançada pelo juiz não soma outras',
    path: ['componentes'],
  });

export const agendaSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  ordem: z.number().int().min(1).max(99),
  hora: z.string().trim().min(1).max(40),
  titulo: textoCurto,
  detalhe: z.string().trim().max(300).nullable(),
  itens: listaDeTextos,
  nota: z.string().trim().max(300).nullable(),
  wodId: z.string().uuid().nullable(),
  bateria: z.number().int().min(1).max(20).nullable(),
  destaque: z.boolean(),
});

/**
 * Uma linha de lançamento: a dupla, se concluiu, e o valor de cada prova
 * digitada daquele WOD.
 *
 * O valor chega como TEXTO porque o campo é um input: "2,41" e "14:32" são
 * convertidos conforme a unidade da prova, do lado do servidor, onde a
 * unidade é conhecida.
 */
export const lancamentoSchema = z.object({
  teamId: z.string().uuid(),
  concluiu: z.boolean(),
  volume: numeroOpcional,
  valores: z.record(
    z.string().uuid(),
    z.object({
      valor: z.string().trim().max(20).nullable(),
      atleta1: z.string().trim().max(20).nullable(),
      atleta2: z.string().trim().max(20).nullable(),
    }),
  ),
});

export type WodInput = z.input<typeof wodSchema>;
export type ProvaInput = z.input<typeof provaSchema>;
export type AgendaInput = z.input<typeof agendaSchema>;
export type LancamentoInput = z.input<typeof lancamentoSchema>;

/* ==========================================================================
   A PLATAFORMA: EVENTOS E COLABORADORES
   ========================================================================== */

/**
 * O endereço do evento. Vira parte da URL (/leaderboard?evento=...), então
 * aceita só o que sobrevive a um link: minúsculas, números e hífen.
 *
 * A mesma regra existe em athx_clonar_evento, no banco. Duplicada de
 * propósito: aqui para a pessoa receber o erro antes de enviar o formulário,
 * lá para ninguém contornar a tela.
 */
export const eventoSchema = z.object({
  nome: z.string().trim().min(3, 'Dê um nome ao evento').max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(60)
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      'Use só letras minúsculas, números e hífen — por exemplo nacao-hibrida-marco',
    ),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data do evento'),
  /** De qual evento copiar as regras. null = começar em branco. */
  copiarDe: z.string().uuid().nullable(),
});

export const colaboradorSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(5)
    .max(160)
    .email('Isso não parece um e-mail'),
  nome: z.string().trim().max(120).nullable(),
});

export type EventoInput = z.input<typeof eventoSchema>;
export type ColaboradorInput = z.input<typeof colaboradorSchema>;

/**
 * Os atletas, como o juiz escreve na súmula.
 *
 * A dupla pode estar inscrita sem os nomes — acontece quando a inscrição é
 * feita às pressas, ou quando alguém troca de parceiro na véspera. O juiz é
 * quem tem a informação correta, com as duas pessoas na frente dele.
 */
export const atletasSchema = z.object({
  teamId: z.string().uuid(),
  athlete1: z.string().trim().max(120),
  athlete2: z.string().trim().max(120),
});

export type AtletasInput = z.input<typeof atletasSchema>;

/**
 * Edição dos dados do próprio evento: nome, data e endereço.
 *
 * Separado de eventoSchema porque criar e editar não pedem a mesma coisa —
 * na criação existe "copiar as regras de", que na edição não faz sentido.
 */
export const edicaoDeEventoSchema = z.object({
  id: z.string().uuid(),
  nome: z.string().trim().min(3, 'Dê um nome ao evento').max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(60)
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      'Use só letras minúsculas, números e hífen — por exemplo nacao-hibrida-marco',
    ),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data do evento'),
});

export type EdicaoDeEventoInput = z.input<typeof edicaoDeEventoSchema>;
