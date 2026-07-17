import { create } from 'zustand';
import type { User, LoginResult } from '../types/auth';
import { apiProfileByEmail, mockChangePassword } from '../api/mockApi';
import { useWorkspaceStore } from './workspaceStore';

const AUTH_SESSION_KEY = 'auth_session';
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

interface AuthSession {
  token: string;
  user: User;
  expiresAt: number;
}

interface AuthStore {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string) => Promise<LoginResult>;
  logout: () => void;
  checkSession: () => void;
  updateProfile: (data: { fullName?: string; phone?: string }) => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
}

function mapProfileToUser(profile: any, fallbackEmail: string): User {
  const email = String(profile?.email || fallbackEmail).trim();
  const fullName = String(profile?.name || '').trim() || email.split('@')[0] || email;
  const roleRaw = String(profile?.role || 'user');
  const role: User['role'] =
    roleRaw === 'supplier' || roleRaw === 'technician' || roleRaw === 'admin' || roleRaw === 'user'
      ? roleRaw
      : 'user';

  const workspaceName = String(profile?.workspace_name || '').trim();

  return {
    id: String(profile?.id ?? email),
    username: fullName,
    email,
    fullName,
    role,
    locationIds: [],
    phone: profile?.phone ? String(profile.phone) : undefined,
    companyId: profile?.company_tax_id ? String(profile.company_tax_id) : undefined,
    companyName: workspaceName || undefined,
    workspaceIds: [],
    joinedAt: profile?.created_at ? String(profile.created_at) : undefined,
  };
}

function generateToken(userId: string): string {
  const payload = `${userId}:${Date.now()}`;
  return btoa(payload);
}

function saveSession(token: string, user: User): void {
  const session: AuthSession = {
    token,
    user,
    expiresAt: Date.now() + SESSION_DURATION_MS,
  };
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}

function loadSession(): AuthSession | null {
  const raw = localStorage.getItem(AUTH_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

function clearSession(): void {
  localStorage.removeItem(AUTH_SESSION_KEY);
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,

  login: async (email: string): Promise<LoginResult> => {
    const trimmed = email.trim();
    if (!trimmed) return { success: false, error: 'Vui lòng nhập email' };

    try {
      const res = await apiProfileByEmail(trimmed);
      if (!res.success || !res.profile) {
        return { success: false, error: res.message || 'Email không tồn tại trong hệ thống' };
      }

      const user = mapProfileToUser(res.profile, trimmed);
      const token = generateToken(user.id);
      saveSession(token, user);
      set({ user, token, isAuthenticated: true });
      return { success: true, user };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Đã xảy ra lỗi. Vui lòng thử lại.' };
    }
  },

  logout: () => {
    clearSession();
    useWorkspaceStore.getState().clear();
    set({ user: null, token: null, isAuthenticated: false });
  },

  checkSession: () => {
    const session = loadSession();
    if (!session) {
      set({ user: null, token: null, isAuthenticated: false });
      return;
    }
    if (Date.now() >= session.expiresAt) {
      clearSession();
      set({ user: null, token: null, isAuthenticated: false });
      return;
    }
    set({ user: session.user, token: session.token, isAuthenticated: true });
  },

  updateProfile: (data) => {
    set((state) => {
      if (!state.user || !state.token) return state;
      const updated = { ...state.user, ...data };
      saveSession(state.token, updated);
      return { user: updated };
    });
  },

  changePassword: async (currentPassword, newPassword) => {
    const user = get().user;
    if (!user) return { success: false, error: 'Chưa đăng nhập' };
    return mockChangePassword(user.id, currentPassword, newPassword);
  },
}));
