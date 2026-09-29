import type { WorkoutWeekData } from '@/domain/workout';

/** Semana real de CrossFit (arte de 28/09 a 03/10) — fixture para arte e texto. */
export const crossfitWeek: WorkoutWeekData = {
  modality: 'CrossFit',
  weekStart: '2026-09-28',
  footerTitle: 'ClubFit',
  footerText: 'A partir de 1º de outubro: renove, indique, acumule fits e ganhe produtos, serviços e planos na Nação.',
  footerChips: 'Aulão CrossFit|7H\nAulão HYROX|8H 9H 10H\nNação Dance|11H15',
  days: [
    { date: '2026-09-28', title: null, blocks: [
      { kind: 'AQUECIMENTO', title: null, durationMin: 10, format: null, timeCapMin: null, content: null, notes: null },
      { kind: 'FORCA', title: 'Shoulder press', durationMin: 10, format: '4-4-4-4-4+', timeCapMin: null, content: 'Work between 75-85%\nÚltimo set: máximo de reps possíveis', notes: null },
      { kind: 'ESPECIFICO', title: null, durationMin: 10, format: null, timeCapMin: null, content: 'Pull up\nThruster', notes: null },
      { kind: 'WOD', title: "O'Connor", durationMin: 15, format: '3 rounds for time', timeCapMin: null, content: '15 thrusters (kg: 29/43 - 25/30)\n15 pull-ups\n400-meter run', notes: null },
    ] },
    { date: '2026-09-29', title: null, blocks: [
      { kind: 'AQUECIMENTO', title: null, durationMin: 20, format: null, timeCapMin: null, content: null, notes: null },
      { kind: 'WOD', title: null, durationMin: 25, format: 'EMOM 25\'', timeCapMin: null, content: '10m HSW / 3 wall walk\n20 ktb swing russo (kg: 16/24 - 12/20)\n12/15 cal bike\n20m sled push\n20 sit ups', notes: null },
    ] },
    { date: '2026-09-30', title: null, blocks: [
      { kind: 'AQUECIMENTO', title: null, durationMin: 10, format: null, timeCapMin: null, content: null, notes: null },
      { kind: 'FORCA', title: 'Clean barbell control', durationMin: 10, format: 'EMOM 8\'', timeCapMin: null, content: '4 power clean DNG (drop and go)\nWork between 75-80% do power clean', notes: null },
      { kind: 'ESPECIFICO', title: null, durationMin: 5, format: null, timeCapMin: null, content: 'Box jump\nDeadlift', notes: null },
      { kind: 'WOD', title: 'The Quick and the Dead', durationMin: 16, format: 'For time: 3-9-15-21-15-9-3', timeCapMin: null, content: 'Deadlifts (kg: 93/65 - 80/55 - 70/45)\nBox jumps', notes: 'Perform 50 du between rounds' },
    ] },
    { date: '2026-10-01', title: null, blocks: [
      { kind: 'AQUECIMENTO', title: null, durationMin: 20, format: null, timeCapMin: null, content: null, notes: null },
      { kind: 'WOD', title: null, durationMin: 24, format: 'For time 24\'', timeCapMin: 24, content: '10 Bar muscle up\n1000m Run\n20 Toes to bar\n20m DB walking lunge (kg: 15/22,5 - 12,5/15)\n8 Bar muscle up\n800m Run\n18 Toes to bar\n20m DB walking lunge\n6 Bar muscle up\n600m Run\n16 Toes to bar\n20m DB walking lunge', notes: null },
    ] },
    { date: '2026-10-02', title: null, blocks: [
      { kind: 'AQUECIMENTO', title: null, durationMin: 8, format: null, timeCapMin: null, content: null, notes: null },
      { kind: 'FORCA', title: 'Snatch complex', durationMin: 10, format: '5 sets · a cada 2\'', timeCapMin: null, content: '1 power snatch\n2 hang power snatches\n(65/70/75/80/85%)', notes: null },
      { kind: 'WOD', title: null, durationMin: 15, format: '15-12-9 / 30-24-18', timeCapMin: null, content: 'Power Snatch (kg: 41/60 - 35/50 - 29/40)\nBurpees over the bar', notes: null },
    ] },
    { date: '2026-10-03', title: 'Em dupla', blocks: [
      { kind: 'MOBILIDADE', title: null, durationMin: 5, format: null, timeCapMin: null, content: null, notes: null },
      { kind: 'AQUECIMENTO', title: null, durationMin: 15, format: null, timeCapMin: null, content: null, notes: null },
      { kind: 'WOD', title: null, durationMin: 30, format: 'Work with a partner · For time', timeCapMin: 30, content: '150 crossover\n90 wall ball\n80 push up\n70 cal bike/row\n60 double db squat clean (kg: 15/22,5 - 12,5/15)\n50 hspu\n150 du', notes: 'Divide everything however you like' },
    ] },
  ],
};
