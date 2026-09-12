"use client";

import { useMemo } from "react";
import { extractVideoIds } from "@/lib/youtube";
import { AlertCircle, CheckCircle2 } from "lucide-react";

interface VideoLinkInputProps {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    autoFocus?: boolean;
}

/** Cok satirli YouTube video linki kutusu; gecerli/gecersiz link sayisini aninda gosterir. */
export function VideoLinkInput({ value, onChange, disabled, autoFocus }: VideoLinkInputProps) {
    const parsed = useMemo(() => extractVideoIds(value), [value]);

    return (
        <div className="space-y-2">
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                autoFocus={autoFocus}
                rows={6}
                placeholder={"https://www.youtube.com/watch?v=...\nhttps://youtu.be/...\nHer satıra bir link"}
                className="w-full text-sm font-mono bg-background/50 border border-border/50 rounded-xl px-3 py-2 resize-y placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-red-500/50 disabled:opacity-60"
            />
            <div className="flex flex-wrap items-center gap-3 text-xs">
                {parsed.ids.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-emerald-500">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {parsed.ids.length} geçerli video
                    </span>
                )}
                {parsed.invalid.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-amber-500" title={parsed.invalid.join("\n")}>
                        <AlertCircle className="h-3.5 w-3.5" />
                        {parsed.invalid.length} tanınmayan girdi atlanacak
                    </span>
                )}
                {parsed.ids.length === 0 && parsed.invalid.length === 0 && (
                    <span className="text-muted-foreground">watch?v=, youtu.be, shorts ve live linkleri desteklenir.</span>
                )}
            </div>
        </div>
    );
}

export { extractVideoIds };
