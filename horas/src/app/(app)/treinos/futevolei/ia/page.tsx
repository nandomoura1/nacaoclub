import type { Metadata } from 'next';
import { AiPage } from '../../_components/AiPage';

export const metadata: Metadata = { title: 'Geração de Treino IA · Futevôlei' };
// A geração pode levar até 1–3 minutos (modelo com raciocínio).
export const maxDuration = 300;

export default async function Page({ searchParams }: { searchParams: Promise<{ modo?: string }> }) {
  return <AiPage slug="futevolei" mode={(await searchParams).modo} />;
}
