'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, TriangleAlert, Wand2 } from 'lucide-react';
import type { MudancaDeCodigo } from '@/app/admin/actions';
import { padronizarCodigos, simularPadronizacao } from '@/app/admin/actions';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

/**
 * O botão que resolve código repetido e ordem repetida de uma vez.
 *
 * Mostra o PLANO antes de gravar. Renomear prova muda o rótulo de colunas
 * que a organização já conhece de cor e que podem estar impressas numa
 * súmula na prancheta — ninguém deve descobrir a troca depois do fato.
 */
export function PadronizarCodigos() {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [plano, setPlano] = useState<MudancaDeCodigo[] | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; message: string } | null>(null);

  const simular = () =>
    startTransition(async () => {
      const r = await simularPadronizacao();
      if (!r.ok) {
        setAviso(r);
        return;
      }
      setPlano(r.mudancas);
    });

  const aplicar = () =>
    startTransition(async () => {
      const r = await padronizarCodigos();
      setAviso(r);
      setPlano(null);
      if (r.ok) router.refresh();
    });

  return (
    <>
      <Button variant="secondary" size="sm" onClick={simular} disabled={pendente}>
        <Wand2 size={14} /> {pendente && !plano ? 'Conferindo…' : 'Padronizar códigos'}
      </Button>

      {aviso ? (
        <span
          className={`inline-flex items-center gap-1.5 text-[13px] ${
            aviso.ok ? 'text-emerald-300' : 'text-red-300'
          }`}
        >
          {aviso.ok ? <CheckCircle2 size={14} /> : <TriangleAlert size={14} />}
          {aviso.message}
        </span>
      ) : null}

      <Modal
        open={plano !== null}
        onClose={() => setPlano(null)}
        title="Padronizar códigos das provas"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPlano(null)} disabled={pendente}>
              Cancelar
            </Button>
            <Button onClick={aplicar} disabled={pendente || (plano?.length ?? 0) === 0}>
              {pendente ? 'Aplicando…' : 'Aplicar'}
            </Button>
          </>
        }
      >
        {plano && plano.length === 0 ? (
          <p className="text-sm text-white/70">
            Os códigos já estão no padrão. Nada a fazer.
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-white/70">
              Cada prova passa a se chamar pelo <strong>número do seu WOD</strong> mais uma letra,
              na ordem em que aparece. As ordens repetidas também são arrumadas.
            </p>

            <ul className="space-y-1.5">
              {plano?.map((m, i) => (
                <li
                  key={i}
                  className="flex items-center gap-3 rounded-lg bg-white/[0.05] px-3 py-2 text-[13px]"
                >
                  <span className="font-display text-[10px] font-bold tracking-wider text-white/40 uppercase">
                    WOD {m.wod}
                  </span>
                  <span className="tnum font-display font-bold">{m.de}</span>
                  <ArrowRight size={13} className="text-white/30" />
                  <span className="tnum font-display font-bold text-nacao-cyan">{m.para}</span>
                  {m.ordemDe !== m.ordemPara ? (
                    <span className="ml-auto text-[12px] text-white/40">
                      ordem {m.ordemDe} → {m.ordemPara}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>

            <p className="rounded-xl bg-emerald-500/10 px-3.5 py-3 text-[13px] text-emerald-200">
              <strong>Nenhum resultado é alterado.</strong> O lançamento aponta para a prova, não
              para o código — a classificação continua exatamente como está. O que muda é o rótulo
              das colunas e dos campos da súmula.
            </p>

            <p className="text-[13px] text-white/45">
              Se já imprimiu súmulas com os códigos antigos, imprima de novo depois.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
