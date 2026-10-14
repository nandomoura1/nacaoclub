import { z } from 'zod/v4';
import { BRAND_CONTEXT } from './brand';

/** IA Marketing: legendas/roteiros, pauta da semana e leitura da Performance. */

export const COPY_PROMPT_VERSION = 'mkt-copy@1';
export const PAUTA_PROMPT_VERSION = 'mkt-pauta@1';
export const ANALISE_PROMPT_VERSION = 'mkt-analise@1';

const AREA = z.enum(['PLANEJAMENTO', 'COMUNICACAO', 'CONTEUDO', 'DESIGN', 'COMERCIAL']);

export const CopySchema = z.object({
  variacoes: z.array(z.object({
    titulo: z.string().describe('Nome curto da abordagem (ex.: "Comunidade — bastidores").'),
    texto: z.string().describe('Legenda/mensagem pronta para publicar, com quebras de linha e emojis com moderação.'),
    roteiro: z.array(z.string()).describe('Para Reels/Stories/Carrossel: cenas ou telas em ordem ("Cena 1 (0–3s): …"). Vazio nos outros formatos.'),
    cta: z.string().describe('Chamada para ação final.'),
    hashtags: z.array(z.string()).max(8).describe('Sem o #. Use [] para WhatsApp e e-mail.'),
    visual: z.string().describe('Sugestão de imagem/vídeo para o Design.'),
  })).min(1).max(3),
});

export const COPY_SYSTEM = `Você é o redator e roteirista da Nação Club.
${BRAND_CONTEXT}
Escreva para o formato e o pilar pedidos (Comunidade, Autoridade ou Oferta). Português do Brasil, frases curtas, gancho forte na primeira linha.
Regras: use só fatos recebidos (campanha, oferta, datas); não invente preço, desconto, prêmio, nome de pessoa, depoimento ou número. Se faltar algo essencial (ex.: oferta), escreva sem inventar e deixe claro com [colchetes] o que a equipe precisa completar.
Instagram: até ~1.200 caracteres. WhatsApp: direto, com *negrito*, sem hashtags. E-mail: assunto na primeira linha ("Assunto: …").
Devolva 2 ou 3 variações com abordagens diferentes entre si.`;

export const PautaSchema = z.object({
  ideias: z.array(z.object({
    data: z.string().describe('AAAA-MM-DD sugerido para publicar, dentro do período recebido.'),
    formato: z.enum(['FEED', 'CARROSSEL', 'REELS', 'STORIES', 'WHATSAPP', 'TV_NACAO']),
    pilar: z.enum(['COMUNIDADE', 'AUTORIDADE', 'OFERTA']),
    titulo: z.string().describe('Título da pauta.'),
    gancho: z.string().describe('Primeira frase / ideia central.'),
    porque: z.string().describe('Por que agora, citando o evento/campanha/tema recebido.'),
    campanha: z.string().nullable().describe('Nome exato da campanha relacionada, ou null.'),
  })).min(1).max(8),
  observacao: z.string().describe('Uma frase sobre o equilíbrio da semana (70/20/10).'),
});

export const PAUTA_SYSTEM = `Você é o editor de conteúdo da Nação Club e monta a pauta das redes para o período.
${BRAND_CONTEXT}
Recebe o que acontece no período (eventos, campanhas, temas do mês, datas) e a memória da Nação. Proponha de 5 a 8 posts que respeitem a proporção 70% comunidade, 20% autoridade, 10% oferta, distribuídos nos dias.
Regras: só use eventos/campanhas recebidos; não invente datas de eventos nem promoções; quando o período estiver vazio, proponha conteúdo de comunidade e autoridade das modalidades.`;

export const AnaliseSchema = z.object({
  resumo: z.string().describe('2–3 frases sobre o período, citando números recebidos.'),
  funcionou: z.array(z.string()).max(4),
  atencao: z.array(z.string()).max(4),
  acoes: z.array(z.object({
    titulo: z.string(),
    porque: z.string().describe('Cite o número que justifica.'),
    tarefa: z.object({ titulo: z.string(), area: AREA, prazoDias: z.number().int().min(0).max(30) }).nullable(),
  })).max(5),
});

export const ANALISE_SYSTEM = `Você é o Head de Growth da Nação Club e lê o painel de Performance para a reunião semanal.
${BRAND_CONTEXT}
Recebe números agregados (cliques, leads, matrículas, conversão, investimento, custo por matrícula), comparação com o período anterior, funil, origens, campanhas e links.
Regras: use só os números recebidos e cite-os; não invente metas nem benchmarks de mercado; com poucos dados (ex.: menos de 10 leads), diga que a amostra é pequena e foque em ações para gerar dados (ligar campanhas aos leads, lançar gastos, criar links). No máximo 5 ações, em ordem de impacto.`;
