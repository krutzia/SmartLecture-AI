import { createContext, useContext, useMemo, ReactNode } from "react";
import { getDeviceId, resetDeviceId } from "@/lib/deviceId";

type FakeUser = { id: string; email?: string };

type AuthContextType = {
  user: FakeUser;
  session: null;
  loading: false;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const value = useMemo<AuthContextType>(() => ({
    user: { id: getDeviceId() },
    session: null,
    loading: false,
    signOut: async () => {
      resetDeviceId();
      window.location.reload();
    },
  }), []);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};
