import { describe, expect, it } from 'vitest';
import { hasWrittenDays, parseWeekText } from '@/domain/workout-text';
import { futevoleiSemanaTexto } from '../fixtures/futevolei-semana-texto';

describe('semana escrita em texto → Cadastro de Treino', () => {
  it('exemplo do Futevôlei: intenção, 4 dias, mobilidade, aquecimento, fundamento e jogo', () => {
    const r = parseWeekText(futevoleiSemanaTexto, '2026-10-05');
    expect(r.theme).toBe('LEVANTADA');
    expect(r.warnings).toEqual([]);
    expect(r.days.map((d) => [d.date, d.title])).toEqual([
      ['2026-10-05', 'Levantada de chapa'],
      ['2026-10-06', 'Levantadade ombro'],
      ['2026-10-07', 'Levantada coxa e cabeça'],
      ['2026-10-08', 'Levantada de peito e cabeça'],
    ]);
    for (const d of r.days) expect(d.blocks.map((b) => b.kind)).toEqual(['MOBILIDADE', 'AQUECIMENTO', 'FUNDAMENTO', 'JOGO']);
    const [mob, aq, fund, jogo] = r.days[0]!.blocks;
    expect(mob).toMatchObject({ title: '4 exercícios', content: null, durationMin: null });
    expect(aq).toMatchObject({ title: 'Dinâmica de jogo com enquadramento' });
    expect(aq!.content).toMatch(/^Quadrinha \/ enquadrar a primeira bola de chapa \(fazer uma sequência/);
    expect(fund!.content).toBe('Executar a chapa em todos os sentidos');
    expect(jogo).toMatchObject({ title: 'Dinâmica de jogo com regras', content: 'Joguinho só vale levantada de chapa (o jogo todo)' });
    expect(r.days[1]!.blocks[3]!.content).toContain('a dupla adversária paga 10 polichinelos');
  });

  it('data que não bate com a semana: usa o dia da semana e avisa; minutos no rótulo', () => {
    const r = parseWeekText('Ideia central: recepção\nSexta-feira: Recepção curta - 12/10\nWarm-up 10\': trote\nFundamento (20 min):\n- recepção de saque\nJogo:\n- ponto só vale com recepção', '2026-10-05');
    expect(r.theme).toBe('recepção');
    expect(r.days).toHaveLength(1);
    expect(r.days[0]).toMatchObject({ date: '2026-10-09', title: 'Recepção curta' });
    expect(r.warnings[0]).toMatch(/12\/10.*09\/10/);
    expect(r.days[0]!.blocks.map((b) => [b.kind, b.durationMin, b.title])).toEqual([
      ['AQUECIMENTO', 10, 'trote'], ['FUNDAMENTO', 20, null], ['JOGO', null, 'Jogo'],
    ]);
  });

  it('"Segunda bola…" no meio do texto não abre um dia; sem dias escritos, a IA é que organiza', () => {
    expect(hasWrittenDays('Intenção do mês: levantada\nSegunda bola sempre de chapa')).toBe(false);
    expect(hasWrittenDays(futevoleiSemanaTexto)).toBe(true);
    const r = parseWeekText('SEGUNDA\nFundamento:\n- chapa\nSegunda bola sempre alta', '2026-10-05');
    expect(r.days).toHaveLength(1);
    expect(r.days[0]!.blocks[0]!.content).toBe('chapa\nSegunda bola sempre alta');
  });
});
