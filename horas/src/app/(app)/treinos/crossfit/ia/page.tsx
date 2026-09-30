import type { Metadata } from 'next';
import { AiPage } from '../../_components/AiPage';

export const metadata: Metadata = { title: 'Geração de Treino IA · CrossFit' };
// A geração pode levar até 1–2 minutos (modelo com raciocínio).
export const maxDuration = 300;

export default function Page() {
  return <AiPage slug="crossfit" />;
}
