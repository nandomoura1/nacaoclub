import { addDays } from '@/domain/dates';
import { todayIso } from '@/lib/today';
import type { TecnofitApi, TfCall, TfContact, TfCustomer, TfCustomerSale, TfEmployee, TfUnreceivedSale } from './client';

/**
 * Tecnofit simulada (TECNOFIT_FAKE=1 e testes): mesmos formatos da API real,
 * com nomes claramente de exemplo. Nunca usada em produção.
 */
export interface FakeData {
  customers: (TfCustomer & { contacts: TfContact[]; sales: TfCustomerSale[] })[];
  consultants: TfEmployee[];
  calls: TfCall[];
}

export function sampleData(today = todayIso()): FakeData {
  const sale = (id: string, due: string, open: number, total = open, name = 'Plano Mensal') =>
    ({ id, totalValue: total, openValue: open, saleDate: addDays(due, -30), dueDate: due, saleStatus: open > 0 ? 'overdue' : 'paid', items: [{ name }] });
  return {
    consultants: [
      { id: '9001', name: 'Consultor Exemplo A', types: ['consultant'] },
      { id: '9002', name: 'Consultor Exemplo B', types: ['consultant'] },
    ],
    customers: [
      { id: '101', name: 'Aluno Exemplo Um', status: 'active', contacts: [{ contact: '(61) 99999-0101', type: 'TELEFONE CELULAR' }], sales: [sale('5001', addDays(today, -10), 289.9)] },
      { id: '102', name: 'Aluna Exemplo Dois', status: 'active', contacts: [{ contact: '(61) 3333-0102', type: 'TELEFONE FIXO' }, { contact: '61 98888-0102', type: 'WHATSAPP' }], sales: [sale('5002', addDays(today, 2), 199)] },
      { id: '103', name: 'Aluno Exemplo Três', status: 'blocked', contacts: [{ contact: '(61) 97777-0103', type: 'TELEFONE CELULAR' }], sales: [sale('5003', addDays(today, -40), 150, 450, 'Plano Trimestral')] },
      { id: '104', name: 'Aluna Exemplo Quatro', status: 'restricted', contacts: [], sales: [] },
      { id: '105', name: 'Aluno Exemplo Cinco', status: 'active', contacts: [{ contact: '(61) 96666-0105', type: 'TELEFONE CELULAR' }], sales: [sale('5005', addDays(today, 20), 289.9)] },
    ],
    calls: [
      { customerId: '101', consultantId: '9001', consultantName: 'Consultor Exemplo A', at: addDays(today, -5), done: true, deadline: addDays(today, -5), doneAt: addDays(today, -5) },
      { customerId: '103', consultantId: '9002', consultantName: 'Consultor Exemplo B', at: addDays(today, -20), done: true, deadline: addDays(today, -20), doneAt: addDays(today, -20) },
    ],
  };
}

export class FakeTecnofit implements TecnofitApi {
  constructor(readonly data: FakeData = sampleData()) {}

  private find(id: string) { return this.data.customers.find((c) => c.id === id); }

  async unreceivedSales(startDate: string, endDate: string): Promise<TfUnreceivedSale[]> {
    return this.data.customers.flatMap((c) => c.sales
      .filter((s) => Number(s.openValue) > 0 && String(s.saleDate) >= startDate && String(s.saleDate) <= endDate)
      .map((s) => ({ saleId: s.id, customer: { id: c.id, name: c.name } })));
  }
  async customersByStatus(status: 'blocked' | 'restricted') {
    return this.data.customers.filter((c) => c.status === status).map(({ id, name, status: st }) => ({ id, name, status: st }));
  }
  async customer(id: string) {
    const c = this.find(id);
    return c ? { id: c.id, name: c.name, status: c.status } : null;
  }
  async customerSales(id: string, saleStartDate: string) {
    return (this.find(id)?.sales ?? []).filter((s) => String(s.saleDate) >= saleStartDate);
  }
  async customerContacts(id: string) { return this.find(id)?.contacts ?? []; }
  async consultants() { return this.data.consultants; }
  async calls(startDate: string, endDate: string) {
    return this.data.calls.filter((c) => !c.at || (c.at.slice(0, 10) >= startDate && c.at.slice(0, 10) <= endDate));
  }
}
