import { createClient } from "./supabase/client";

export async function uploadImage(file: File): Promise<string | null> {
    const supabase = createClient();
    const fileExt = file.name.split(".").pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    // Create a unique file path
    // Since we are likely in a RLS environment, we should consider organizing by user if possible, 
    // but for a simple paste, a flat structure or date-based is fine.
    // Actually, we need to upload to a path.
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
        .from("images")
        .upload(filePath, file);

    if (uploadError) {
        console.error("Error uploading image:", uploadError);
        return null;
    }

    const { data } = supabase.storage.from("images").getPublicUrl(filePath);

    return data.publicUrl;
}
