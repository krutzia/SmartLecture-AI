import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LogOut, User, Mail } from "lucide-react";

const Settings = () => {
  const { user, signOut } = useAuth();
  return (
    <div className="container max-w-3xl py-8">
      <h1 className="font-display text-3xl font-extrabold md:text-4xl">Settings</h1>
      <p className="mt-1 text-muted-foreground">Manage your account.</p>

      <Card className="mt-8 rounded-3xl border-border/50 p-6 shadow-card">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-hero text-white">
            <User className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <div className="font-display text-lg font-bold">Your account</div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              {user?.email}
            </div>
          </div>
        </div>

        <div className="mt-6 border-t border-border pt-6">
          <Button variant="outline" onClick={signOut} className="rounded-full">
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default Settings;
