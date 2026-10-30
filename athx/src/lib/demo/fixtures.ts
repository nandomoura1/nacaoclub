import type { Category, EventInfo, EventSettings, Team } from '@/types/domain';
import { DEFAULT_SETTINGS } from '@/types/domain';
import type { AgendaItem, ProvaResult, Wod, WodEntry } from '@/types/wod';
import { WODS_SETEMBRO } from '@/lib/evento/setembro';

/** O demo roda a etapa de setembro — o mesmo evento, descrito como dado. */
export const DEMO_WODS: Wod[] = WODS_SETEMBRO.map((w) => ({ ...w, eventId: 'demo-event' }));

function provaId(codigo: string): string {
  const wod = DEMO_WODS.find((w) => w.provas.some((p) => p.codigo === codigo));
  const prova = wod?.provas.find((p) => p.codigo === codigo);
  if (!prova) throw new Error(`prova ${codigo} não existe no evento de demonstração`);
  return prova.id;
}

function wodId(numero: number): string {
  const wod = DEMO_WODS.find((w) => w.numero === numero);
  if (!wod) throw new Error(`WOD ${numero} não existe no evento de demonstração`);
  return wod.id;
}

/**
 * DADOS DE DEMONSTRAÇÃO (§54)
 *
 * 20 duplas com nomes CLARAMENTE FICTÍCIOS. Os "sobrenomes" dos atletas são
 * referências a Brasília e ao cerrado — ninguém se chama assim. Nenhum nome
 * real de aluno da Nação aparece aqui.
 *
 * O conjunto é montado de propósito para exercitar TODOS os estados da
 * interface antes de existir banco:
 *   · duplas nas três categorias e nas duas baterias
 *   · empate exato de carga no WOD 1 (duplas 03 e 04)
 *   · empate exato de tempo no WOD 3 (duplas 07 e 08)
 *   · duplas que não concluíram o WOD 3 (CAP + volume)
 *   · duplas ainda sem resultado no WOD 3 ("aguardando")
 *   · uma dupla desclassificada (fora do ranking, visível na listagem)
 */

const EVENT_ID = 'demo-event';

export const DEMO_EVENT: EventInfo = {
  id: EVENT_ID,
  name: 'Nação Celebration — Nação ATHX',
  date: '2026-09-12',
  status: 'LIVE',
  liveMode: true,
  maintenanceMode: false,
};

export const DEMO_SETTINGS: EventSettings = { ...DEFAULT_SETTINGS };

const ROSTER: ReadonlyArray<readonly [string, string, string, Category]> = [
  ['Cerrado', 'Marina Cerrado', 'Rafa Cerrado', 'MISTA'],
  ['Ipê Amarelo', 'Bia Ipê', 'Nina Ipê', 'FEMININA'],
  ['Planalto', 'Téo Planalto', 'Gus Planalto', 'MASCULINA'],
  ['Eixo Monumental', 'Duda Eixo', 'Caio Eixo', 'MISTA'],
  ['Pôr do Sol', 'Lia Poente', 'Vini Poente', 'MISTA'],
  ['Asa Norte', 'Rê Asa', 'Tati Asa', 'FEMININA'],
  ['Buriti', 'Zé Buriti', 'Dan Buriti', 'MASCULINA'],
  ['Lago Sul', 'Pam Lago', 'Iggy Lago', 'MISTA'],
  ['Catetinho', 'Nara Catete', 'Bel Catete', 'FEMININA'],
  ['Torre de TV', 'Rod Torre', 'Ari Torre', 'MASCULINA'],
  ['Paranoá', 'Sol Paranoá', 'Mel Paranoá', 'FEMININA'],
  ['Pequi', 'Jow Pequi', 'Fê Pequi', 'MISTA'],
  ['Candangolândia', 'Kau Candango', 'Ian Candango', 'MASCULINA'],
  ['Sucupira', 'Vic Sucupira', 'Lis Sucupira', 'FEMININA'],
  ['Aroeira', 'Bruno Aroeira', 'Ciro Aroeira', 'MASCULINA'],
  ['Céu de Brasília', 'Dri Céu', 'Tom Céu', 'MISTA'],
  ['Jatobá', 'Nat Jatobá', 'Rui Jatobá', 'MISTA'],
  ['Ponte JK', 'Lu Ponte', 'Pê Ponte', 'FEMININA'],
  ['Savana', 'Ed Savana', 'Ota Savana', 'MASCULINA'],
  ['Uma Nação', 'Kel Nação', 'Mah Nação', 'MISTA'],
];

export const DEMO_TEAMS: Team[] = ROSTER.map(([name, a1, a2, category], i) => {
  const n = i + 1;
  return {
    id: `demo-team-${n}`,
    eventId: EVENT_ID,
    teamNumber: n,
    teamName: name,
    category,
    athlete1: a1,
    athlete2: a2,
    battery: n <= 10 ? 1 : 2,
    // Dupla 20 desclassificada: comprova que ela some do ranking mas
    // continua listada com o status visível.
    status: n === 20 ? 'DESCLASSIFICADA' : 'ATIVA',
  };
});

/** Gerador determinístico — o demo é sempre igual em qualquer máquina. */
function makeRandom(seed: number) {
  let state = seed;
  return () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
}

const rnd = makeRandom(120926);

/**
 * Os lançamentos, já no formato genérico: uma linha por dupla por prova.
 * Provas calculadas (1D e 2C) não aparecem aqui — o motor as deriva.
 */
/** A programação do dia, igual à da etapa de setembro. */
export const DEMO_AGENDA: AgendaItem[] = [
  {
    id: 'ag-1', ordem: 1, hora: '08h00', titulo: 'Aquecimento + Briefing',
    detalhe: 'Presença obrigatória de todos os participantes',
    itens: [
      'Aquecimento geral', 'Mobilidade e preparação', 'Apresentação dos workouts',
      'Explicação das regras', 'Orientações sobre execução dos movimentos',
      'Estratégias e divisão das tarefas', 'Esclarecimento de dúvidas',
    ],
    nota: null, wodId: null, bateria: null, destaque: false,
  },
  { id: 'ag-2', ordem: 2, hora: '09h00–09h16', titulo: 'Workout 01 — Bateria 1', detalhe: 'Strength', itens: [], nota: null, wodId: wodId(1), bateria: 1, destaque: false },
  { id: 'ag-3', ordem: 3, hora: '09h26–09h42', titulo: 'Workout 01 — Bateria 2', detalhe: 'Strength', itens: [], nota: "Intervalo de 14' entre as baterias", wodId: wodId(1), bateria: 2, destaque: false },
  { id: 'ag-4', ordem: 4, hora: '09h30–09h52', titulo: 'Workout 02 — Bateria 1', detalhe: 'Endurance', itens: [], nota: null, wodId: wodId(2), bateria: 1, destaque: false },
  { id: 'ag-5', ordem: 5, hora: '09h56–10h16', titulo: 'Workout 02 — Bateria 2', detalhe: 'Endurance', itens: [], nota: "Intervalo de 20' entre as baterias", wodId: wodId(2), bateria: 2, destaque: false },
  { id: 'ag-6', ordem: 6, hora: '10h12–10h32', titulo: 'Workout 03 — Bateria 1', detalhe: 'Metcon', itens: [], nota: null, wodId: wodId(3), bateria: 1, destaque: false },
  { id: 'ag-7', ordem: 7, hora: '10h36–10h56', titulo: 'Workout 03 — Bateria 2', detalhe: 'Metcon', itens: [], nota: null, wodId: wodId(3), bateria: 2, destaque: false },
  { id: 'ag-8', ordem: 8, hora: '11h00', titulo: 'Conferência / classificação', detalhe: null, itens: [], nota: null, wodId: null, bateria: null, destaque: false },
  { id: 'ag-9', ordem: 9, hora: '11h30', titulo: 'Pódio', detalhe: null, itens: [], nota: null, wodId: null, bateria: null, destaque: true },
];

export const DEMO_ENTRIES: WodEntry[] = [];
export const DEMO_RESULTS: ProvaResult[] = [];

(() => {
  const push = (codigo: string, teamId: string, a1: number | null, a2: number | null, valor: number | null) => {
    DEMO_RESULTS.push({ provaId: provaId(codigo), teamId, valorAtleta1: a1, valorAtleta2: a2, valor });
  };

  // ---- WOD 1 · cargas por atleta --------------------------------------
  const cargas = DEMO_TEAMS.map((t) => {
    const heavy = t.category === 'MASCULINA' ? 1.18 : t.category === 'FEMININA' ? 0.82 : 1;
    const build = (base: number, spread: number) =>
      Math.round(((base + rnd() * spread) * heavy) / 2.5) * 2.5;
    return {
      teamId: t.id,
      press: [build(45, 25), build(42, 25)] as [number, number],
      squat: [build(95, 55), build(90, 55)] as [number, number],
      dead: [build(125, 70), build(120, 70)] as [number, number],
    };
  });

  // Empate proposital: a dupla 04 repete exatamente as cargas da dupla 03.
  const d3 = cargas[2];
  const d4 = cargas[3];
  if (d3 && d4) cargas[3] = { ...d4, press: d3.press, squat: d3.squat, dead: d3.dead };

  for (const c of cargas) {
    DEMO_ENTRIES.push({ wodId: wodId(1), teamId: c.teamId, status: 'PUBLISHED', concluiu: true, volume: null });
    push('1A', c.teamId, c.press[0], c.press[1], null);
    push('1B', c.teamId, c.squat[0], c.squat[1], null);
    push('1C', c.teamId, c.dead[0], c.dead[1], null);
  }

  // ---- WOD 2 · distâncias ----------------------------------------------
  for (const t of DEMO_TEAMS) {
    DEMO_ENTRIES.push({ wodId: wodId(2), teamId: t.id, status: 'PUBLISHED', concluiu: true, volume: null });
    push('2A', t.id, null, null, (Math.floor(rnd() * 8) + 3) * 0.5);
    push('2B', t.id, null, null, Math.round((6 + rnd() * 6.5) * 100) / 100);
  }

  // ---- WOD 3 · tempo, CAP e aguardando ---------------------------------
  DEMO_TEAMS.forEach((t, i) => {
    // Duplas 15 a 19: ainda sem lançamento -> a tela mostra "aguardando".
    if (i >= 14 && i <= 18) {
      DEMO_ENTRIES.push({ wodId: wodId(3), teamId: t.id, status: 'DRAFT', concluiu: false, volume: null });
      push('3A', t.id, null, null, null);
      return;
    }

    // Duplas 11 e 12: estouraram o CAP -> 20:00 e o volume concluído.
    if (i === 10 || i === 11) {
      DEMO_ENTRIES.push({
        wodId: wodId(3),
        teamId: t.id,
        status: 'PUBLISHED',
        concluiu: false,
        volume: 420 + Math.round(rnd() * 180),
      });
      push('3A', t.id, null, null, 1200);
      return;
    }

    // Empate proposital de tempo entre as duplas 07 e 08.
    const segundos = i === 7 || i === 6 ? 889 : 760 + Math.round(rnd() * 380);
    DEMO_ENTRIES.push({ wodId: wodId(3), teamId: t.id, status: 'PUBLISHED', concluiu: true, volume: null });
    push('3A', t.id, null, null, segundos);
  });
})();
