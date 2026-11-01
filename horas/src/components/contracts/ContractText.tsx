import { contractBlocks, type Run } from '@/domain/contracts';
import { cn } from '@/lib/cn';

const runs = (rs: Run[]) => rs.map((r, i) => (r.bold ? <strong key={i} className="font-semibold text-tinta">{r.text}</strong> : <span key={i}>{r.text}</span>));

/** Texto do contrato na tela (mesma estrutura do PDF): títulos, cláusulas, listas e **negrito**. */
export function ContractText({ text, className }: { text: string; className?: string }) {
  const blocks = contractBlocks(text);
  const out: React.ReactNode[] = [];
  let list: React.ReactNode[] = [];
  const flush = () => { if (list.length) { out.push(<ul key={`ul${out.length}`} className="ml-5 list-disc space-y-1 marker:text-nacao">{list}</ul>); list = []; } };
  blocks.forEach((b, i) => {
    if (b.kind === 'li') { list.push(<li key={i}>{runs(b.runs)}</li>); return; }
    flush();
    if (b.kind === 'h1') out.push(<h2 key={i} className="pt-1 text-center text-base font-extrabold uppercase text-navy">{runs(b.runs)}</h2>);
    else if (b.kind === 'h2') out.push(<h3 key={i} className="pt-2 font-bold text-tinta">{runs(b.runs)}</h3>);
    else out.push(<p key={i}>{runs(b.runs)}</p>);
  });
  flush();
  return <div className={cn('space-y-2.5 text-sm leading-relaxed text-tinta', className)}>{out}</div>;
}
