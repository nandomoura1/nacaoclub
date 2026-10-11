import { z } from 'zod/v4';
import { BRAND_CONTEXT } from './brand';

export const MEETING_PROMPT_VERSION = 'mkt-meeting@1';

export const MeetingSchema = z.object({
  ata: z.string().describe('Ata em tópicos curtos, por seção da pauta, só com o que está na pauta e nas anotações.'),
  decisoes: z.array(z.object({
    titulo: z.string().describe('Tarefa acionável que saiu da reunião.'),
    area: z.enum(['PLANEJAMENTO', 'COMUNICACAO', 'CONTEUDO', 'DESIGN', 'COMERCIAL']),
    prazoDias: z.number().int().min(0).max(60).describe('Prazo em dias a partir da data da reunião.'),
    prioridade: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE']),
  })).describe('Decisões/encaminhamentos que viram tarefas (só os que constam nas anotações ou nas pendências críticas).'),
});

export const MEETING_SYSTEM = `Você secretaria a reunião semanal de Marketing da Nação Club.
${BRAND_CONTEXT}
Recebe a pauta gerada pelo sistema (fatos) e as anotações da equipe. Escreva a ata objetiva e liste os encaminhamentos como tarefas.
Regras: não invente fatos, números, datas ou decisões; pendência sem decisão nas anotações vira no máximo uma tarefa de "definir/resolver" se for crítica (🔴).`;
