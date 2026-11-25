'use client';

import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, browserApi, type Cart } from '@/lib/api';

type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'CUSTOMER' | 'ADMIN';
};

type SessionTokens = { accessToken: string; csrfToken: string };
type Session = SessionTokens & { user: AuthUser };
type RegisterInput = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
};

type AuthContextValue = {
  session: Session | null;
  ready: boolean;
  restoreError: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<{ message: string }>;
  logout: () => Promise<void>;
  authorizedApi: <T>(path: string, options?: RequestInit) => Promise<T>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const SESSION_STORAGE_KEY = 'commerce-session';

function saveTokens(tokens: SessionTokens) {
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(tokens));
}

function clearTokens() {
  window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

function AuthStateProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const refreshTokens = useCallback(async (csrfToken: string) => {
    const tokens = await browserApi<SessionTokens>('/auth/refresh', {
      method: 'POST',
      headers: { 'x-csrf-token': csrfToken },
    });
    saveTokens(tokens);
    return tokens;
  }, []);

  const loadUser = useCallback(async (tokens: SessionTokens) => {
    const user = await browserApi<AuthUser>('/auth/me', {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    return { ...tokens, user };
  }, []);

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      try {
        const stored = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (!stored) return;
        const previous = JSON.parse(stored) as SessionTokens;
        const fresh = await refreshTokens(previous.csrfToken);
        const restored = await loadUser(fresh);
        if (active) setSession(restored);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearTokens();
        } else if (active) {
          setRestoreError(
            error instanceof Error
              ? error.message
              : 'Your session could not be restored.',
          );
        }
      } finally {
        if (active) setReady(true);
      }
    }
    void restoreSession();
    return () => {
      active = false;
    };
  }, [loadUser, refreshTokens]);

  const login = useCallback(
    async (email: string, password: string) => {
      const tokens = await browserApi<SessionTokens>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      saveTokens(tokens);
      const next = await loadUser(tokens);
      setSession(next);
      setRestoreError(null);
      setReady(true);
      await queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
    [loadUser, queryClient],
  );

  const register = useCallback((input: RegisterInput) => {
    return browserApi<{ message: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }, []);

  const logout = useCallback(async () => {
    const current = session;
    try {
      if (current) {
        await browserApi<void>('/auth/logout', {
          method: 'POST',
          headers: { 'x-csrf-token': current.csrfToken },
        });
      }
    } finally {
      clearTokens();
      setSession(null);
      await queryClient.invalidateQueries({ queryKey: ['cart'] });
    }
  }, [queryClient, session]);

  const authorizedApi = useCallback(
    async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
      if (!session) throw new Error('Sign in to continue.');
      const withToken = (accessToken: string) => ({
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${accessToken}`,
        },
      });
      try {
        return await browserApi<T>(path, withToken(session.accessToken));
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
        const tokens = await refreshTokens(session.csrfToken);
        const next = { ...tokens, user: session.user };
        setSession(next);
        return browserApi<T>(path, withToken(tokens.accessToken));
      }
    },
    [refreshTokens, session],
  );

  return (
    <AuthContext.Provider
      value={{
        session,
        ready,
        restoreError,
        login,
        register,
        logout,
        authorizedApi,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

type CartContextValue = {
  cart?: Cart;
  itemCount: number;
  isLoading: boolean;
  error?: Error;
  addItem: (variantId: string, quantity?: number) => Promise<void>;
  updateItem: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  applyCoupon: (code: string) => Promise<void>;
  removeCoupon: () => Promise<void>;
};

const CartContext = createContext<CartContextValue | null>(null);

function CartStateProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { session, ready, authorizedApi } = useAuth();
  const queryKey = ['cart', session?.user.id ?? 'guest'];
  const query = useQuery({
    queryKey,
    queryFn: () =>
      session
        ? authorizedApi<Cart>('/cart')
        : browserApi<Cart>('/cart'),
    staleTime: 15_000,
    retry: 1,
    enabled: ready,
  });

  const mutation = useMutation({
    mutationFn: ({
      path,
      method,
      body,
    }: {
      path: string;
      method: 'POST' | 'PATCH' | 'DELETE';
      body?: unknown;
    }) => {
      const options = {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      };
      return session
        ? authorizedApi<Cart>(path, options)
        : browserApi<Cart>(path, options);
    },
    onSuccess: (cart) => {
      queryClient.setQueryData(queryKey, cart);
    },
  });

  const runMutation = async (
    path: string,
    method: 'POST' | 'PATCH' | 'DELETE',
    body?: unknown,
  ) => {
    await mutation.mutateAsync({ path, method, body });
  };

  const value: CartContextValue = {
    cart: query.data,
    itemCount:
      query.data?.items.reduce((count, item) => count + item.quantity, 0) ?? 0,
    isLoading: query.isLoading,
    ...(query.error instanceof Error
      ? { error: query.error }
      : mutation.error instanceof Error
        ? { error: mutation.error }
        : {}),
    addItem: (variantId, quantity = 1) =>
      runMutation('/cart/items', 'POST', { variantId, quantity }),
    updateItem: (itemId, quantity) =>
      runMutation(`/cart/items/${encodeURIComponent(itemId)}`, 'PATCH', {
        quantity,
      }),
    removeItem: (itemId) =>
      runMutation(`/cart/items/${encodeURIComponent(itemId)}`, 'DELETE'),
    applyCoupon: (code) => runMutation('/cart/coupon', 'POST', { code }),
    removeCoupon: () => runMutation('/cart/coupon', 'DELETE'),
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <AuthStateProvider>
        <CartStateProvider>{children}</CartStateProvider>
      </AuthStateProvider>
    </QueryClientProvider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AppProviders');
  }
  return value;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) {
    throw new Error('useCart must be used inside AppProviders');
  }
  return value;
}
