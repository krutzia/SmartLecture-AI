import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import { Sparkles, Upload, Brain, MessageCircle, Lightbulb, Zap, BookOpen } from "lucide-react";
import logoAsset from "@/assets/logo-icon.png.asset.json";
import { Button } from "@/components/ui/button";

const features = [
  { icon: Upload, title: "Upload anything", desc: "Audio, video, PDF or text — we handle it all.", color: "bg-primary-soft text-primary" },
  { icon: Brain, title: "AI summaries", desc: "Quick recap, detailed notes, bullets and key takeaways.", color: "bg-ai-soft text-ai" },
  { icon: Lightbulb, title: "Concept highlights", desc: "Spot the must-know terms and definitions instantly.", color: "bg-accent text-accent-foreground" },
  { icon: BookOpen, title: "Auto flashcards", desc: "Flip through Q&A cards generated from your lecture.", color: "bg-success-soft text-success" },
  { icon: MessageCircle, title: "Study chatbot", desc: "Ask anything — your AI tutor knows the lecture cold.", color: "bg-secondary text-secondary-foreground" },
  { icon: Zap, title: "Lightning fast", desc: "Process a whole lecture in under a minute.", color: "bg-primary-soft text-primary" },
];


const Landing = () => {
  const { user, signIn } = useAuth();
  const { profile } = useProfile();
  const navigate = useNavigate();

  // Starting the app always begins a *fresh* anonymous session when signed out.
  const enterApp = () => {
    if (!user) {
      signIn();
      navigate("/onboarding");
      return;
    }
    navigate(profile.onboarded ? "/dashboard" : "/onboarding");
  };


  return (
    <div className="min-h-screen bg-gradient-cream">
      {/* Nav */}
      <nav className="container flex items-center justify-between py-6">
        <Link to="/" className="flex items-center gap-2">
          <img src={logoAsset.url} alt="SmartLecture" className="h-10 w-10 object-contain" />
          <span className="font-display text-xl font-extrabold">
            Smart<span className="text-primary">Lecture</span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <Button size="sm" className="rounded-full" onClick={enterApp}>Open app</Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="container relative pt-12 pb-24 text-center md:pt-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-soft px-4 py-1.5 text-sm font-medium text-primary"
        >
          <Sparkles className="h-3.5 w-3.5" />
          AI-powered learning, made delightful
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
          className="mx-auto mt-6 max-w-3xl font-display text-5xl font-black leading-[1.05] tracking-tight md:text-7xl"
        >
          Turn lectures into <span className="text-primary">study superpowers</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
          className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground"
        >
          Upload any lecture and get instant transcripts, smart summaries, flashcards, and a study buddy chatbot — all in one cozy place.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-3"
        >
          <Button size="lg" className="h-14 rounded-full px-8 text-base shadow-playful" onClick={enterApp}>
            Get Started →
          </Button>
          <Button asChild variant="outline" size="lg" className="h-14 rounded-full px-8 text-base">
            <Link to="/upload">Upload a lecture</Link>
          </Button>
        </motion.div>

        {/* Floating shapes */}
        <div className="pointer-events-none absolute left-8 top-32 hidden h-16 w-16 animate-float rounded-3xl bg-highlight/40 md:block" />
        <div className="pointer-events-none absolute right-12 top-48 hidden h-12 w-12 animate-float rounded-full bg-ai/30 md:block" style={{ animationDelay: "1s" }} />
        <div className="pointer-events-none absolute right-32 bottom-12 hidden h-20 w-20 animate-float rounded-2xl bg-success/20 md:block" style={{ animationDelay: "2s" }} />
      </section>

      {/* Features */}
      <section className="container pb-24">
        <h2 className="text-center font-display text-3xl font-extrabold md:text-4xl">Everything you need to ace it</h2>
        <p className="mt-3 text-center text-muted-foreground">Six smart features bundled into one playful workspace.</p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              whileHover={{ y: -6 }}
              className="rounded-3xl border border-border/50 bg-card p-6 shadow-card transition-shadow hover:shadow-playful"
            >
              <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${f.color}`}>
                <f.icon className="h-6 w-6" />
              </div>
              <h3 className="font-display text-xl font-bold">{f.title}</h3>
              <p className="mt-2 text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container pb-24">
        <div className="overflow-hidden rounded-[2rem] bg-gradient-hero p-12 text-center shadow-playful md:p-16">
          <h2 className="font-display text-3xl font-extrabold text-white md:text-5xl">Ready to study smarter?</h2>
          <p className="mt-4 text-lg text-white/90">Join now — your first lecture is just a drag away.</p>
          <Button  size="lg" className="mt-8 h-14 rounded-full bg-white px-8 text-base text-primary hover:bg-white/90" onClick={enterApp}>Open the app</Button>
        </div>
      </section>

      <footer className="container border-t border-border/50 py-8 text-center text-sm text-muted-foreground">
        Made with <span className="text-primary">♥</span> for curious learners.
      </footer>
    </div>
  );
};

export default Landing;
