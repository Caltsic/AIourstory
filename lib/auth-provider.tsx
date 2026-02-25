import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  getAuthState,
  subscribeAuth,
  initAuth,
  sendEmailCode,
  registerBoundAccount,
  loginAccount,
  resetPassword,
  logoutAccount,
  updateProfile,
} from "@/lib/auth-store";
import type { ApiUser } from "@shared/api-types";

type AuthContextValue = {
  initialized: boolean;
  loading: boolean;
  user: ApiUser | null;
  isBound: boolean;
  sendCode: (email: string, purpose?: "register" | "reset") => Promise<void>;
  register: (
    email: string,
    password: string,
    code: string,
    nickname?: string,
  ) => Promise<ApiUser>;
  login: (email: string, password: string) => Promise<ApiUser>;
  resetPassword: (
    email: string,
    code: string,
    newPassword: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  saveProfile: (data: {
    nickname?: string;
    avatarSeed?: string;
  }) => Promise<ApiUser>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(getAuthState());

  useEffect(() => {
    const unsubscribe = subscribeAuth((next) => setState(next));
    initAuth();
    return unsubscribe;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      initialized: state.initialized,
      loading: state.loading,
      user: state.user,
      isBound: Boolean(state.user?.isBound),
      sendCode: sendEmailCode,
      register: registerBoundAccount,
      login: loginAccount,
      resetPassword,
      logout: logoutAccount,
      saveProfile: updateProfile,
    }),
    [state.initialized, state.loading, state.user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
