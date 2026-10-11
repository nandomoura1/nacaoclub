/** Exportação JSON sintética de um quadro do Trello (formato real, dados fictícios). */
export function trelloExport(suffix = '') {
  const id = (s: string) => `${s}${suffix}`.padEnd(24, '0').slice(0, 24);
  return {
    id: id('board'), name: 'Marketing Nação (exemplo)', shortUrl: 'https://trello.com/b/AbC123',
    lists: [
      { id: id('l1'), name: 'Ideias', closed: false, pos: 1 },
      { id: id('l2'), name: 'A fazer', closed: false, pos: 2 },
      { id: id('l3'), name: 'Fazendo', closed: false, pos: 3 },
      { id: id('l4'), name: 'Aprovação', closed: false, pos: 4 },
      { id: id('l5'), name: 'Concluído ✅', closed: false, pos: 5 },
      { id: id('l6'), name: 'Lista velha', closed: true, pos: 6 },
    ],
    labels: [
      { id: id('lb1'), name: 'Design', color: 'purple' },
      { id: id('lb2'), name: 'Reels', color: 'green' },
      { id: id('lb3'), name: 'Urgente', color: 'red' },
      { id: id('lb4'), name: '', color: 'blue' },
    ],
    members: [
      { id: id('m1'), fullName: 'Pessoa Um', username: 'pessoa1' },
      { id: id('m2'), fullName: 'Pessoa Dois', username: 'pessoa2' },
    ],
    cards: [
      { id: id('c1'), name: 'Arte do Celebration', desc: 'Peça principal 1080x1350', idList: id('l3'), closed: false, due: '2026-10-20T02:00:00.000Z', dueComplete: false, idMembers: [id('m1'), id('m2')], idLabels: [id('lb1'), id('lb3')], idChecklists: [id('ck1')], attachments: [{ name: 'Referência', url: 'https://drive.google.com/x' }, { name: 'sem link', url: 'ftp://x' }], shortUrl: 'https://trello.com/c/c1', pos: 1 },
      { id: id('c2'), name: 'Gravar reels do treino de sábado', desc: '', idList: id('l2'), closed: false, due: null, dueComplete: false, idMembers: [], idLabels: [id('lb2')], idChecklists: [], attachments: [], shortUrl: 'https://trello.com/c/c2', pos: 2 },
      { id: id('c3'), name: 'Aviso no WhatsApp da mudança de horário', desc: '', idList: id('l1'), closed: false, due: null, dueComplete: false, idMembers: [id('m2')], idLabels: [], attachments: [], pos: 1 },
      { id: id('c4'), name: 'Post de boas-vindas', desc: '', idList: id('l4'), closed: false, due: '2026-10-15T12:00:00.000Z', dueComplete: true, idMembers: [], idLabels: [id('lb4')], attachments: [], pos: 1 },
      { id: id('c5'), name: 'Card arquivado', desc: '', idList: id('l2'), closed: true, idMembers: [], idLabels: [], attachments: [], pos: 9 },
      { id: id('c6'), name: 'Card em lista arquivada', desc: '', idList: id('l6'), closed: false, idMembers: [], idLabels: [], attachments: [], pos: 1 },
      { id: id('c7'), name: 'Ideia solta', desc: 'algo', idList: id('l1'), closed: false, idMembers: [], idLabels: [], attachments: [], pos: 2 },
    ],
    checklists: [
      { id: id('ck1'), idCard: id('c1'), name: 'Entregas', checkItems: [{ name: 'Feed', state: 'complete', pos: 2 }, { name: 'Stories', state: 'incomplete', pos: 1 }] },
      // formato antigo: sem idChecklists no card
      { id: id('ck2'), idCard: id('c7'), name: 'Passos', checkItems: [{ name: 'Rascunho', state: 'incomplete', pos: 1 }] },
    ],
    actions: [
      { type: 'commentCard', date: '2026-10-10T13:00:00.000Z', memberCreator: { fullName: 'Pessoa Um' }, data: { text: 'Primeira versão no Drive', card: { id: id('c1') } } },
      { type: 'updateCard', date: '2026-10-10T14:00:00.000Z', data: { card: { id: id('c1') } } },
    ],
  };
}
