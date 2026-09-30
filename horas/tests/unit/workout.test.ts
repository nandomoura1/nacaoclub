import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { dayMinutes, dayTemplate, fitFontSize, lessonMinutes, mondayOf, weekRange, whatsappText } from '@/domain/workout';
import { dayArt, weekArt } from '@/server/workouts/art';
import { crossfitWeek } from '../fixtures/workout-crossfit';

describe('treinos (puro)', () => {
  it('semana, segunda-feira e estrutura padrão por modalidade', () => {
    expect(weekRange(crossfitWeek)).toBe('28/09 A 03/10');
    expect(mondayOf('2026-10-03')).toBe('2026-09-28');
    expect(mondayOf('2026-09-28')).toBe('2026-09-28');
    expect(mondayOf('2026-10-04')).toBe('2026-09-28'); // domingo fecha a semana
    expect(dayTemplate('CrossFit').map((b) => b.kind)).toEqual(['MOBILIDADE', 'AQUECIMENTO', 'FORCA', 'ESPECIFICO', 'WOD']);
    expect(dayMinutes({ date: '2026-09-28', title: null, blocks: dayTemplate('CrossFit') })).toBe(lessonMinutes('CrossFit')); // aula de 55'
    expect(lessonMinutes('Funcional')).toBe(50);
    expect(lessonMinutes('Futevôlei')).toBeNull();
    expect(dayTemplate('Futevôlei').map((b) => b.kind)).toEqual(['AQUECIMENTO', 'FUNDAMENTO', 'JOGO']);
    expect(dayTemplate('Base Forte').map((b) => b.kind)).toEqual(['AQUECIMENTO', 'FUNDAMENTO', 'JOGO']);
    expect(dayTemplate('HYROX').map((b) => b.kind)).toEqual(['AQUECIMENTO', 'SKILL', 'WOD']);
  });

  it('texto de WhatsApp: fases numa linha, Força e WOD detalhados, rodapé', () => {
    const t = whatsappText(crossfitWeek);
    expect(t).toMatch(/^\*🔵 PLANO SEMANAL DE TREINOS · CROSSFIT\*\n_28\/09 A 03\/10_/);
    expect(t).toContain("*SEGUNDA · 28/09*");
    expect(t).toContain("🏃 WARM-UP — 10'");
    expect(t).toContain("🏋️ *FORÇA 10'* — Shoulder press\n_4-4-4-4-4+_\n• Work between 75-85%");
    expect(t).toContain("🔥 *WOD 15'* — O'Connor\n_3 rounds for time_\n• 15 thrusters");
    expect(t).toContain("_Time cap 24'_".replace('_Time cap', '_For time 24\' · Time cap'));
    expect(t).toContain('*📣 ClubFit*');
    const day = whatsappText(crossfitWeek, '2026-10-02');
    expect(day).toMatch(/TREINO DO DIA · CROSSFIT\*\n_Sexta, 02\/10_/);
    expect(day).not.toContain('SEGUNDA');
  });

  it('a letra diminui quando o dia está cheio (nada cortado)', () => {
    const light = fitFontSize([crossfitWeek.days[1]!], { columnWidth: 260, height: 520, max: 22, min: 11 });
    const heavy = fitFontSize([crossfitWeek.days[1]!, crossfitWeek.days[3]!], { columnWidth: 260, height: 520, max: 22, min: 11 });
    const huge = fitFontSize([{ ...crossfitWeek.days[3]!, blocks: Array(8).fill(crossfitWeek.days[3]!.blocks[1]) }], { columnWidth: 260, height: 520, max: 22, min: 11 });
    expect(light).toBe(22);
    expect(heavy).toBeLessThan(light);
    expect(huge).toBe(11);
  });
});

describe('arte (JPG)', () => {
  it('semana em paisagem e treino do dia em retrato 4:5', async () => {
    const week = await weekArt(crossfitWeek);
    const day = await dayArt(crossfitWeek, '2026-10-01');
    expect([...week.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]); // JPEG
    expect(await sharp(week).metadata()).toMatchObject({ format: 'jpeg', width: 1920, height: 1280 });
    expect(await sharp(day).metadata()).toMatchObject({ format: 'jpeg', width: 1080, height: 1350 });
    // Sem rodapé de anúncio e com poucos dias também sai.
    const plain = await weekArt({ ...crossfitWeek, footerTitle: null, footerText: null, footerChips: null, days: crossfitWeek.days.slice(0, 3) });
    expect(plain.length).toBeGreaterThan(50_000);
  }, 60_000);
});

describe('dias vazios não entram', () => {
  it('período e texto consideram só dias com treino', () => {
    const week = { ...crossfitWeek, days: [...crossfitWeek.days.slice(0, 2), { date: '2026-10-03', title: null, blocks: [] }] };
    expect(weekRange(week)).toBe('28/09 A 29/09');
    expect(whatsappText(week)).not.toContain('SÁBADO');
  });
});
