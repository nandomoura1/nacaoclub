import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'nacao_horas_session';

/**
 * Guarda de borda — conveniência de navegação, NÃO autorização.
 * Só verifica a presença do cookie (o edge não acessa o banco). A validação
 * real acontece em getPrincipal(), no servidor, em toda página e ação.
 */
export function middleware(request: NextRequest) {
  const hasCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasCookie) {
    const url = new URL('/login', request.url);
    const next = request.nextUrl.pathname;
    if (next !== '/') url.searchParams.set('next', next);
    return NextResponse.redirect(url);
  }
  // Repassa o caminho para o layout do servidor (troca de senha obrigatória).
  const forwarded = new Headers(request.headers);
  forwarded.set('x-pathname', request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: forwarded } });
}

export const config = {
  // Tudo, menos login, assets e arquivos do Next.
  matcher: ['/((?!login|primeiro-acesso|_next/|icon.svg|favicon.ico|robots.txt).*)'],
};
