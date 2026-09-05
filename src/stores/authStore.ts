import { create } from 'zustand';
import type { User, LoginResult } from '../types/auth';
import { mockRegister, mockLoginWithGoogle, mockChangePassword, apiLogin, apiMe, apiLogout } from '../api/mockApi';
import { useWorkspaceStore } from './workspaceStore';

const AUTH_SESSION_KEY = 'auth_session';
const FALLBACK_SESSION_DURATION_MS = 60 * 60 * 1000; // dùng khi server không trả expires_in

interface AuthSession {
  token: string;
  user: User;
  expiresAt: number;
}

interface AuthStore {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  register: (email: string, password: string, fullName: string, phoneNumber?: string, address?: string) => Promise<LoginResult>;
  loginWithGoogle: (email: string) => Promise<LoginResult>;
  logout: () => void;
  checkSession: () => void;
  updateProfile: (data: { fullName?: string; phone?: string }) => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
}

// /api/me của quanlymay trả về id/name/email/role/active_company_id/workspaces[].
function mapMeToUser(profile: any, fallbackEmail: string): User {
  const email = String(profile?.email || fallbackEmail).trim();
  const fullName = String(profile?.name || '').trim() || email.split('@')[0] || email;
  const roleRaw = String(profile?.role || 'user');
  const role: User['role'] =
    roleRaw === 'supplier' || roleRaw === 'technician' || roleRaw === 'admin' || roleRaw === 'user'
      ? roleRaw
      : 'user';

  const workspaces: any[] = Array.isArray(profile?.workspaces) ? profile.workspaces : [];
  const activeCompanyId = profile?.active_company_id != null ? String(profile.active_company_id) : undefined;
  const activeWorkspace = workspaces.find((w) => String(w?.company_id) === activeCompanyId);

  return {
    id: String(profile?.id ?? email),
    username: fullName,
    email,
    fullName,
    role,
    locationIds: [],
    phone: undefined,
    companyId: activeCompanyId,
    companyName: activeWorkspace?.company_name ? String(activeWorkspace.company_name) : undefined,
    workspaceIds: workspaces.map((w) => String(w?.company_id)).filter(Boolean),
  };
}

function generateToken(userId: string): string {
  const payload = `${userId}:${Date.now()}`;
  return btoa(payload);
}

function saveSession(token: string, user: User, expiresAt: number): void {
  const session: AuthSession = { token, user, expiresAt };
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

  login: async (email: string, password: string): Promise<LoginResult> => {
    const trimmed = email.trim();
    if (!trimmed) return { success: false, error: 'Vui lòng nhập email' };
    if (!password) return { success: false, error: 'Vui lòng nhập mật khẩu' };

    try {
      const loginRes = await apiLogin(trimmed, password);
      if (!loginRes.success || !loginRes.token) {
        return { success: false, error: loginRes.message || 'Email hoặc mật khẩu không đúng' };
      }

      const meRes = await apiMe(loginRes.token);
      if (!meRes.success || !meRes.profile) {
        return { success: false, error: 'Đăng nhập thành công nhưng không lấy được thông tin tài khoản. Vui lòng thử lại.' };
      }

      const user = mapMeToUser(meRes.profile, trimmed);
      const expiresAt = Date.now() + (loginRes.expiresIn ?? FALLBACK_SESSION_DURATION_MS / 1000) * 1000;
      saveSession(loginRes.token, user, expiresAt);
      set({ user, token: loginRes.token, isAuthenticated: true });
      return { success: true, user };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Đã xảy ra lỗi. Vui lòng thử lại.' };
    }
  },

  register: async (email: string, password: string, fullName: string, phoneNumber?: string, address?: string): Promise<LoginResult> => {
    const result = await mockRegister(email, password, fullName, phoneNumber, address);
    if (result.success) {
      const token = generateToken(result.user.id);
      saveSession(token, result.user, Date.now() + FALLBACK_SESSION_DURATION_MS);
      set({ user: result.user, token, isAuthenticated: true });
    }
    return result;
  },

  loginWithGoogle: async (email: string): Promise<LoginResult> => {
    const result = await mockLoginWithGoogle(email);
    if (result.success) {
      const token = generateToken(result.user.id);
      saveSession(token, result.user, Date.now() + FALLBACK_SESSION_DURATION_MS);
      set({ user: result.user, token, isAuthenticated: true });
    }
    return result;
  },

  logout: () => {
    const token = get().token;
    if (token) void apiLogout(token);
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
      const existing = loadSession();
      const expiresAt = existing?.expiresAt ?? Date.now() + FALLBACK_SESSION_DURATION_MS;
      saveSession(state.token, updated, expiresAt);
      return { user: updated };
    });
  },

  changePassword: async (currentPassword, newPassword) => {
    const user = get().user;
    if (!user) return { success: false, error: 'Chưa đăng nhập' };
    return mockChangePassword(user.id, currentPassword, newPassword);
  },
}));
