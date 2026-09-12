"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db/context";
import { newId, schema } from "@/db";
import { hashPassword, isLegacyBcryptHash, verifyPassword } from "@/lib/auth/password";
import { endSession, getCurrentUser, requireUser, startSession } from "@/lib/auth/session";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AuthResult {
    error?: string;
}

export async function signUp(emailInput: string, password: string): Promise<AuthResult> {
    const email = emailInput.trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) return { error: "Geçerli bir e-posta girin." };
    if (password.length < 6) return { error: "Şifre en az 6 karakter olmalı." };

    const db = getDb();
    const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
    if (existing) return { error: "Bu e-posta ile zaten bir hesap var." };

    const userId = newId();
    await db.insert(schema.users).values({
        id: userId,
        email,
        password_hash: await hashPassword(password),
    });

    await startSession(userId);
    return {};
}

export async function signIn(emailInput: string, password: string): Promise<AuthResult> {
    const email = emailInput.trim().toLowerCase();
    const db = getDb();
    const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
    if (!user) return { error: "E-posta veya şifre hatalı." };

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return { error: "E-posta veya şifre hatalı." };

    // Supabase'den tasinan bcrypt hash'ini modern formata cevir.
    if (isLegacyBcryptHash(user.password_hash)) {
        await db
            .update(schema.users)
            .set({ password_hash: await hashPassword(password), updated_at: new Date().toISOString() })
            .where(eq(schema.users.id, user.id));
    }

    await startSession(user.id);
    return {};
}

export async function signOut(): Promise<void> {
    await endSession();
    redirect("/login");
}

export async function getSessionInfo(): Promise<{ id: string; email: string } | null> {
    return getCurrentUser();
}

/** Oturum acik kullanicinin sifresini degistirir; mevcut sifre dogrulanir, diger oturumlar kapatilir. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<AuthResult> {
    const user = await requireUser();
    if (newPassword.length < 6) return { error: "Yeni şifre en az 6 karakter olmalı." };
    if (newPassword === currentPassword) return { error: "Yeni şifre mevcut şifreyle aynı olamaz." };

    const db = getDb();
    const row = await db.query.users.findFirst({ where: eq(schema.users.id, user.id) });
    if (!row) return { error: "Kullanıcı bulunamadı." };

    const ok = await verifyPassword(currentPassword, row.password_hash);
    if (!ok) return { error: "Mevcut şifre hatalı." };

    await db
        .update(schema.users)
        .set({ password_hash: await hashPassword(newPassword), updated_at: new Date().toISOString() })
        .where(eq(schema.users.id, user.id));

    // Diger cihazlardaki oturumlari kapat, bu oturumu yenile.
    await db.delete(schema.sessions).where(eq(schema.sessions.user_id, user.id));
    await startSession(user.id);
    return {};
}
