import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { needsSetup } from '@/server/services/setup-service';
import { SetupForm } from './SetupForm';

export const metadata: Metadata = { title: 'Primeiro acesso' };
export const dynamic = 'force-dynamic';

export default async function PrimeiroAcessoPage() {
  if (!(await needsSetup())) redirect('/login');
  return (
    <main className="grid min-h-dvh place-items-center bg-navy px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-white"><Logo /></div>
        <div className="rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
          <h1 className="text-xl font-extrabold text-navy">Primeiro acesso</h1>
          <p className="mb-6 mt-1 text-sm text-tinta-suave">
            Cria a estrutura da Nação (áreas, modalidades, feriados) e o seu usuário administrador. Esta tela some depois de usada.
          </p>
          <SetupForm />
        </div>
      </div>
    </main>
  );
}
