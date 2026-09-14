import type {
  Category,
  EventInfo,
  EventSettings,
  Team,
  Wod1Result,
  Wod2Result,
  Wod3Result,
} from '@/types/domain';
import { DEFAULT_SETTINGS } from '@/types/domain';

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

export const DEMO_WOD1: Wod1Result[] = (() => {
  const rows = DEMO_TEAMS.map<Wod1Result>((t) => {
    const heavy = t.category === 'MASCULINA' ? 1.18 : t.category === 'FEMININA' ? 0.82 : 1;
    const build = (base: number, spread: number) =>
      Math.round(((base + rnd() * spread) * heavy) / 2.5) * 2.5;

    return {
      teamId: t.id,
      strictPressAthlete1: build(45, 25),
      strictPressAthlete2: build(42, 25),
      backSquatAthlete1: build(95, 55),
      backSquatAthlete2: build(90, 55),
      deadliftAthlete1: build(125, 70),
      deadliftAthlete2: build(120, 70),
      status: 'PUBLISHED',
    };
  });

  // Empate proposital: a dupla 04 repete exatamente as cargas da dupla 03,
  // para que a tela de EMPATE apareça já no modo demo.
  const dupla03 = rows[2];
  const dupla04 = rows[3];
  if (dupla03 && dupla04) {
    rows[3] = {
      ...dupla04,
      strictPressAthlete1: dupla03.strictPressAthlete1,
      strictPressAthlete2: dupla03.strictPressAthlete2,
      backSquatAthlete1: dupla03.backSquatAthlete1,
      backSquatAthlete2: dupla03.backSquatAthlete2,
      deadliftAthlete1: dupla03.deadliftAthlete1,
      deadliftAthlete2: dupla03.deadliftAthlete2,
    };
  }

  return rows;
})();

export const DEMO_WOD2: Wod2Result[] = DEMO_TEAMS.map((t) => ({
  teamId: t.id,
  // Corrida sempre em múltiplos de 500 m — a regra crítica do WOD 2.
  runKm: (Math.floor(rnd() * 8) + 3) * 0.5,
  bikeKm: Math.round((6 + rnd() * 6.5) * 100) / 100,
  status: 'PUBLISHED',
}));

export const DEMO_WOD3: Wod3Result[] = DEMO_TEAMS.map((t, i) => {
  // Duplas 15 a 19: ainda sem lançamento -> a tela mostra "aguardando".
  if (i >= 14 && i <= 18) {
    return {
      teamId: t.id,
      timeSeconds: null,
      completed: false,
      volumeCompleted: null,
      status: 'DRAFT',
    };
  }

  // Duplas 11 e 12: estouraram o CAP -> tempo = 20:00 + volume concluído.
  if (i === 10 || i === 11) {
    return {
      teamId: t.id,
      timeSeconds: 1200,
      completed: false,
      volumeCompleted: 420 + Math.round(rnd() * 180),
      status: 'PUBLISHED',
    };
  }

  // Empate proposital de tempo entre as duplas 07 e 08.
  const seconds = i === 7 ? 889 : i === 6 ? 889 : 760 + Math.round(rnd() * 380);

  return {
    teamId: t.id,
    timeSeconds: seconds,
    completed: true,
    volumeCompleted: null,
    status: 'PUBLISHED',
  };
});
