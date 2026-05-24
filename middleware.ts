import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_ROUTES = ["/dashboard", "/onboarding", "/admin"];

const RATE_LIMITED_ROUTES = [
  { pattern: /^\/api\/stripe\/checkout/, limit: 10, window: 60000 },
  { pattern: /^\/api\/download\//, limit: 30, window: 60000 },
  { pattern: /^\/api\/webhooks\//, limit: 100, window: 60000 },
  { pattern: /^\/login$/, limit: 5, window: 60000 },
  { pattern: /^\/signup$/, limit: 5, window: 60000 },
  { pattern: /^\/api\/auth\//, limit: 10, window: 60000 },
];

const rateLimitCache = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(
  ip: string,
  route: string,
  limit: number,
  window: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const key = `${ip}:${route}`;
  const now = Date.now();
  const entry = rateLimitCache.get(key);

  if (!entry || entry.resetAt < now) {
    rateLimitCache.set(key, { count: 1, resetAt: now + window });
    return { allowed: true, remaining: limit - 1, resetAt: now + window };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const ip = getClientIp(request);

  for (const route of RATE_LIMITED_ROUTES) {
    if (route.pattern.test(pathname)) {
      const result = checkRateLimit(ip, pathname, route.limit, route.window);
      if (!result.allowed) {
        return new NextResponse(
          JSON.stringify({ error: "Trop de requêtes. Réessayez plus tard." }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
            },
          }
        );
      }
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtected = PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
