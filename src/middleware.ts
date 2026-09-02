import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'nacao_session';

/**
 * Guarda de borda.
 *
 * IMPORTANTE: isto é conveniência de navegação, NÃO é a autorização.
 * O middleware roda no edge e não tem acesso ao banco, então só verifica a
 * PRESENÇA do cookie — um cookie forjado passa por aqui. A validação real
 * (sessão existe, não expirou, não foi revogada, usuário ativo) acontece em
 * getCurrentUser(), no servidor, em toda página e toda rota de API.
 *
 * Ver docs/security.md — "Defesa em camadas".
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const temCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === '/login') {
    if (temCookie) return NextResponse.redirect(new URL('/dashboard', request.url));
    return NextResponse.next();
  }

  if (!temCookie) {
    const url = new URL('/login', request.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  /*
   * Protege as telas. Rotas de API ficam de fora de propósito: elas
   * respondem 401 em JSON via withAuth, o que é o comportamento correto
   * para um cliente fetch — redirecionar uma chamada de API para HTML
   * quebraria o dashboard silenciosamente.
   */
  matcher: ['/dashboard/:path*', '/alunos/:path*', '/admin/:path*', '/login'],
};
