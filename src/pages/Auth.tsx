import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { z } from "zod";

const schema = z.object({
  email: z.string().trim().email("Please enter a valid email").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(72),
});

const Auth = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { signIn, signUp, user } = useAuth();
  const [tab, setTab] = useState(params.get("mode") === "signup" ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate("/dashboard", { replace: true });
  }, [user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast({ title: "Check your input", description: parsed.error.errors[0].message, variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = tab === "signup"
      ? await signUp(parsed.data.email, parsed.data.password)
      : await signIn(parsed.data.email, parsed.data.password);
    setLoading(false);

    if (error) {
      const msg = error.message.includes("already") ? "Account already exists. Try logging in." : error.message;
      toast({ title: "Oops", description: msg, variant: "destructive" });
      return;
    }
    toast({ title: tab === "signup" ? "Welcome aboard! 🎉" : "Welcome back!" });
    navigate("/dashboard");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-cream p-4">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-hero shadow-playful">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <span className="font-display text-xl font-extrabold">
            Smart<span className="text-primary">Lecture</span>
          </span>
        </Link>

        <div className="rounded-3xl border border-border/50 bg-card p-8 shadow-playful">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-2 rounded-full bg-muted p-1">
              <TabsTrigger value="login" className="rounded-full">Log in</TabsTrigger>
              <TabsTrigger value="signup" className="rounded-full">Sign up</TabsTrigger>
            </TabsList>

            <TabsContent value={tab} className="mt-6">
              <h1 className="font-display text-2xl font-extrabold">
                {tab === "login" ? "Welcome back 👋" : "Create your account 🚀"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {tab === "login" ? "Log in to keep learning." : "Free to start. No credit card needed."}
              </p>

              <form onSubmit={submit} className="mt-6 space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email" type="email" autoComplete="email" required
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@school.edu" className="mt-1.5 h-11 rounded-xl"
                  />
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password" type="password" autoComplete={tab === "login" ? "current-password" : "new-password"} required
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••" className="mt-1.5 h-11 rounded-xl"
                  />
                </div>
                <Button type="submit" disabled={loading} size="lg" className="h-12 w-full rounded-full text-base shadow-playful">
                  {loading ? "Just a sec..." : tab === "login" ? "Log in" : "Create account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default Auth;
