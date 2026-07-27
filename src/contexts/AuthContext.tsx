import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { endSession, getSessionId, startSession } from "@/lib/deviceId";

type AnonUser = { id: string; email?: string };

type AuthContextType = {
  user: AnonUser | null;
  session: null;
  loading: false;
  /** Creates a brand-new anonymous session and returns its id. */
  signIn: () => string;
  /** Ends the session, wipes all local data + caches, and returns to the landing page. */
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [sessionId, setSessionId] = useState<string | null>(() => getSessionId());
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const signIn = useCallback(() => {
    const id = startSession();
    setSessionId(id);
    return id;
  }, []);

  const signOut = useCallback(async () => {
    // Stop any further requests tied to the old session.
    queryClient.cancelQueries();
    queryClient.clear();
    await endSession();
    setSessionId(null);
    navigate("/", { replace: true });
  }, [navigate, queryClient]);

  const value = useMemo<AuthContextType>(
    () => ({
      user: sessionId ? { id: sessionId } : null,
      session: null,
      loading: false,
      signIn,
      signOut,
    }),
    [sessionId, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};
