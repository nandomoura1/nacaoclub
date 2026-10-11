import { z } from 'zod/v4';
import { BRAND_CONTEXT } from './brand';

export const MEMORY_PROMPT_VERSION = 'mkt-memory@1';

export const MemorySchema = z.object({
  titulo: z.string().describe('Título curto da memória (ex.: "Calendário recorrente da Nação", "Processo do Marketing 2027").'),
  aprendizados: z.string().describe('Texto em tópicos (markdown simples, até ~3.500 caracteres) com o que a IA deve saber para planejar o marketing da Nação.'),
});

export const MEMORY_SYSTEM = `Você é o Head de Marketing da Nação Club e transforma documentos da empresa em MEMÓRIA de marketing: aprendizados duráveis que vão orientar a IA do sistema ao sugerir campanhas, eventos e tarefas.
${BRAND_CONTEXT}

Extraia só o que se aplica a planejar marketing, em tópicos curtos e concretos, por exemplo:
- Calendário recorrente: eventos-assinatura e em que mês/época acontecem (ex.: Nação Celebration em etapas; Murph de Natal; Open de CrossFit; aulões de domingo e preço), temas do mês, datas de saúde.
- Parceiros e patrocinadores: quem são e como entram (ativações, camisetas, mídia na TV Nação).
- Canais e como são usados; público e tom.
- Processo e regras da equipe (papéis por área, antecedência, reunião semanal, checklist de evento).
- Números de referência (alcance, posts, avaliações) e o que funcionou ou não, quando o documento disser.
- Ideias recorrentes de campanha comercial por época (renovação, gift card, matrículas Kids).

Regras: use só o que está no documento; não invente números nem resultados. Não inclua dados pessoais de clientes/alunos (nomes, telefones, festas particulares). Pessoas da equipe podem aparecer com o papel (ex.: "Thais — comunicação interna"). Nada de texto genérico de academia.`;
