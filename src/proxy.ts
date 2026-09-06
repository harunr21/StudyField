import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session-core";

/**
 * Hafif yonlendirme katmani: sadece oturum cerezinin varligina bakar.
 * Gercek dogrulama (D1'de oturum sorgusu) sayfa layout'unda ve her Server Action'da yapilir.
 */
export function proxy(request: NextRequest) {
    const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
    const { pathname } = request.nextUrl;

    if (!hasSession && !pathname.startsWith("/login")) {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.search = "";
        return NextResponse.redirect(url);
    }

    if (hasSession && pathname.startsWith("/login")) {
        const url = request.nextUrl.clone();
        url.pathname = "/youtube";
        url.search = "";
        return NextResponse.redirect(url);
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|manifest.json|icon.svg|ws/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};
