import type { Patrocinador } from '@/types/domain';

/**
 * A FAIXA DE PATROCINADORES.
 *
 * O pedido foi "sem poluir o site", e é uma restrição de verdade: o
 * leaderboard existe para o atleta achar a dupla dele no meio de uma prova,
 * não para vender espaço. Três decisões saem daí:
 *
 *   TODAS DO MESMO TAMANHO  a cota decide a ORDEM, não o tamanho. Logomarcas
 *                           de tamanhos diferentes viram bagunça visual.
 *   DESSATURADAS EM REPOUSO  no rodapé, as marcas ficam em cinza e ganham cor
 *                           ao passar o dedo ou o mouse. Presentes, não
 *                           gritando por cima do resultado.
 *   NADA QUANDO NÃO HÁ      sem parceiro ativo, o componente não desenha
 *                           título, moldura nem espaço vazio.
 *
 * No TELÃO é o contrário: lá a faixa aparece em cor plena e maior, porque
 * aquela tela fica horas projetada num ginásio cheio e é exatamente o que o
 * patrocinador comprou.
 */
export function Patrocinadores({
  patrocinadores,
  variante = 'rodape',
}: {
  patrocinadores: readonly Patrocinador[];
  variante?: 'rodape' | 'telao';
}) {
  const ativos = [...patrocinadores]
    .filter((p) => p.ativo)
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));

  if (ativos.length === 0) return null;

  const noTelao = variante === 'telao';

  return (
    <section
      aria-label="Patrocinadores e parceiros"
      className={noTelao ? 'w-full' : 'no-print w-full border-t border-white/[0.07] pt-6'}
    >
      <p
        className={`text-center font-display font-bold tracking-kicker uppercase ${
          noTelao ? 'text-[0.7vw] text-white/45' : 'text-[9px] text-white/30'
        }`}
      >
        {ativos.length === 1 ? 'Parceiro' : 'Parceiros'} da etapa
      </p>

      <ul
        className={`mt-3 flex flex-wrap items-center justify-center ${
          noTelao ? 'gap-x-[3vw] gap-y-[1.5vh]' : 'gap-x-7 gap-y-4'
        }`}
      >
        {ativos.map((p) => {
          /* O fundo claro atrás da marca não é enfeite: boa parte das
             logomarcas é escura, e sobre o navy do site elas sumiriam. */
          const marca = (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.logoUrl}
              alt={p.nome}
              loading="lazy"
              className={
                noTelao
                  ? 'max-h-[5vh] w-auto object-contain'
                  : 'max-h-9 w-auto object-contain opacity-70 transition group-hover:opacity-100'
              }
            />
          );

          return (
            <li key={p.id} className="flex items-center">
              {p.site ? (
                <a
                  href={p.site}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  title={p.nome}
                  className={`group block rounded-lg bg-white/90 p-2 ${
                    noTelao ? 'px-[1vw]' : 'grayscale transition hover:grayscale-0'
                  }`}
                >
                  {marca}
                </a>
              ) : (
                <span
                  title={p.nome}
                  className={`group block rounded-lg bg-white/90 p-2 ${
                    noTelao ? 'px-[1vw]' : 'grayscale'
                  }`}
                >
                  {marca}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
