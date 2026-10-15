import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_ADMIN_PAGES = ["/admin/login", "/admin/set-password"];

/**
 * Admin area only: keeps the Supabase session fresh, marks every admin page
 * no-index, and sends logged-out visitors to the login page. This is an early,
 * optimistic check; every page and API route checks the staff role again.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const withPath = () => {
    const h = new Headers(request.headers);
    h.set("x-admin-path", pathname + search);
    return h;
  };
  let response = NextResponse.next({ request: { headers: withPath() } });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: withPath() } });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPage = !pathname.startsWith("/api/");
  if (isPage && !user && !PUBLIC_ADMIN_PAGES.some((p) => pathname.startsWith(p))) {
    const login = request.nextUrl.clone();
    login.pathname = "/admin/login";
    login.search = `?next=${encodeURIComponent(pathname + search)}`;
    response = NextResponse.redirect(login);
  }

  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
