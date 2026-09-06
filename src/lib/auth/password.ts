/**
 * Sifre hashleme. Yeni sifreler WebCrypto PBKDF2-SHA256 ile saklanir
 * (Workers'ta yerel calisir, JS CPU suresi tuketmez).
 * Supabase'den tasinan `$2a$/$2b$` bcrypt hash'leri bcryptjs ile dogrulanir
 * ve basarili giriste PBKDF2'ye donusturulur.
 */

const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH_BYTES = 32;

function toBase64(bytes: Uint8Array): string {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
        "deriveBits",
    ]);
    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
        key,
        KEY_LENGTH_BYTES * 8,
    );
    return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const derived = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
    return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(derived)}`;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
}

export function isLegacyBcryptHash(hash: string): boolean {
    return hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
    if (stored.startsWith("pbkdf2$")) {
        const [, iterStr, saltB64, hashB64] = stored.split("$");
        const iterations = Number.parseInt(iterStr, 10);
        if (!iterations || !saltB64 || !hashB64) return false;
        const derived = await pbkdf2(password, fromBase64(saltB64), iterations);
        return timingSafeEqual(derived, fromBase64(hashB64));
    }

    if (isLegacyBcryptHash(stored)) {
        const bcrypt = await import("bcryptjs");
        return bcrypt.compare(password, stored);
    }

    return false;
}
