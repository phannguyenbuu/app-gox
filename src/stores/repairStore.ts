import { create } from 'zustand';
import type {
  RepairRequest,
  RepairRequestFilters,
  RepairStatus,
  Priority,
  Attachment,
} from '../types/repair';
import { apiIncidentAddNote, apiIncidentUpdateStatus, mockGetRequestById, mockGetRequests, mockCreateRequest, mockUpdateStatus } from '../api/mockApi';
import { validateRepairRequest, validateProgressNote } from '../services/validation';
import { transitionStatus } from '../services/repairStateMachine';
import { notifyStatusChange } from '../services/notificationService';
import { useAuthStore } from './authStore';

interface RepairStore {
  requests: RepairRequest[];
  filters: RepairRequestFilters;
  loading: boolean;
  error: string | null;
  ensureRequestLoaded: (requestId: string) => Promise<RepairRequest | null>;
  fetchRequests: (filters?: RepairRequestFilters) => Promise<void>;
  createRequest: (data: {
    machineName: string;
    locationId: string;
    workspaceId: string;
    description: string;
    priority: Priority;
    createdBy: string;
    attachments: Attachment[];
    note?: string;
    contactPhone?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  updateStatus: (
    requestId: string,
    newStatus: RepairStatus,
    data?: any,
  ) => Promise<{ success: boolean; error?: string }>;
  addProgressNote: (
    requestId: string,
    note: string,
    createdBy: string,
    images?: string[],
  ) => Promise<{ success: boolean; error?: string }>;
  completeRequest: (
    requestId: string,
    report: { description: string; attachments: Attachment[]; laborCost?: number },
  ) => Promise<{ success: boolean; error?: string }>;
  setFilters: (filters: RepairRequestFilters) => void;
}

export const useRepairStore = create<RepairStore>((set, get) => ({
  requests: [],
  filters: {},
  loading: false,
  error: null,

  ensureRequestLoaded: async (requestId: string): Promise<RepairRequest | null> => {
    const existing = get().requests.find((r) => r.id === requestId);
    if (existing) return existing;

    const email = useAuthStore.getState().user?.email;
    if (!email) return null;

    try {
      const fetched = await mockGetRequestById(requestId, email);
      if (!fetched) return null;
      set((state) => {
        if (state.requests.some((r) => r.id === requestId)) return state;
        return { ...state, requests: [fetched, ...state.requests] };
      });
      return fetched;
    } catch {
      return null;
    }
  },

  fetchRequests: async (filters?: RepairRequestFilters) => {
    set({ loading: true, error: null });
    try {
      const activeFilters = filters ?? get().filters;
      const authState = useAuthStore.getState();
      const email = authState.user?.email ?? undefined;
      const token = authState.token ?? undefined;
      const requests = await mockGetRequests(activeFilters, email, token);
      set({ requests, loading: false });
    } catch (e: any) {
      set({ error: e.message ?? 'Lỗi khi tải danh sách yêu cầu', loading: false });
    }
  },

  createRequest: async (data) => {
    const validation = validateRepairRequest(data);
    if (!validation.valid) {
      return { success: false, error: validation.errors.join(', ') };
    }

    set({ loading: true, error: null });
    try {
      const newRequest = await mockCreateRequest({
        machineName: data.machineName,
        locationId: data.locationId,
        workspaceId: data.workspaceId,
        description: data.description,
        priority: data.priority,
        createdBy: data.createdBy,
        attachments: data.attachments,
      });
      set((state) => ({
        requests: [newRequest, ...state.requests],
        loading: false,
      }));
      return { success: true };
    } catch (e: any) {
      set({ error: e.message ?? 'Lỗi khi tạo yêu cầu', loading: false });
      return { success: false, error: e.message ?? 'Lỗi khi tạo yêu cầu' };
    }
  },

  updateStatus: async (requestId, newStatus, data) => {
    let request: RepairRequest | undefined = get().requests.find((r) => r.id === requestId);
    if (!request) {
      request = (await get().ensureRequestLoaded(requestId)) ?? undefined;
    }
    if (!request) {
      return { success: false, error: 'Không tìm thấy yêu cầu' };
    }

    const result = transitionStatus(request, newStatus, data);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    set({ loading: true, error: null });
    try {
      const authState = useAuthStore.getState();
      const email = authState.user?.email;
      const token = authState.token;
      let updated = result.request;

      if (email && token && (newStatus === 'accepted' || newStatus === 'in_progress' || newStatus === 'completed')) {
        const now = new Date().toISOString();
        const statusSlug =
          newStatus === 'accepted' ? 'selected'
            : newStatus === 'in_progress' ? 'in-progress'
              : 'done';

        const note =
          typeof data?.note === 'string' ? data.note
            : typeof data?.progressNote === 'string' ? data.progressNote
              : typeof data?.completionReport?.description === 'string' ? data.completionReport.description
                : undefined;

        await apiIncidentUpdateStatus({
          email,
          task_id: String(requestId),
          status: statusSlug,
          note,
          join_repair: newStatus === 'accepted' ? true : undefined,
          completed_at: newStatus === 'completed' ? now : undefined,
        }, token);

        updated = {
          ...updated,
          acceptedAt: newStatus === 'accepted' ? now : updated.acceptedAt,
          completedAt: newStatus === 'completed' ? now : updated.completedAt,
          updatedAt: now,
        };
      } else {
        updated = await mockUpdateStatus(requestId, newStatus, data);
      }

      set((state) => ({
        requests: state.requests.some((r) => r.id === requestId)
          ? state.requests.map((r) => (r.id === requestId ? updated : r))
          : [updated, ...state.requests],
        loading: false,
      }));
      notifyStatusChange(request.status, newStatus);
      return { success: true };
    } catch (e: any) {
      set({ error: e.message ?? 'Lỗi khi cập nhật trạng thái', loading: false });
      return { success: false, error: e.message ?? 'Lỗi khi cập nhật trạng thái' };
    }
  },

  addProgressNote: async (requestId, note, createdBy, images) => {
    const noteValidation = validateProgressNote(note);
    if (!noteValidation.valid) {
      return { success: false, error: noteValidation.errors.join(', ') };
    }

    let request: RepairRequest | undefined = get().requests.find((r) => r.id === requestId);
    if (!request) {
      request = (await get().ensureRequestLoaded(requestId)) ?? undefined;
    }
    if (!request) {
      return { success: false, error: 'Không tìm thấy yêu cầu' };
    }

    // Transition to in_progress (accepted→in_progress or in_progress→in_progress)
    const targetStatus: RepairStatus = 'in_progress';
    const transitionData = {
      progressNote: note,
      progressNoteCreatedBy: createdBy,
    };

    const result = transitionStatus(request, targetStatus, transitionData);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    set({ loading: true, error: null });
    try {
      const authState = useAuthStore.getState();
      const email = authState.user?.email;
      const token = authState.token;
      const now = new Date().toISOString();
      let updated = request;

      if (email && token) {
        await apiIncidentAddNote({
          email,
          task_id: String(requestId),
          note,
          images,
        }, token);

        const progressNote = {
          id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          note,
          images,
          createdBy,
          createdAt: now,
        };

        updated = {
          ...request,
          progressNotes: [...request.progressNotes, progressNote],
          updatedAt: now,
        };
      } else {
        updated = await mockUpdateStatus(requestId, targetStatus, {
          progressNote: note,
          progressNoteImages: images,
          progressNoteCreatedBy: createdBy,
          assignedTo: request.assignedTo ?? createdBy,
        });
      }

      set((state) => ({
        requests: state.requests.some((r) => r.id === requestId)
          ? state.requests.map((r) => (r.id === requestId ? updated : r))
          : [updated, ...state.requests],
        loading: false,
      }));
      notifyStatusChange(request.status, targetStatus);
      return { success: true };
    } catch (e: any) {
      set({ error: e.message ?? 'Lỗi khi thêm ghi chú', loading: false });
      return { success: false, error: e.message ?? 'Lỗi khi thêm ghi chú' };
    }
  },

  completeRequest: async (requestId, report) => {
    let request: RepairRequest | undefined = get().requests.find((r) => r.id === requestId);
    if (!request) {
      request = (await get().ensureRequestLoaded(requestId)) ?? undefined;
    }
    if (!request) {
      return { success: false, error: 'Không tìm thấy yêu cầu' };
    }

    const result = transitionStatus(request, 'completed', { completionReport: report });
    if (!result.success) {
      return { success: false, error: result.error };
    }

    set({ loading: true, error: null });
    try {
      const authState = useAuthStore.getState();
      const email = authState.user?.email;
      const token = authState.token;
      const now = new Date().toISOString();
      let updated = result.request;

      if (email && token) {
        await apiIncidentUpdateStatus({
          email,
          task_id: String(requestId),
          status: 'done',
          completion_note: report.description,
          labor_cost: report.laborCost,
          completed_at: now,
        }, token);
        updated = { ...updated, completedAt: now, updatedAt: now };
      } else {
        updated = await mockUpdateStatus(requestId, 'completed', {
          completionReport: { description: report.description, laborCost: report.laborCost },
        });
      }

      set((state) => ({
        requests: state.requests.some((r) => r.id === requestId)
          ? state.requests.map((r) => (r.id === requestId ? updated : r))
          : [updated, ...state.requests],
        loading: false,
      }));
      notifyStatusChange(request.status, 'completed');
      return { success: true };
    } catch (e: any) {
      set({ error: e.message ?? 'Lỗi khi hoàn thành yêu cầu', loading: false });
      return { success: false, error: e.message ?? 'Lỗi khi hoàn thành yêu cầu' };
    }
  },

  setFilters: (filters) => {
    set({ filters });
  },
}));
