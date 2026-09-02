import { iniciais } from '@/lib/format';

/**
 * Avatar do aluno.
 *
 * A disponibilidade de foto na API Tecnofit não pôde ser confirmada
 * (ver docs/tecnofit-integration.md). O fallback com iniciais sobre o azul
 * da marca não é um placeholder feio — é o comportamento padrão até que
 * a origem das fotos seja definida.
 */
export function Avatar({
  nome,
  photoUrl,
  tamanho = 56,
}: {
  nome: string;
  photoUrl?: string | null;
  tamanho?: number;
}) {
  const estilo = { width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.34) };

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt=""
        style={estilo}
        className="shrink-0 rounded-full object-cover ring-2 ring-white"
        loading="lazy"
      />
    );
  }

  return (
    <div
      style={estilo}
      aria-hidden="true"
      className="font-titulo flex shrink-0 items-center justify-center rounded-full bg-linear-to-br from-nacao to-navy font-bold text-white ring-2 ring-white"
    >
      {iniciais(nome)}
    </div>
  );
}
