import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from '../authStore';

vi.mock('../../api/mockApi', () => ({
  apiLogin: vi.fn(),
  apiMe: vi.fn(),
  apiLogout: vi.fn(),
  mockRegister: vi.fn(),
  mockLoginWithGoogle: vi.fn(),
  mockChangePassword: vi.fn(),
}));

import { apiLogin, apiMe, apiLogout } from '../../api/mockApi';
const apiLoginFn = vi.mocked(apiLogin);
const apiMeFn = vi.mocked(apiMe);
const apiLogoutFn = vi.mocked(apiLogout);

const fakeProfile = {
  id: 'user-s1',
  name: 'Nguyễn Văn An',
  email: 'supplier1@goxprint.vn',
  role: 'supplier',
  active_company_id: 'CTY001',
  workspaces: [{ company_id: 'CTY001', company_name: 'Test Company', role: 'owner' }],
};

const fakeUser = {
  id: 'user-s1',
  username: 'Nguyễn Văn An',
  email: 'supplier1@goxprint.vn',
  fullName: 'Nguyễn Văn An',
  role: 'supplier' as const,
  locationIds: [],
  phone: undefined,
  companyId: 'CTY001',
  companyName: 'Test Company',
  workspaceIds: ['CTY001'],
};

function createLocalStorageMock() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { for (const key of Object.keys(store)) delete store[key]; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((_index: number) => null),
    _store: store,
  };
}

describe('authStore', () => {
  let storageMock: ReturnType<typeof createLocalStorageMock>;

  beforeEach(() => {
    useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
    storageMock = createLocalStorageMock();
    Object.defineProperty(globalThis, 'localStorage', { value: storageMock, writable: true });
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('starts with no user, no token, not authenticated', () => {
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.token).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('login', () => {
    it('rejects when password is missing, without calling the API', async () => {
      const result = await useAuthStore.getState().login('supplier1@goxprint.vn', '');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBe('Vui lòng nhập mật khẩu');
      expect(apiLoginFn).not.toHaveBeenCalled();
    });

    it('rejects when email is missing, without calling the API', async () => {
      const result = await useAuthStore.getState().login('', 'password123');
      expect(result.success).toBe(false);
      expect(apiLoginFn).not.toHaveBeenCalled();
    });

    it('sets user, token, and isAuthenticated on successful login', async () => {
      apiLoginFn.mockResolvedValue({ success: true, message: '', token: 'real-jwt-token', expiresIn: 3600 });
      apiMeFn.mockResolvedValue({ success: true, profile: fakeProfile });

      const result = await useAuthStore.getState().login('supplier1@goxprint.vn', 'password123');
      expect(apiLoginFn).toHaveBeenCalledWith('supplier1@goxprint.vn', 'password123');
      expect(result.success).toBe(true);
      const state = useAuthStore.getState();
      expect(state.user).toEqual(fakeUser);
      expect(state.token).toBe('real-jwt-token');
      expect(state.isAuthenticated).toBe(true);
    });

    it('saves the real server token and expiry to localStorage on successful login', async () => {
      apiLoginFn.mockResolvedValue({ success: true, message: '', token: 'real-jwt-token', expiresIn: 3600 });
      apiMeFn.mockResolvedValue({ success: true, profile: fakeProfile });

      const now = Date.now();
      await useAuthStore.getState().login('supplier1@goxprint.vn', 'password123');
      expect(storageMock.setItem).toHaveBeenCalledWith('auth_session', expect.any(String));
      const saved = JSON.parse(storageMock.setItem.mock.calls[0][1]);
      expect(saved.user).toEqual(fakeUser);
      expect(saved.token).toBe('real-jwt-token');
      expect(saved.expiresAt).toBeGreaterThanOrEqual(now + 3600 * 1000 - 1000);
      expect(saved.expiresAt).toBeLessThanOrEqual(now + 3600 * 1000 + 1000);
    });

    it('does not change state when the server rejects the password', async () => {
      apiLoginFn.mockResolvedValue({ success: false, message: 'Email hoặc mật khẩu không đúng', token: null, expiresIn: null });
      const result = await useAuthStore.getState().login('wrong@test.com', 'wrong');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBe('Email hoặc mật khẩu không đúng');
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(apiMeFn).not.toHaveBeenCalled();
    });

    it('does not save to localStorage on failed login', async () => {
      apiLoginFn.mockResolvedValue({ success: false, message: 'Invalid', token: null, expiresIn: null });
      await useAuthStore.getState().login('wrong@test.com', 'wrong');
      expect(storageMock.setItem).not.toHaveBeenCalled();
    });

    it('fails cleanly when the server accepts the password but /me lookup fails', async () => {
      apiLoginFn.mockResolvedValue({ success: true, message: '', token: 'real-jwt-token', expiresIn: 3600 });
      apiMeFn.mockResolvedValue({ success: false, profile: null });

      const result = await useAuthStore.getState().login('supplier1@goxprint.vn', 'password123');
      expect(result.success).toBe(false);
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(storageMock.setItem).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('clears user, token, and isAuthenticated, and revokes the token server-side', async () => {
      apiLoginFn.mockResolvedValue({ success: true, message: '', token: 'real-jwt-token', expiresIn: 3600 });
      apiMeFn.mockResolvedValue({ success: true, profile: fakeProfile });
      await useAuthStore.getState().login('supplier1@goxprint.vn', 'password123');

      useAuthStore.getState().logout();
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.token).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(apiLogoutFn).toHaveBeenCalledWith('real-jwt-token');
    });

    it('removes session from localStorage', async () => {
      apiLoginFn.mockResolvedValue({ success: true, message: '', token: 'real-jwt-token', expiresIn: 3600 });
      apiMeFn.mockResolvedValue({ success: true, profile: fakeProfile });
      await useAuthStore.getState().login('supplier1@goxprint.vn', 'password123');

      useAuthStore.getState().logout();
      expect(storageMock.removeItem).toHaveBeenCalledWith('auth_session');
    });
  });

  describe('checkSession', () => {
    it('restores state from valid localStorage session', () => {
      const session = { token: 'valid-token', user: fakeUser, expiresAt: Date.now() + 60 * 60 * 1000 };
      storageMock._store['auth_session'] = JSON.stringify(session);
      useAuthStore.getState().checkSession();
      const state = useAuthStore.getState();
      expect(state.user).toEqual(fakeUser);
      expect(state.token).toBe('valid-token');
      expect(state.isAuthenticated).toBe(true);
    });

    it('clears state when session is expired', () => {
      const session = { token: 'expired-token', user: fakeUser, expiresAt: Date.now() - 1000 };
      storageMock._store['auth_session'] = JSON.stringify(session);
      useAuthStore.getState().checkSession();
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(storageMock.removeItem).toHaveBeenCalledWith('auth_session');
    });

    it('clears state when no session exists', () => {
      useAuthStore.getState().checkSession();
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });

    it('clears state when localStorage contains invalid JSON', () => {
      storageMock._store['auth_session'] = 'not-valid-json{{{';
      useAuthStore.getState().checkSession();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('session expiry matches the server-issued expires_in, not a fixed client-side duration', async () => {
      apiLoginFn.mockResolvedValue({ success: true, message: '', token: 'real-jwt-token', expiresIn: 1800 });
      apiMeFn.mockResolvedValue({ success: true, profile: fakeProfile });

      const now = Date.now();
      await useAuthStore.getState().login('supplier1@goxprint.vn', 'password123');
      const saved = JSON.parse(storageMock.setItem.mock.calls[0][1]);
      const expectedExpiry = now + 1800 * 1000;
      expect(saved.expiresAt).toBeGreaterThanOrEqual(expectedExpiry - 1000);
      expect(saved.expiresAt).toBeLessThanOrEqual(expectedExpiry + 1000);
    });
  });
});
