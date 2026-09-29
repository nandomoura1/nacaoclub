import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { lessonTimeline, studentBlock, whatsappText, type WorkoutWeekData } from '@/domain/workout';
import { workoutPdf } from '@/server/workouts/pdf';
import { crossfitWeek } from '../fixtures/workout-crossfit';

const withCoach = (): WorkoutWeekData => {
  const w = structuredClone(crossfitWeek);
  w.days[0]!.blocks[0] = { ...w.days[0]!.blocks[0]!, content: '200m run\n10 air squats', coachNotes: 'Observe o agachamento.' };
  w.days[0]!.blocks[3] = { ...w.days[0]!.blocks[3]!, coachNotes: 'Escala: ring row.' };
  return w;
};

describe('treinos · plano de aula e versão do aluno', () => {
  it('linha do tempo da aula soma as durações; bloco sem duração não avança', () => {
    const d = { date: '2026-09-28', title: null, blocks: [
      { kind: 'MOBILIDADE' as const, durationMin: 10, title: null, format: null, timeCapMin: null, content: null, notes: null },
      { kind: 'FORCA' as const, durationMin: null, title: null, format: null, timeCapMin: null, content: null, notes: null },
      { kind: 'WOD' as const, durationMin: 15, title: null, format: null, timeCapMin: null, content: null, notes: null },
    ] };
    expect(lessonTimeline(d).map((t) => [t.from, t.to])).toEqual([[0, 10], [10, null], [10, 25]]);
  });

  it('aluno: warm-up só com tempo, força/técnica/WOD detalhados, nunca as orientações ao professor', () => {
    const [warm, , , wod] = withCoach().days[0]!.blocks.map(studentBlock);
    expect(warm).toMatchObject({ kind: 'AQUECIMENTO', durationMin: 10, content: null, coachNotes: null });
    expect(wod).toMatchObject({ kind: 'WOD', title: "O'Connor", coachNotes: null });
    expect(wod!.content).toContain('15 pull-ups');
    expect(studentBlock({ kind: 'SKILL', durationMin: 8, title: 'Double under', format: null, timeCapMin: null, content: 'Saltito', notes: null }).content).toBe('Saltito');
    const text = whatsappText(withCoach());
    expect(text).not.toContain('Observe o agachamento');
    expect(text).not.toContain('ring row');
    expect(text).not.toContain('200m run');
  });

  it('PDF do professor: um dia por página; do aluno: semana corrida; dia avulso', async () => {
    const w = withCoach();
    const pages = async (b: Uint8Array) => (await PDFDocument.load(b)).getPageCount();
    const prof = await workoutPdf(w, 'professor');
    expect(Buffer.from(prof.slice(0, 5)).toString()).toBe('%PDF-');
    expect(await pages(prof)).toBeGreaterThanOrEqual(w.days.filter((d) => d.blocks.length).length);
    expect(await pages(await workoutPdf(w, 'aluno'))).toBeLessThan(await pages(prof));
    expect(await pages(await workoutPdf(w, 'professor', '2026-09-28'))).toBe(1);
  });
});
