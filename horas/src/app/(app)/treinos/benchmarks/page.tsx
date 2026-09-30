import { redirect } from 'next/navigation';

/** Endereço antigo: os benchmarks agora são por modalidade. */
export default function Page() {
  redirect('/treinos/crossfit/benchmarks');
}
