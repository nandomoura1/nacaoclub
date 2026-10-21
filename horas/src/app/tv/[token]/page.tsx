import type { Metadata } from 'next';
import { todayIso } from '@/lib/today';
import { tvByToken } from '@/server/services/tv-service';
import { TvBoard } from '../TvBoard';

export const metadata: Metadata = { title: 'Treino do dia' };
export const dynamic = 'force-dynamic';

/** Link fixo da TV do box (sem login): mostra sozinho o treino do dia. Atualiza a cada minuto. */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = await tvByToken(token, todayIso());
  if (!v) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-[#022B57] text-center font-titulo text-white">
        <div><p className="text-[5vh] font-extrabold">Tela não encontrada</p><p className="mt-2 text-[2.4vh] text-white/70">Este link de TV foi trocado ou desativado. Peça o link novo em Treinos → Telas de TV.</p></div>
      </div>
    );
  }
  return <TvBoard v={v} refreshSeconds={60} />;
}
