import { createClient } from "@/lib/supabase/server";
import { NotesList } from "@/components/notes/notes-list";
import { Page } from "@/lib/supabase/types";

export default async function NotesPage() {
    const supabase = await createClient();

    // Fetch initial pages (non-archived by default)
    const { data } = await supabase
        .from("pages")
        .select("*")
        .eq("is_archived", false)
        .order("updated_at", { ascending: false });

    return (
        <NotesList initialPages={(data as Page[]) || []} />
    );
}
