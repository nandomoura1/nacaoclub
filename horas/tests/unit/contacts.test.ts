import { describe, expect, it } from 'vitest';
import { contactsText, formatPhone, parseContactLines, samePhone, waNumber } from '@/domain/contacts';

describe('Contatos (puro)', () => {
  it('formata e monta o número do WhatsApp', () => {
    expect(formatPhone('61900001111')).toBe('(61) 90000-1111');
    expect(formatPhone('+55 61 3000-1111')).toBe('(61) 3000-1111');
    expect(formatPhone('190')).toBe('190');
    expect(waNumber('61 90000-1111')).toBe('5561900001111');
    expect(waNumber('190')).toBeNull();
    expect(samePhone('(61) 90000-1111', '5561900001111')).toBe(true);
    expect(samePhone('61 90000-1111', '61 90000-2222')).toBe(false);
  });

  it('importa linhas soltas: título vira grupo, telefones achados na linha', () => {
    const { rows, skipped } = parseContactLines([
      'SERVIÇOS TERCEIRIZADOS',
      'Studio Exemplo - Ana 61 90000-1111',
      'Fornecedor Teste: (61) 90000-2222 / 61 3000-3333',
      '',
      'KIDS',
      'Monitora Fulana 61900004444',
    ].join('\n'), 'Outros');
    expect(skipped).toEqual([]);
    expect(rows.map((r) => [r.name, r.groupName, r.phone, r.phone2])).toEqual([
      ['Studio Exemplo - Ana', 'SERVIÇOS TERCEIRIZADOS', '61 90000-1111', null],
      ['Fornecedor Teste', 'SERVIÇOS TERCEIRIZADOS', '(61) 90000-2222', '61 3000-3333'],
      ['Monitora Fulana', 'KIDS', '61900004444', null],
    ]);
  });

  it('importa colunas (TAB ou ;) com grupo padrão', () => {
    const { rows } = parseContactLines('Vigia\t\tPortaria\nLoja X;61 90000-5555;;Loja X Ltda;só manhã', 'Serviços');
    expect(rows).toEqual([
      { name: 'Vigia', groupName: 'Portaria', company: null, phone: null, phone2: null, note: null },
      { name: 'Loja X', groupName: 'Serviços', company: 'Loja X Ltda', phone: '61 90000-5555', phone2: null, note: 'só manhã' },
    ]);
  });

  it('texto da lista por grupo', () => {
    expect(contactsText([
      { name: 'A', group: 'G1', phone: '61900001111', company: 'Emp' },
      { name: 'B', group: 'G1', phone: null },
      { name: 'C', group: 'G2', phone: '6130001111', phone2: '61900002222', note: 'tarde' },
    ], 'T')).toBe('*T*\n\n*G1*\nA — Emp: (61) 90000-1111\nB: sem telefone\n\n*G2*\nC: (61) 3000-1111 / (61) 90000-2222 (tarde)');
  });
});
