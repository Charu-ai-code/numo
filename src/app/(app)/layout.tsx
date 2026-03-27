"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  PiggyBank,
  Users,
  MessageCircle,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfile } from "@/lib/hooks/use-profile";

const navItems = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/budgets", label: "Budgets", icon: PiggyBank },
  { href: "/split", label: "Split", icon: Users },
  { href: "/coach", label: "Coach", icon: MessageCircle },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: profile, isLoading: profileLoading } = useProfile();

  useEffect(() => {
    if (!profileLoading && profile && !profile.onboarding_completed) {
      router.replace("/onboarding");
    }
  }, [profile, profileLoading, router]);

  return (
    <div className="min-h-screen pb-20 lg:pb-0 lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-64 flex-col border-r border-white/[0.06] bg-obsidian z-30">
        <div className="p-6">
          <h1 className="text-2xl font-bold tracking-tight">
            numo<span className="text-accent-green">.</span>
          </h1>
          <p className="text-xs text-muted mt-0.5">
            Your money, both worlds, one app.
          </p>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {navItems.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors",
                  active
                    ? "bg-white/[0.08] text-white font-medium"
                    : "text-muted hover:text-white hover:bg-white/[0.04]"
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3">
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors",
              pathname === "/settings"
                ? "bg-white/[0.08] text-white font-medium"
                : "text-muted hover:text-white hover:bg-white/[0.04]"
            )}
          >
            <Settings className="w-5 h-5" />
            Settings
          </Link>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 flex items-center justify-between px-4 border-b border-white/[0.06] bg-obsidian/80 backdrop-blur-xl z-30">
        <h1 className="text-lg font-bold tracking-tight">
          numo<span className="text-accent-green">.</span>
        </h1>
        <Link href="/settings">
          <Settings className="w-5 h-5 text-muted" />
        </Link>
      </header>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 flex items-center justify-around border-t border-white/[0.06] bg-obsidian/80 backdrop-blur-xl z-30">
        {navItems.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 text-[10px]",
                active ? "text-accent-green" : "text-muted"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Page content */}
      <main className="pt-14 lg:pt-0 min-h-screen">
        <div className="max-w-3xl mx-auto p-4 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
