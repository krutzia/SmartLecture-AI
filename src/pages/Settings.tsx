import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Fingerprint, Save, Check } from "lucide-react";
import { SignOutButton } from "@/components/SignOutButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AvatarUploader } from "@/components/AvatarUploader";
import {
  clampGoal, formatName, INSTITUTION_MAX, NAME_MAX, sanitizeName,
  useProfile, validateEmail, validateName,
} from "@/lib/profile";
import { toast } from "sonner";

const Settings = () => {
  const { user } = useAuth();
  const { profile, update } = useProfile();

  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [institution, setInstitution] = useState(profile.institution);
  const [goal, setGoal] = useState<number | string>(profile.dailyGoalMinutes);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [saved, setSaved] = useState(false);

  // Keep the form in sync if the profile changes elsewhere (other tab/session reset).
  useEffect(() => {
    setName(profile.name);
    setEmail(profile.email);
    setInstitution(profile.institution);
    setGoal(profile.dailyGoalMinutes);
  }, [profile.name, profile.email, profile.institution, profile.dailyGoalMinutes]);

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    const nameError = name.trim() ? validateName(name) : null; // name optional here
    const emailError = validateEmail(email);
    setErrors({ name: nameError ?? undefined, email: emailError ?? undefined });
    if (nameError || emailError) return;

    update({
      name: formatName(name),
      email: email.trim(),
      institution: institution.trim().slice(0, INSTITUTION_MAX),
      dailyGoalMinutes: clampGoal(goal),
    });
    setSaved(true);
    toast.success("Profile updated");
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="container max-w-3xl py-8">
      <h1 className="font-display text-3xl font-extrabold md:text-4xl">Settings</h1>
      <p className="mt-1 text-muted-foreground">Manage your profile and study session.</p>

      <Card className="mt-8 rounded-3xl border-border/50 p-6 shadow-card">
        {/* Avatar saves instantly so the header updates live */}
        <AvatarUploader
          value={profile.avatar}
          name={name || profile.name}
          onChange={(avatar) => { update({ avatar }); toast.success(avatar ? "Photo updated" : "Photo removed"); }}
        />

        <div className="mt-4 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Fingerprint className="h-3.5 w-3.5" />
          <span className="font-mono text-xs">{user?.id}</span>
        </div>

        <form onSubmit={onSave} className="mt-6 grid gap-4 border-t border-border pt-6 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Display name</Label>
            <Input
              id="name"
              value={name}
              maxLength={NAME_MAX}
              placeholder="e.g. Aditi Sharma"
              aria-invalid={!!errors.name}
              onChange={(e) => { setName(sanitizeName(e.target.value)); setErrors((x) => ({ ...x, name: undefined })); }}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email (optional)</Label>
            <Input
              id="email"
              type="email"
              value={email}
              placeholder="you@university.edu"
              aria-invalid={!!errors.email}
              onChange={(e) => { setEmail(e.target.value); setErrors((x) => ({ ...x, email: undefined })); }}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="institution">School / University</Label>
            <Input
              id="institution"
              value={institution}
              maxLength={INSTITUTION_MAX}
              placeholder="e.g. IIT Delhi"
              onChange={(e) => setInstitution(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="goal">Daily study goal (minutes)</Label>
            <Input
              id="goal"
              type="number"
              min={5}
              max={600}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
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
