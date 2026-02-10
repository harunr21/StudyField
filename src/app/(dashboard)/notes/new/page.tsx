"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function NewNotePage() {
    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        const createAndRedirect = async () => {
            const {
                data: { user },
            } = await supabase.auth.getUser();

            if (!user) {
                router.push("/login");
                return;
            }

            const { data, error } = await supabase
                .from("pages")
                .insert({
                    title: "Başlıksız",
                    icon: "📄",
                    user_id: user.id,
                    content: {},
                })
                .select()
                .single();

            if (!error && data) {
                router.replace(`/notes/${data.id}`);
            } else {
                router.push("/notes");
            }
        };

        createAndRedirect();
    }, [router, supabase]);

    return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                <p className="text-sm text-muted-foreground">Yeni not oluşturuluyor...</p>
            </div>
        </div>
    );
}
