import type { Metadata } from 'next';
import { BenchmarksPage } from '../../_components/BenchmarksPage';

export const metadata: Metadata = { title: 'Benchmarks · Funcional' };

export default function Page() {
  return <BenchmarksPage slug="funcional" />;
}
