"use client";

import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Youtube } from "lucide-react";

interface DashboardLayoutProps {
    children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
    const [userEmail, setUserEmail] = useState<string | undefined>(undefined);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMounted(true);
        const getUser = async () => {
            try {
                const supabase = createClient();
                const {
                    data: { user },
                } = await supabase.auth.getUser();
                setUserEmail(user?.email ?? undefined);
            } catch {
                // Supabase not configured yet
            }
        };
        getUser();
    }, []);

    // Prevent hydration mismatch from Radix UI auto-generated IDs
    if (!mounted) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-background">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-500 border-t-transparent" />
            </div>
        );
    }

    return (
        <TooltipProvider>
            <SidebarProvider>
                <AppSidebar userEmail={userEmail} />
                <SidebarInset>
                    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/50 px-4 backdrop-blur-sm bg-background/80">
                        <SidebarTrigger className="-ml-1" />
                        <Separator orientation="vertical" className="mr-2 !h-4" />
                        <div className="flex min-w-0 items-center gap-2">
                            <Youtube className="h-4 w-4 text-red-500" />
                            <span className="truncate text-sm font-medium">YouTube Workspace</span>
                        </div>
                    </header>
                    <main className="flex-1 overflow-auto">
                        {children}
                    </main>
                </SidebarInset>
            </SidebarProvider>
        </TooltipProvider>
    );
}
