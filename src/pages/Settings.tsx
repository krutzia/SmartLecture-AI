import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { User, Fingerprint } from "lucide-react";
import { SignOutButton } from "@/components/SignOutButton";

const Settings = () => {
  const { user } = useAuth();
  return (
    <div className="container max-w-3xl py-8">
      <h1 className="font-display text-3xl font-extrabold md:text-4xl">Settings</h1>
      <p className="mt-1 text-muted-foreground">Manage your anonymous study session.</p>

      <Card className="mt-8 rounded-3xl border-border/50 p-6 shadow-card">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-hero text-white">
            <User className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <div className="font-display text-lg font-bold">Anonymous session</div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Fingerprint className="h-3.5 w-3.5" />
              <span className="font-mono text-xs">{user?.id}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 border-t border-border pt-6">
          <SignOutButton variant="outline" className="rounded-full" />
        </div>
      </Card>
    </div>
  );
};

export default Settings;
