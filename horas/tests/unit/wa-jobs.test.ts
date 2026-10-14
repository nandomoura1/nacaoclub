import { describe, expect, it } from 'vitest';
import { isoWeek, nextSaturday } from '@/domain/wa-jobs';
import { demandsBlock, shiftsBlock } from '@/domain/wa-automations';

describe('períodos e blocos (puro)', () => {
  it('semana ISO e próximo sábado', () => {
    expect(isoWeek('2026-10-19')).toBe('2026-W43');
    expect(isoWeek('2026-10-25')).toBe('2026-W43');
    expect(isoWeek('2027-01-01')).toBe('2026-W53');
    expect(nextSaturday('2026-10-23')).toBe('2026-10-24');
    expect(nextSaturday('2026-10-24')).toBe('2026-10-24');
  });
  it('blocos de demandas e de escala', () => {
    const d = demandsBlock([
      { title: 'Freezer', sector: 'Lanchonete', dueDate: '2026-10-15', late: true, priority: 'URGENTE' },
      { title: 'Açaí', sector: 'Lanchonete', dueDate: '2026-10-22', late: false, priority: 'MEDIA' },
    ]);
    expect(d).toContain('*Atrasadas (1)*');
    expect(d).toContain('🔴 Freezer — venceu 15/10');
    expect(d).toContain('Açaí — vence 22/10');
    const s = shiftsBlock([{ date: '2026-10-25', startMin: 480, endMin: 840, sector: 'Recepção' }, { date: '2026-10-24', startMin: 420, endMin: 1020, sector: 'Academia' }]);
    expect(s.indexOf('sábado 24/10')).toBeLessThan(s.indexOf('domingo 25/10'));
    expect(s).toContain('07:00–17:00 · Academia');
  });
});

import { isConfirmation, phoneKey } from '@/domain/whatsapp';
describe('respostas do WhatsApp (puro)', () => {
  it('casa o número com e sem o 9 e com o 55', () => {
    expect(phoneKey('5561999998888')).toBe('6199998888');
    expect(phoneKey('556199998888')).toBe('6199998888');
    expect(phoneKey('(61) 99999-8888')).toBe('6199998888');
    expect(phoneKey('123')).toBeNull();
  });
  it('entende a confirmação', () => {
    for (const t of ['OK', 'ok!', 'Okk', 'Sim', 'confirmo', 'Confirmado.', 'tudo certo', 'Tá certo', '👍', '✅', 'ok 👍']) expect(isConfirmation(t)).toBe(true);
    for (const t of ['ok mas sexta não posso', 'não', 'preciso trocar terça', '', 'oi']) expect(isConfirmation(t)).toBe(false);
    for (const t of ['Ok, ciente', 'Lido 👍', 'recebido, obrigado', 'Ciente!', 'entendido']) expect(isConfirmation(t)).toBe(true);
    for (const t of ['obrigado', 'valeu', 'ok mas tenho dúvida', 'ciente, mas não vou poder']) expect(isConfirmation(t)).toBe(false);
  });
});

import { describeWhen, isDue, periodOf, renderTemplate, unknownVariables } from '@/domain/wa-automations';
describe('automações (puro)', () => {
  it('quando roda e período', () => {
    const seg = { frequency: 'SEMANAL', weekdays: [1], monthDay: null };
    const segQui = { frequency: 'SEMANAL', weekdays: [1, 4], monthDay: null };
    const dia5 = { frequency: 'MENSAL', weekdays: [], monthDay: 5 };
    expect([isDue(seg, '2026-10-19'), isDue(seg, '2026-10-20')]).toEqual([true, false]);
    expect([isDue(segQui, '2026-10-22'), isDue(dia5, '2026-11-05'), isDue(dia5, '2026-11-01')]).toEqual([true, true, false]);
    expect(isDue({ frequency: 'DIARIA', weekdays: [], monthDay: null }, '2026-10-21')).toBe(true);
    expect([periodOf(seg, '2026-10-19'), periodOf(segQui, '2026-10-22'), periodOf(dia5, '2026-11-05')]).toEqual(['2026-W43', '2026-10-22', '2026-11']);
    expect(describeWhen(segQui)).toBe('Toda segunda e quinta, 8h');
    expect(describeWhen(dia5)).toBe('Dia 5 de cada mês, 8h');
  });
  it('modelo com variáveis', () => {
    expect(renderTemplate('Oi, {primeiro_nome}!\n\n\n\n{grade}\n{inexistente}fim', { primeiro_nome: 'Ana', grade: 'G' })).toBe('Oi, Ana!\n\nG\nfim');
    expect(unknownVariables('Oi {primeiro_nome} {grade} {escala}', 'PROFESSORES_GRADE')).toEqual(['escala']);
    expect(unknownVariables('Aviso {primeiro_nome}', 'NUMEROS')).toEqual(['primeiro_nome']);
  });
});
