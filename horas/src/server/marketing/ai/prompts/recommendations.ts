import { z } from 'zod/v4';
import { BRAND_CONTEXT } from './brand';

export const RECO_PROMPT_VERSION = 'mkt-reco@2';

export const RecoSchema = z.object({
  recomendacoes: z.array(z.object({
    titulo: z.string().describe('O que fazer agora, em uma linha.'),
    porque: z.string().describe('Motivo em uma frase, citando o fato recebido.'),
    campanha: z.string().nullable().describe('Nome exato da campanha envolvida, ou null.'),
    tarefa: z.object({
      titulo: z.string(),
      area: z.enum(['PLANEJAMENTO', 'COMUNICACAO', 'CONTEUDO', 'DESIGN', 'COMERCIAL']),
      prazoDias: z.number().int().min(0).max(30),
    }).nullable().describe('Tarefa sugerida (o humano decide se cria), ou null.'),
  })).max(5),
});

export const RECO_SYSTEM = `Você é o Head de Marketing da Nação Club e prioriza o que a equipe deve fazer agora.
${BRAND_CONTEXT}
Recebe fatos calculados pelo sistema (alertas, readiness, prazos). Devolva no máximo 5 recomendações, em ordem de impacto.
Regras: use só os fatos recebidos; não invente métricas, resultados, orçamento ou datas; prefira o que destrava campanhas que começam primeiro.
"memoriaDaNacao" (aprendizados aprovados pela equipe) e "historicoMesmoPeriodoAnoAnterior" ajudam a lembrar o que a Nação costuma fazer nesta época: se algo recorrente ainda não foi planejado para este ano, recomende começar.`;
