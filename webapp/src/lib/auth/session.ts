// Local, self-contained auth session.
//
// This replaces the previous third-party auth provider with a minimal,
// dependency-free session kept in the browser's localStorage. It exposes a
// small async API so the rest of the app can treat sign-in/out uniformly.
// When real enterprise identity (Microsoft Entra ID) is wired in later, this
// module is the single seam to swap.

export type AuthUser = {
  id: string;
  email: string;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
};

export type AuthSession = {
  user: AuthUser;
};

export type AuthChangeEvent = "SIGNED_IN" | "SIGNED_OUT";

type Listener = (event: AuthChangeEvent, session: AuthSession | null) => void;

const STORAGE_KEY = "ops-auth-session";
const listeners = new Set<Listener>();

function readSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

function writeSession(session: AuthSession | null): void {
  if (typeof window !== "undefined") {
    if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(STORAGE_KEY);
  }
  const event: AuthChangeEvent = session ? "SIGNED_IN" : "SIGNED_OUT";
  for (const listener of listeners) listener(event, session);
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeUser(email: string, displayName?: string): AuthUser {
  const name = displayName ?? email.split("@")[0] ?? email;
  return {
    id: newId(),
    email,
    user_metadata: { full_name: name, name },
    app_metadata: { provider: "local" },
  };
}

export const auth = {
  async getSession(): Promise<{ data: { session: AuthSession | null } }> {
    return { data: { session: readSession() } };
  },

  onAuthStateChange(callback: Listener): {
    data: { subscription: { unsubscribe: () => void } };
  } {
    listeners.add(callback);
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            listeners.delete(callback);
          },
        },
      },
    };
  },

  async signInWithPassword(credentials: {
    email: string;
    password: string;
  }): Promise<{ error: { message: string } | null }> {
    const email = credentials.email.trim();
    if (!email) return { error: { message: "Enter your email address." } };
    if (!credentials.password) return { error: { message: "Enter your password." } };
    writeSession({ user: makeUser(email) });
    return { error: null };
  },

  async signUp(credentials: {
    email: string;
    password: string;
  }): Promise<{ error: { message: string } | null }> {
    const email = credentials.email.trim();
    if (!email) return { error: { message: "Enter your email address." } };
    if (!credentials.password) return { error: { message: "Choose a password." } };
    writeSession({ user: makeUser(email) });
    return { error: null };
  },

  async signOut(): Promise<void> {
    writeSession(null);
  },
};
