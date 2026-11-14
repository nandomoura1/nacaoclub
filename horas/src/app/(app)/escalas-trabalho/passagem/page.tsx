import { redirect } from 'next/navigation';

/** Passagem virou Benefícios (passagem + alimentação): o endereço antigo continua funcionando. */
export default async function PassagemPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes } = await searchParams;
  redirect(`/escalas-trabalho/beneficios${mes ? `?mes=${encodeURIComponent(mes)}` : ''}`);
}
