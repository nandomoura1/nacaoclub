/** Formatações compartilhadas. Sempre pt-BR, sempre curtas. */

export function horaCurta(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function horaComSegundos(date: Date): string {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function dataCompleta(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** "Hoje, 18:42" — o formato que o professor lê sem pensar. */
export function ultimaVisita(iso: string | null): string {
  if (!iso) return 'Sem registro';

  const data = new Date(iso);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dia = new Date(data);
  dia.setHours(0, 0, 0, 0);

  const diffDias = Math.round((hoje.getTime() - dia.getTime()) / 86_400_000);
  const hora = horaCurta(iso);

  if (diffDias === 0) return `Hoje, ${hora}`;
  if (diffDias === 1) return `Ontem, ${hora}`;
  if (diffDias < 7) return `Há ${diffDias} dias`;
  return `${dataCompleta(iso)}, ${hora}`;
}

/** "1 ano e 8 meses" — como uma pessoa diria, não "20 meses". */
export function tempoComoAluno(meses: number | null): string {
  if (meses === null) return 'Não informado';
  if (meses < 1) return 'Menos de um mês';
  if (meses < 12) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`;

  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const parteAnos = `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
  if (resto === 0) return parteAnos;
  return `${parteAnos} e ${resto} ${resto === 1 ? 'mês' : 'meses'}`;
}

/** Iniciais para o avatar quando não há foto disponível. */
export function iniciais(nomeCompleto: string): string {
  const partes = nomeCompleto.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase();
  return `${partes[0]![0]}${partes[partes.length - 1]![0]}`.toUpperCase();
}

export function primeiroNome(nomeCompleto: string, firstName?: string | null): string {
  return firstName || nomeCompleto.trim().split(/\s+/)[0] || nomeCompleto;
}
