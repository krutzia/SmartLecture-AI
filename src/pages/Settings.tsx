import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { User, Fingerprint, Save, Check } from "lucide-react";
import { SignOutButton } from "@/components/SignOutButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProfile, Profile } from "@/lib/profile";
import { toast } from "sonner";

const Settings = () => {
  const { user } = useAuth();
  const { profile, update } = useProfile();
  const [form, setForm] = useState<Profile>(profile);
  const [saved, setSaved] = useState(false);

  useEffect(() => setForm(profile), [profile]);

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim().slice(0, 60);
    const email = form.email.trim().slice(0, 255);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Please enter a valid email address");
      return;
    }
    const goal = Math.min(600, Math.max(5, Number(form.dailyGoalMinutes) || 30));
    update({ name, email, institution: form.institution.trim().slice(0, 100), dailyGoalMinutes: goal });
    setSaved(true);
    toast.success("Profile updated");
    setTimeout(() => setSaved(false), 2000);
  };

  const initials = form.name.trim()
    ? form.name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()
    : null;

  return (
    <div className="container max-w-3xl py-8">
      <h1 className="font-display text-3xl font-extrabold md:text-4xl">Settings</h1>
      <p className="mt-1 text-muted-foreground">Manage your profile and study session.</p>

      <Card className="mt-8 rounded-3xl border-border/50 p-6 shadow-card">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-hero font-display text-lg font-extrabold text-white">
            {initials ?? <User className="h-6 w-6" />}
          </div>
          <div className="flex-1">
            <div className="font-display text-lg font-bold">
              {profile.name.trim() || "Anonymous session"}
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Fingerprint className="h-3.5 w-3.5" />
              <span className="font-mono text-xs">{user?.id}</span>
            </div>
          </div>
        </div>

        <form onSubmit={onSave} className="mt-6 grid gap-4 border-t border-border pt-6 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Display name</Label>
            <Input
              id="name"
              value={form.name}
              maxLength={60}
              placeholder="e.g. Aditi Sharma"
              onChange={(e) => set("name", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email (optional)</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              maxLength={255}
              placeholder="you@university.edu"
              onChange={(e) => set("email", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="institution">School / University</Label>
            <Input
              id="institution"
              value={form.institution}
              maxLength={100}
              placeholder="e.g. IIT Delhi"
              onChange={(e) => set("institution", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="goal">Daily study goal (minutes)</Label>
            <Input
              id="goal"
              type="number"
              min={5}
              max={600}
              value={form.dailyGoalMinutes}
              onChange={(e) => set("dailyGoalMinutes", Number(e.target.value))}
            />
          </div>

          <div className="sm:col-span-2">
            <Button type="submit" className="rounded-full">
              {saved ? <Check className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
              {saved ? "Saved" : "Save profile"}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Your profile stays on this device and is cleared when you sign out.
            </p>
          </div>
        </form>

        <div className="mt-6 border-t border-border pt-6">
          <SignOutButton variant="outline" className="rounded-full" />
        </div>
      </Card>
    </div>
  );
};

export default Settings;
