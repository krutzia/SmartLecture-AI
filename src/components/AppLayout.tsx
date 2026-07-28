import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { GlobalCommandPalette } from "@/components/GlobalCommandPalette";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SignOutButton } from "@/components/SignOutButton";
import { useIsMobile } from "@/hooks/use-mobile";
import { useProfile } from "@/lib/profile";

export const AppLayout = () => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const isMobile = useIsMobile();
  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  const openPalette = () => {
    // Dispatch a Cmd/Ctrl+K keydown to toggle the palette
    const ev = new KeyboardEvent("keydown", { key: "k", metaKey: isMac, ctrlKey: !isMac, bubbles: true });
    window.dispatchEvent(ev);
  };

  return (
    // On small screens the sidebar is an off-canvas drawer that starts closed,
    // so it never covers the chat / lecture content on first render.
    <SidebarProvider defaultOpen={!isMobile}>
      <GlobalCommandPalette />
      <div className="flex min-h-screen w-full bg-gradient-cream">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center justify-between gap-3 border-b border-border/50 bg-background/70 px-4 backdrop-blur">
            <SidebarTrigger aria-label="Toggle navigation" />

            <button
              onClick={openPalette}
              className="hidden flex-1 max-w-md items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3.5 py-1.5 text-left text-sm text-muted-foreground transition hover:border-primary/40 hover:bg-background sm:flex"
              aria-label="Open command palette"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Search lectures, concepts, cards...</span>
              <kbd className="ml-auto rounded-md border border-border/70 bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold">
                {isMac ? "⌘K" : "Ctrl K"}
              </kbd>
            </button>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={openPalette}
                className="sm:hidden"
                aria-label="Search"
              >
                <Search className="h-4 w-4" />
              </Button>
              <ThemeToggle />
              <span className="hidden text-sm text-muted-foreground sm:inline">{user?.email}</span>
              <SignOutButton labelClassName="hidden sm:inline" />
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};
