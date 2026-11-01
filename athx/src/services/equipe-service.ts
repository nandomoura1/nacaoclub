import 'server-only';

import { getServerSupabase } from '@/lib/supabase/server';
import { IS_DEMO } from '@/lib/env';

/**
 * Quem tem acesso de organização.
 *
 * Vem da view athx_equipe, que une duas origens:
 *
 *   AUTORIZADO   e-mail liberado nesta tela. A pessoa pode ainda não ter
 *                criado a conta — é o que `temLogin` informa.
 *   CADASTRADO   acesso antigo, criado direto no banco na instalação.
 *
 * A distinção importa na prática: quando alguém diz "não consigo entrar", a
 * primeira pergunta é se a conta já existe, e a tela responde sem precisar
 * abrir o painel do Supabase.
 */
export interface Colaborador {
  email: string;
  nome: string | null;
  origem: 'AUTORIZADO' | 'CADASTRADO';
  temLogin: boolean;
  criadoEm: string;
}

export async function listarEquipe(): Promise<Colaborador[]> {
  if (IS_DEMO) {
    return [
      {
        email: 'organizacao@exemplo.com.br',
        nome: 'Organização (demonstração)',
        origem: 'CADASTRADO',
        temLogin: true,
        criadoEm: new Date().toISOString(),
      },
    ];
  }

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from('athx_equipe')
    .select('email, nome, origem, tem_login, created_at')
    .order('email');

  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    email: r.email as string,
    nome: (r.nome as string | null) ?? null,
    origem: r.origem as Colaborador['origem'],
    temLogin: Boolean(r.tem_login),
    criadoEm: r.created_at as string,
  }));
}

/** O e-mail de quem está usando o sistema — para a tela não deixar a pessoa se remover. */
export async function emailDeQuemEstaLogado(): Promise<string | null> {
  if (IS_DEMO) return 'organizacao@exemplo.com.br';

  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.email?.toLowerCase() ?? null;
}
