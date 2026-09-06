import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard-layout";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
    const user = await getCurrentUser();
    if (!user) {
        redirect("/login");
    }
    return <DashboardLayout userEmail={user.email}>{children}</DashboardLayout>;
}
