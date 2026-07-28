import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AvatarUploader } from "@/components/AvatarUploader";
import {
  clampGoal, formatName, INSTITUTION_MAX, NAME_MAX, sanitizeName,
  useProfile, validateEmail, validateName,
} from "@/lib/profile";
import { toast } from "sonner";

const Onboarding = () => {
  const { profile, update } = useProfile();
  const navigate = useNavigate();
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [institution, setInstitution] = useState(profile.institution);
  const [goal, setGoal] = useState<number | string>(profile.dailyGoalMinutes);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});

  const complete = (e: React.FormEvent) => {
    e.preventDefault();
    const nameError = validateName(name);
    const emailError = validateEmail(email);
    setErrors({ name: nameError ?? undefined, email: emailError ?? undefined });
    if (nameError || emailError) return;

    update({
      name: formatName(name),
      email: email.trim(),
      institution: institution.trim().slice(0, INSTITUTION_MAX),
      dailyGoalMinutes: clampGoal(goal),
      avatar,
      onboarded: true,
    });
    toast.success("You're all set!");
    navigate("/dashboard", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-cream px-4 py-10">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg">
        <Card className="rounded-3xl border-border/50 p-8 shadow-playful">
          <div className="mb-6 flex items-center gap-2 text-sm font-medium text-primary">
            <Sparkles className="h-4 w-4" /> Complete setup
          </div>
          <h1 className="font-display text-3xl font-extrabold">Let's set up your profile</h1>
          <p className="mt-1 text-muted-foreground">
            Tell us your name so SmartLecture can greet you and tailor your study goals.
          </p>

          <form onSubmit={complete} className="mt-7 space-y-5">
            <AvatarUploader value={avatar} name={name} onChange={setAvatar} />

            <div className="space-y-1.5">
              <Label htmlFor="ob-name">Your name *</Label>
              <Input
                id="ob-name"
                autoFocus
                value={name}
                maxLength={NAME_MAX}
                placeholder="e.g. Aditi Sharma"
                aria-invalid={!!errors.name}
                onChange={(e) => { setName(sanitizeName(e.target.value)); setErrors((x) => ({ ...x, name: undefined })); }}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ob-email">Email (optional)</Label>
                <Input
                  id="ob-email"
                  type="email"
                  value={email}
                  placeholder="you@university.edu"
                  aria-invalid={!!errors.email}
                  onChange={(e) => { setEmail(e.target.value); setErrors((x) => ({ ...x, email: undefined })); }}
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-inst">School / University</Label>
                <Input
                  id="ob-inst"
                  value={institution}
                  maxLength={INSTITUTION_MAX}
                  placeholder="e.g. IIT Delhi"
                  onChange={(e) => setInstitution(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ob-goal">Daily study goal (minutes)</Label>
              <Input
                id="ob-goal"
                type="number"
                min={5}
                max={600}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
              />
            </div>

            <Button type="submit" size="lg" className="w-full rounded-full shadow-playful">
              Complete setup <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <button
              type="button"
              onClick={() => { update({ onboarded: true }); navigate("/dashboard", { replace: true }); }}
              className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Skip for now
            </button>
          </form>
        </Card>
      </motion.div>
    </div>
  );
};

export default Onboarding;
