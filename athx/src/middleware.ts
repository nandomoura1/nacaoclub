import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Middleware — renova a sessão do Supabase e protege a área administrativa.
 *
 * O lançamento de resultados NUNCA fica disponível publicamente (§17). Aqui
 * fazemos a barreira de navegação; a barreira real é o RLS no banco, que
 * recusa a escrita mesmo se alguém chamar a API direto.
 */
export async function middleware(request: NextRequest) {
  const demo = ['true', '1', 'yes', 'on'].includes(
    String(process.env.NEXT_PUBLIC_DEMO_MODE ?? '').toLowerCase(),
  );

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Sem Supabase configurado (modo demo) não há sessão a renovar nem login
  // possível — o admin mostra o aviso de somente leitura.
  if (demo || !url || !anonKey) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(items) {
        for (const { name, value } of items) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of items) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() revalida o token no servidor — não confiar no cookie sozinho.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/admin') && !user) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.searchParams.set('redirect', pathname);
    return NextResponse.redirect(login);
  }

  if (pathname === '/login' && user) {
    const admin = request.nextUrl.clone();
    admin.pathname = '/admin';
    admin.search = '';
    return NextResponse.redirect(admin);
  }

  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/login'],
};
