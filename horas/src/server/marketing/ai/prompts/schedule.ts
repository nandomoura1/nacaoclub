import { z } from 'zod/v4';
import { CAMPAIGN_TYPES } from '@/domain/marketing/constants';
import { IMPORT_KINDS } from '@/domain/marketing/schedule-import';
import { BRAND_CONTEXT } from './brand';

export const SCHEDULE_PROMPT_VERSION = 'mkt-schedule@1';

export const ScheduleSchema = z.object({
  itens: z.array(z.object({
    data: z.string().describe('Data de início AAAA-MM-DD (deduza o ano pelo título/seção do documento; janeiro depois de dezembro é o ano seguinte).'),
    dataFim: z.string().nullable().describe('Data final AAAA-MM-DD quando for um período (ex.: colônia de férias, tema/mês de saúde = último dia do mês); senão null.'),
    titulo: z.string().describe('Nome curto como a equipe usa (ex.: "Nação Celebration — Etapa 3", "Aulão de Domingo (Pepedro)").'),
    tipo: z.enum(IMPORT_KINDS.map((k) => k.id) as [string, ...string[]]),
    detalhes: z.string().nullable().describe('Detalhes úteis do documento (público, preço, ação, sugestões de execução), resumidos; null se não houver.'),
    parceiro: z.string().nullable().describe('Parceiro/patrocinador citado (ex.: "Brasal" em "ATIVAÇÃO BRASAL"); null se não houver.'),
    aConfirmar: z.boolean().describe('true se o documento diz "a confirmar", "confirmar", "pensar", "???", "a definir" ou está em "ações recomendadas/para pensar".'),
    campanhaTipo: z.enum(CAMPAIGN_TYPES.map((t) => t.id) as [string, ...string[]]).nullable().describe('Só para tipo CAMPANHA: o tipo mais próximo; senão null.'),
    origem: z.string().describe('Onde está no documento (ex.: "Setembro 2026 · Ações recomendadas").'),
  })),
  avisos: z.array(z.string()).describe('Dúvidas: datas ambíguas, itens repetidos, trechos cortados.'),
});

export const SCHEDULE_SYSTEM = `Você transforma o cronograma de marketing da Nação Club (documento da equipe) em itens datados para o sistema Nação ADM. Você só LÊ e CLASSIFICA: não invente datas, eventos, preços nem parceiros.
${BRAND_CONTEXT}

Tipos:
- EVENTO: acontece na Nação com participação de alunos/público (Nação Celebration, aulões, torneios, clínicas, colônia de férias, Open/CrossFit, Murph, Nação Talks, NFC, lançamentos com evento, confraternização aberta). Um item por data; se o mesmo evento acontece em datas soltas (ex.: 4 domingos), crie um item por data.
- CAMPANHA: ação de marketing/comercial com período ou oferta ("Pai Treina Grátis", "Traga um Amigo", "Renovação Antecipada 2027", "Gift Card", "Desafio de Carnaval", "Mês da Saúde Mental"). Itens em "Ações recomendadas (PARA PENSAR)" são CAMPANHA com aConfirmar = true e data = 1º dia do mês.
- TEMA_DO_MES: "Tema do mês: X" → titulo "Tema do mês: X", data = 1º dia, dataFim = último dia do mês.
- SAUDE: Outubro Rosa, Novembro Azul, Setembro Amarelo etc. → mês inteiro.
- DATA_COMEMORATIVA: Dia das Mães/Pais/Crianças/Namorados, Halloween, Dia do Servidor, jogos da Seleção, eleições (quando não for evento da Nação).
- CONTEUDO: pautas da seção "Conteúdo" (ex.: "Retrospectiva da Nação", "Saúde masculina") → data = 1º dia do mês.
- ACAO_COMERCIAL: itens da seção "Comercial" (ex.: "Venda anual antecipada", "Matrículas Kids 2027") → data = 1º dia do mês.
- FUNCIONAMENTO: horário especial / Nação fechada / "funciona até 12h" / esquema de feriado.
- FERIADO: o feriado em si (Natal, Tiradentes…), quando a linha só informa o feriado.
- INTERNO: treinamentos e reuniões da equipe, onboarding.
- PRIVADO: aniversários, chás de fralda e festas particulares de alunos/clientes (locação do espaço). Nesses, NÃO escreva nomes de pessoas: titulo = "Evento privado (locação)", detalhes só com horário/nº de convidados.

Regras:
- Datas em AAAA-MM-DD. "22 ou 29/08" → use a primeira e diga em detalhes; aConfirmar = true.
- Mesmo item repetido em duas seções do mesmo mês (lista com • e "Datas importantes"): crie UMA vez.
- Linha com dois eventos ("Etapa 3" e "Kids — Etapa 2") → dois itens.
- Professores/parceiros citados em eventos públicos podem ficar no título (ex.: "Aulão de Domingo (Pepedro)"). Nunca registre dados de clientes.`;
