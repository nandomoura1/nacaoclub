import type { WorkoutBlockData } from './workout';

/**
 * Biblioteca de benchmarks: definições públicas dos benchmarks oficiais do
 * CrossFit (Girls, Heroes e clássicos), com cargas Rx em kg (masc/fem) e o
 * original em lb nas observações. Os benchmarks da própria Nação ficam no banco.
 */
export type BenchmarkCategory = 'GIRL' | 'HERO' | 'CLASSICO' | 'NACAO';

export const BENCHMARK_CATEGORIES: { value: BenchmarkCategory; label: string }[] = [
  { value: 'GIRL', label: 'Girls' },
  { value: 'HERO', label: 'Heroes' },
  { value: 'CLASSICO', label: 'Clássicos' },
  { value: 'NACAO', label: 'Da Nação' },
];

export interface BenchmarkData {
  name: string;
  category: BenchmarkCategory;
  format: string | null;
  timeCapMin: number | null;
  content: string;
  notes: string | null;
}

const b = (name: string, category: BenchmarkCategory, format: string, content: string[], notes: string | null = null, timeCapMin: number | null = null): BenchmarkData =>
  ({ name, category, format, timeCapMin, content: content.join('\n'), notes });

export const CROSSFIT_BENCHMARKS: BenchmarkData[] = [
  // ── Girls ────────────────────────────────────────────────
  b('Angie', 'GIRL', 'For time', ['100 pull-ups', '100 push-ups', '100 sit-ups', '100 air squats'], 'Termine todas as reps de um movimento antes de passar ao próximo.'),
  b('Annie', 'GIRL', 'For time: 50-40-30-20-10', ['Double-unders', 'Sit-ups (AbMat)']),
  b('Barbara', 'GIRL', '5 rounds for time', ['20 pull-ups', '30 push-ups', '40 sit-ups', '50 air squats'], 'Descanso de 3 min entre os rounds.'),
  b('Candy', 'GIRL', '5 rounds for time', ['20 pull-ups', '40 push-ups', '60 air squats']),
  b('Chelsea', 'GIRL', 'EMOM 30\'', ['5 pull-ups', '10 push-ups', '15 air squats'], 'Se não completar o round dentro do minuto, o treino acaba. Score: rounds completos.'),
  b('Cindy', 'GIRL', 'AMRAP 20\'', ['5 pull-ups', '10 push-ups', '15 air squats']),
  b('Diane', 'GIRL', 'For time: 21-15-9', ['Deadlift (kg: 102/70)', 'Handstand push-ups'], 'Rx: 225/155 lb.'),
  b('Elizabeth', 'GIRL', 'For time: 21-15-9', ['Clean (kg: 61/43)', 'Ring dips'], 'Rx: 135/95 lb. Qualquer estilo de clean.'),
  b('Eva', 'GIRL', '5 rounds for time', ['800m run', '30 kettlebell swings (kg: 32/24)', '30 pull-ups'], 'Rx: 2/1,5 pood.'),
  b('Fran', 'GIRL', 'For time: 21-15-9', ['Thrusters (kg: 43/29)', 'Pull-ups'], 'Rx: 95/65 lb.'),
  b('Grace', 'GIRL', 'For time', ['30 clean and jerks (kg: 61/43)'], 'Rx: 135/95 lb.'),
  b('Gwen', 'GIRL', 'For load: 15-12-9', ['Clean and jerk (touch and go)'], 'Mesma carga em todas as séries; descanso livre entre as séries. Score: carga usada.'),
  b('Helen', 'GIRL', '3 rounds for time', ['400m run', '21 kettlebell swings (kg: 24/16)', '12 pull-ups'], 'Rx: 1,5/1 pood.'),
  b('Hope', 'GIRL', '3 rounds (1\' em cada estação)', ['Burpees', 'Power snatch (kg: 34/25)', 'Box jumps (60/50 cm)', 'Thrusters (kg: 34/25)', 'Chest-to-bar pull-ups'], 'Rx: 75/55 lb, box 24/20 in. 1\' de descanso entre os rounds. Score: total de reps.'),
  b('Isabel', 'GIRL', 'For time', ['30 snatches (kg: 61/43)'], 'Rx: 135/95 lb.'),
  b('Jackie', 'GIRL', 'For time', ['1000m row', '50 thrusters (kg: 20/15)', '30 pull-ups'], 'Rx: 45/35 lb.'),
  b('Karen', 'GIRL', 'For time', ['150 wall-ball shots (kg: 9/6)'], 'Rx: 20/14 lb, alvo 10/9 ft (3/2,7 m).'),
  b('Kelly', 'GIRL', '5 rounds for time', ['400m run', '30 box jumps (60/50 cm)', '30 wall-ball shots (kg: 9/6)'], 'Rx: box 24/20 in, bola 20/14 lb.'),
  b('Linda', 'GIRL', 'For time: 10-9-8-7-6-5-4-3-2-1', ['Deadlift (1,5x peso corporal)', 'Bench press (1x peso corporal)', 'Clean (0,75x peso corporal)'], 'Também chamada de "3 Bars of Death".'),
  b('Lynne', 'GIRL', '5 rounds: máximo de reps', ['Bench press (peso corporal)', 'Pull-ups'], 'Sem tempo; descanso livre. Score: total de reps.'),
  b('Maggie', 'GIRL', '5 rounds for time', ['20 handstand push-ups', '40 pull-ups', '60 pistols (alternados)']),
  b('Mary', 'GIRL', 'AMRAP 20\'', ['5 handstand push-ups', '10 pistols (alternados)', '15 pull-ups']),
  b('Nancy', 'GIRL', '5 rounds for time', ['400m run', '15 overhead squats (kg: 43/29)'], 'Rx: 95/65 lb.'),
  b('Nicole', 'GIRL', 'AMRAP 20\'', ['400m run', 'Máximo de pull-ups'], 'Score: total de pull-ups.'),
  b('Amanda', 'GIRL', 'For time: 9-7-5', ['Muscle-ups', 'Squat snatches (kg: 61/43)'], 'Rx: 135/95 lb.'),

  // ── Heroes ───────────────────────────────────────────────
  b('Murph', 'HERO', 'For time', ['1 mile run (1,6 km)', '100 pull-ups', '200 push-ups', '300 air squats', '1 mile run (1,6 km)'], 'Colete de 20/14 lb (9/6 kg). Pull-ups, push-ups e squats podem ser particionados; as corridas não.'),
  b('DT', 'HERO', '5 rounds for time', ['12 deadlifts', '9 hang power cleans', '6 push jerks', '(kg: 70/47)'], 'Rx: 155/105 lb, mesma barra nos três movimentos.'),
  b('JT', 'HERO', 'For time: 21-15-9', ['Handstand push-ups', 'Ring dips', 'Push-ups']),
  b('Michael', 'HERO', '3 rounds for time', ['800m run', '50 back extensions', '50 sit-ups']),
  b('Nate', 'HERO', 'AMRAP 20\'', ['2 muscle-ups', '4 handstand push-ups', '8 kettlebell swings (kg: 32/24)'], 'Rx: 2/1,5 pood.'),
  b('Badger', 'HERO', '3 rounds for time', ['30 squat cleans (kg: 43/29)', '30 pull-ups', '800m run'], 'Rx: 95/65 lb.'),
  b('Randy', 'HERO', 'For time', ['75 power snatches (kg: 34/25)'], 'Rx: 75/55 lb.'),
  b('Josh', 'HERO', 'For time', ['21 overhead squats', '42 pull-ups', '15 overhead squats', '30 pull-ups', '9 overhead squats', '18 pull-ups', '(kg: 43/29)'], 'Rx: 95/65 lb.'),
  b('The Seven', 'HERO', '7 rounds for time', ['7 handstand push-ups', '7 thrusters (kg: 61/43)', '7 knees-to-elbows', '7 deadlifts (kg: 111/75)', '7 burpees', '7 kettlebell swings (kg: 32/24)', '7 pull-ups'], 'Rx: thruster 135/95 lb, deadlift 245/165 lb, kettlebell 2/1,5 pood.'),
  b('Holleyman', 'HERO', '30 rounds for time', ['5 wall-ball shots (kg: 9/6)', '3 handstand push-ups', '1 power clean (kg: 102/70)'], 'Rx: bola 20/14 lb, clean 225/155 lb.'),
  b('Daniel', 'HERO', 'For time', ['50 pull-ups', '400m run', '21 thrusters (kg: 43/29)', '800m run', '21 thrusters', '400m run', '50 pull-ups'], 'Rx: 95/65 lb.'),
  b('Jason', 'HERO', 'For time', ['100 air squats', '5 muscle-ups', '75 air squats', '10 muscle-ups', '50 air squats', '15 muscle-ups', '25 air squats', '20 muscle-ups']),
  b('Luce', 'HERO', '3 rounds for time (com colete)', ['1 km run', '10 muscle-ups', '100 air squats'], 'Colete de 20/14 lb (9/6 kg).'),
  b('Griff', 'HERO', 'For time', ['800m run', '400m run de costas', '800m run', '400m run de costas']),
  b('Whitten', 'HERO', '5 rounds for time', ['22 kettlebell swings (kg: 32/24)', '22 box jumps (60/50 cm)', '400m run', '22 burpees', '22 wall-ball shots (kg: 9/6)'], 'Rx: 2/1,5 pood, box 24/20 in, bola 20/14 lb.'),
  b('Wittman', 'HERO', '7 rounds for time', ['15 kettlebell swings (kg: 24/16)', '15 power cleans (kg: 43/29)', '15 box jumps (60/50 cm)'], 'Rx: 1,5/1 pood, barra 95/65 lb, box 24/20 in.'),
  b('McGhee', 'HERO', 'AMRAP 30\'', ['5 deadlifts (kg: 125/84)', '13 push-ups', '9 box jumps (60/50 cm)'], 'Rx: 275/185 lb, box 24/20 in.'),
  b('Kalsu', 'HERO', 'For time', ['100 thrusters (kg: 61/43)', 'EMOM: 5 burpees'], 'Rx: 135/95 lb. Começa com 5 burpees e a cada minuto faz 5 burpees antes de continuar os thrusters.'),
  b('Loredo', 'HERO', '6 rounds for time', ['24 air squats', '24 push-ups', '24 walking lunges', '400m run']),
  b('Tommy V', 'HERO', 'For time', ['21 thrusters (kg: 52/34)', '12 rope climbs (4,5 m)', '15 thrusters', '9 rope climbs', '9 thrusters', '6 rope climbs'], 'Rx: 115/75 lb, corda de 15 ft.'),
  b('Glen', 'HERO', 'For time', ['30 clean and jerks (kg: 61/43)', '1 mile run (1,6 km)', '10 rope climbs (4,5 m)', '1 mile run (1,6 km)', '100 burpees'], 'Rx: 135/95 lb, corda de 15 ft.'),
  b('Jerry', 'HERO', 'For time', ['1 mile run (1,6 km)', '2 km row', '1 mile run (1,6 km)']),
  b('Ryan', 'HERO', '5 rounds for time', ['7 muscle-ups', '21 burpees'], 'Nos burpees, toque um alvo 30 cm acima do alcance máximo.'),
  b('Mr. Joshua', 'HERO', '5 rounds for time', ['400m run', '30 GHD sit-ups', '15 deadlifts (kg: 113/75)'], 'Rx: 250/165 lb.'),
  b('Hansen', 'HERO', '5 rounds for time', ['30 kettlebell swings (kg: 32/24)', '30 burpees', '30 GHD sit-ups'], 'Rx: 2/1,5 pood.'),
  b('Lumberjack 20', 'HERO', 'For time', ['20 deadlifts (kg: 125/84)', '400m run', '20 kettlebell swings (kg: 32/24)', '400m run', '20 overhead squats (kg: 52/34)', '400m run', '20 burpees', '400m run', '20 chest-to-bar pull-ups', '400m run', '20 box jumps (60/50 cm)', '400m run', '20 dumbbell squat cleans (kg: 2x 20/14)', '400m run'], 'Rx: deadlift 275/185 lb, KB 2/1,5 pood, OHS 115/75 lb, DB 45/30 lb.'),
  b('Bull', 'HERO', '2 rounds for time', ['200 double-unders', '50 overhead squats (kg: 61/43)', '50 pull-ups', '1 mile run (1,6 km)'], 'Rx: 135/95 lb.'),
  b('Chad', 'HERO', 'For time', ['1000 box step-ups (50 cm) com mochila de 20 kg'], 'Rx: box 20 in, mochila 45 lb.'),

  // ── Clássicos ────────────────────────────────────────────
  b('Fight Gone Bad', 'CLASSICO', '3 rounds (1\' em cada estação)', ['Wall-ball shots (kg: 9/6)', 'Sumo deadlift high pull (kg: 34/25)', 'Box jumps (50 cm)', 'Push press (kg: 34/25)', 'Row (calorias)'], '1\' de descanso entre os rounds. Score: total de reps (cada caloria = 1 rep).'),
  b('Filthy Fifty', 'CLASSICO', 'For time', ['50 box jumps (60/50 cm)', '50 jumping pull-ups', '50 kettlebell swings (kg: 16/12)', '50 walking lunges', '50 knees-to-elbows', '50 push press (kg: 20/15)', '50 back extensions', '50 wall-ball shots (kg: 9/6)', '50 burpees', '50 double-unders']),
  b('CrossFit Total', 'CLASSICO', 'For load', ['Back squat: 1RM', 'Shoulder press: 1RM', 'Deadlift: 1RM'], 'Três tentativas por movimento. Score: soma das três melhores cargas.'),
  b('Tabata Something Else', 'CLASSICO', 'Tabata: 8 rounds de 20" on / 10" off por movimento', ['Pull-ups', 'Push-ups', 'Sit-ups', 'Air squats'], 'Score: total de reps nos 32 intervalos.'),
];

/** Bloco de WOD pronto para entrar no treino do dia. */
export function benchmarkBlock(bm: Pick<BenchmarkData, 'name' | 'format' | 'timeCapMin' | 'content' | 'notes'>): WorkoutBlockData {
  return {
    kind: 'WOD', title: bm.name, durationMin: bm.timeCapMin, format: bm.format, timeCapMin: bm.timeCapMin,
    content: bm.content, notes: bm.notes, coachNotes: null,
  };
}

/** Texto para WhatsApp de um benchmark. */
export function benchmarkText(bm: BenchmarkData): string {
  const out = [`*🏆 ${bm.name.toUpperCase()}*`];
  const meta = [bm.format, bm.timeCapMin ? `Time cap ${bm.timeCapMin}'` : null].filter(Boolean).join(' · ');
  if (meta) out.push(`_${meta}_`);
  for (const l of bm.content.split('\n').map((x) => x.trim()).filter(Boolean)) out.push(`• ${l}`);
  if (bm.notes) out.push(`_${bm.notes}_`);
  return out.join('\n');
}

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Busca por nome, movimento ou formato ("thruster", "amrap", "fran"), sem acento. */
export function matchBenchmark(bm: Pick<BenchmarkData, 'name' | 'content' | 'format'>, q: string): boolean {
  const t = norm(q.trim());
  return !t || norm(`${bm.name} ${bm.format ?? ''} ${bm.content}`).includes(t);
}
