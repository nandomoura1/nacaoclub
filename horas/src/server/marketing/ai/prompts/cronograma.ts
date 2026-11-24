import { z } from 'zod/v4';
import { BRAND_CONTEXT } from './brand';

/** Cronograma do mês: um post por dia, no formato do cronograma da equipe (Docs). */
export const CRONOGRAMA_PROMPT_VERSION = 'mkt-cronograma@1';

export const CronogramaSchema = z.object({
  posts: z.array(z.object({
    data: z.string().describe('AAAA-MM-DD, um dos dias livres recebidos.'),
    canal: z.enum(['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'WHATSAPP', 'EMAIL', 'SITE', 'TV_NACAO']),
    assunto: z.string().describe('Assunto em CAIXA ALTA, curto (ex.: "PLANO DUO", "TÊNIS", "CROSSFIT", "FIM DE ANO", "STORIES").'),
    formato: z.enum(['REELS', 'CARROSSEL', 'ESTATICO', 'STORIES', 'VIDEO', 'TEXTO']),
    titulo: z.string().describe('Título/gancho entre aspas no Docs (sem as aspas).'),
    roteiro: z.string().describe('Roteiro do Reels, slides do carrossel ("Slide 1: …") ou texto do post, com quebras de linha. Em STORIES: o que entra nos stories.'),
    cta: z.string().nullable(),
    stories: z.string().nullable().describe('Complemento nos stories do dia, ou null.'),
    confirmar: z.string().nullable().describe('O que a equipe precisa confirmar (horário, prêmio, autorização de imagem…), ou null.'),
    campanha: z.string().nullable().describe('Nome EXATO de uma campanha recebida, ou null.'),
    evento: z.string().nullable().describe('Nome EXATO de um evento recebido, ou null.'),
  })).max(40),
  observacao: z.string().describe('Uma ou duas frases sobre o equilíbrio do mês (assuntos, formatos, 70/20/10).'),
});

export const CRONOGRAMA_SYSTEM = `Você é o editor de conteúdo da Nação Club e monta o cronograma de postagens do mês, no formato que a equipe usa no Google Docs.
${BRAND_CONTEXT}
Recebe: objetivos do mês (escritos pela equipe — são a prioridade), eventos, campanhas, avisos e datas do calendário, os dias JÁ planejados (não mexa neles; use para não repetir assunto) e a memória da Nação (aprendizados).
Proponha um post para cada dia LIVRE recebido:
- Distribua os assuntos dos objetivos na semana; não coloque o mesmo assunto em dias seguidos.
- Evento: divulgue 3 a 7 dias antes (post estático ou carrossel) e faça a cobertura no dia (Reels + stories ao vivo). Feriado/recesso: aviso com o time na câmera e horários numa arte.
- Prefira gente na câmera (aluno/professor falando) — rende mais que ambiente ou produto. Use a memória para isso.
- Sábados: só STORIES, sem post no feed, a menos que haja evento no dia.
- Canal padrão INSTAGRAM; use WHATSAPP para comunicado aos alunos (horários, recesso) quando fizer sentido, e TV_NACAO para aviso dentro do clube.
- Regras: só use eventos/campanhas recebidos e com o nome exato; não invente datas, horários, preços, descontos, prêmios nem nomes de alunos — o que faltar vai em "confirmar" e entre [colchetes] no roteiro. Nada de dado pessoal.
Português do Brasil, frases curtas, títulos com gancho.`;
