import type { LoginResult, User } from '../types/auth';
import type { Location } from '../types/location';
import type { RepairRequest, RepairStatus, RepairRequestFilters } from '../types/repair';
import type { Workspace } from '../types/workspace';

const BASE_URL = import.meta.env.VITE_API_URL || 'https://agentapi.quanlymay.com';
const PUBLIC_BASE_URL = import.meta.env.VITE_PUBLIC_API_URL || 'https://app.quanlymay.com';
const publicUserNames = new Map<string, string>();

// Cache: mac_id (uppercase) → thông tin LAN site
interface MacSiteInfo {
  locationName: string;
  locationAddress?: string;
  contactEmails?: string[];
  inCharge?: string;
}
const macToSiteCache = new Map<string, MacSiteInfo>();
let macLocationCacheReady = false;

async function ensureMacLocationCache(): Promise<void> {
  if (macLocationCacheReady) return;
  try {
    const res = await fetchApi('/api/lan-sites?lead=default');
    const rows: any[] = res.rows || [];
    rows.forEach((row: any) => {
      const locationName = String(row.lan_name || row.lan_uid || '').trim();
      if (!locationName) return;
      const locationAddress = row.address ? String(row.address).trim() : undefined;
      const rawEmails: any[] = Array.isArray(row.emails) ? row.emails : [];
      const contactEmails = rawEmails
        .map((e: any) => String(e.email || e || '').trim())
        .filter(Boolean);
      const inCharge = rawEmails
        .map((e: any) => String(e.name || e.full_name || '').trim())
        .filter(Boolean)[0];

      (row.printers || []).forEach((p: any) => {
        const macId = String(p.mac_id || '').trim().toUpperCase();
        if (macId) {
          macToSiteCache.set(macId, { locationName, locationAddress, contactEmails, inCharge });
        }
      });
    });
    macLocationCacheReady = true;
  } catch {
    // sẽ thử lại ở lần gọi tiếp theo
  }
}

async function fetchApi(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Token': 'change-me',
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HTTP error! status: ${res.status}`);
  }
  return data;
}

export function mockGetUserName(userId: string): string {
  return publicUserNames.get(String(userId)) || userId;
}

export function mockGetUserPhone(_userId: string): string | undefined {
  return undefined;
}


export async function apiIncidentsByEmail(email: string): Promise<{
  success: boolean;
  message: string;
  profile: any | null;
  workspace: any | null;
  tasks: any[];
  meta: any | null;
}> {
  const res = await fetch(`${PUBLIC_BASE_URL}/api/app-db/incidents/by-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ email, page: 1, per_page: 200 }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `HTTP error! status: ${res.status}`);
  }

  return {
    success: Boolean(data?.success),
    message: String(data?.message || ''),
    profile: data?.profile ?? null,
    workspace: data?.workspace ?? null,
    tasks: Array.isArray(data?.tasks) ? data.tasks : [],
    meta: data?.meta ?? null,
  };
}

export async function apiIncidentUpdateStatus(payload: {
  email: string;
  task_id: string;
  status: string;
  note?: string;
  join_repair?: boolean;
  completed_at?: string;
  completion_note?: string;
  labor_cost?: number;
}): Promise<{
  success: boolean;
  message: string;
  task: any | null;
  profile: any | null;
  workspace: any | null;
  incident: any | null;
}> {
  const url = `${PUBLIC_BASE_URL}/api/app-db/incidents/update-status`;
  const transient = new Set([502, 503, 504]);
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (let attempt = 0; attempt < 2; attempt++) {
    const resJson = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    let data = await resJson.json().catch(() => ({}));
    let res = resJson;

    if (transient.has(res.status) && attempt < 1) {
      await delay(800);
      continue;
    }

    const isBodyNotParsed =
      res.status === 422
      && typeof data?.message === 'string'
      && data.message.includes('required')
      && data?.errors?.email
      && data?.errors?.task_id
      && data?.errors?.status;

    if (isBodyNotParsed) {
      const body = new URLSearchParams();
      body.set('email', payload.email);
      body.set('task_id', payload.task_id);
      body.set('status', payload.status);
      if (typeof payload.note === 'string') body.set('note', payload.note);
      if (typeof payload.join_repair === 'boolean') body.set('join_repair', payload.join_repair ? '1' : '0');
      if (typeof payload.completed_at === 'string') body.set('completed_at', payload.completed_at);
      if (typeof payload.completion_note === 'string') body.set('completion_note', payload.completion_note);
      if (typeof payload.labor_cost === 'number' && !Number.isNaN(payload.labor_cost)) body.set('labor_cost', String(payload.labor_cost));

      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: body.toString(),
      });
      data = await res.json().catch(() => ({}));
    }

    if (!res.ok) {
      throw new Error(data.message || data.error || `HTTP error! status: ${res.status}`);
    }

    return {
      success: Boolean(data?.success),
      message: String(data?.message || ''),
      task: data?.task ?? null,
      profile: data?.profile ?? null,
      workspace: data?.workspace ?? null,
      incident: data?.incident ?? null,
    };
  }

  throw new Error('Agent API không phản hồi');
}

export async function apiIncidentAddNote(payload: {
  email: string;
  task_id: string;
  note: string;
  images?: string[];
}): Promise<{
  success: boolean;
  message: string;
  note?: any | null;
}> {
  const url = `${PUBLIC_BASE_URL}/api/app-db/incidents/add-note`;

  let res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  let data = await res.json().catch(() => ({}));
  const isBodyNotParsed =
    res.status === 422
    && typeof data?.message === 'string'
    && data.message.includes('required')
    && data?.errors?.email
    && data?.errors?.task_id
    && data?.errors?.note;

  if (isBodyNotParsed) {
    const body = new URLSearchParams();
    body.set('email', payload.email);
    body.set('task_id', payload.task_id);
    body.set('note', payload.note);
    if (Array.isArray(payload.images)) {
      payload.images.forEach((img, idx) => body.set(`images[${idx}]`, img));
    }

    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });
    data = await res.json().catch(() => ({}));
  }

  if (!res.ok) {
    throw new Error(data.message || data.error || `HTTP error! status: ${res.status}`);
  }

  return {
    success: Boolean(data?.success),
    message: String(data?.message || ''),
    note: data?.note ?? null,
  };
}

export async function apiIncidentAddMaterial(payload: {
  email: string;
  task_id: string;
  material_name: string;
  quantity: number;
  unit: string;
  note?: string;
  unit_price?: number;
}): Promise<{
  success: boolean;
  message: string;
  material?: any | null;
}> {
  const url = `${PUBLIC_BASE_URL}/api/app-db/incidents/add-material`;

  let res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  let data = await res.json().catch(() => ({}));
  const isBodyNotParsed =
    res.status === 422
    && typeof data?.message === 'string'
    && data.message.includes('required')
    && data?.errors?.email
    && data?.errors?.task_id
    && data?.errors?.material_name;

  if (isBodyNotParsed) {
    const body = new URLSearchParams();
    body.set('email', payload.email);
    body.set('task_id', payload.task_id);
    body.set('material_name', payload.material_name);
    body.set('quantity', String(payload.quantity));
    body.set('unit', payload.unit);
    if (typeof payload.note === 'string') body.set('note', payload.note);
    if (typeof payload.unit_price === 'number' && !Number.isNaN(payload.unit_price)) body.set('unit_price', String(payload.unit_price));

    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });
    data = await res.json().catch(() => ({}));
  }

  if (!res.ok) {
    throw new Error(data.message || data.error || `HTTP error! status: ${res.status}`);
  }

  return {
    success: Boolean(data?.success),
    message: String(data?.message || ''),
    material: data?.material ?? null,
  };
}

function mapTaskStatus(status: string): RepairStatus {
  switch (status) {
    case 'backlog':
      return 'new';
    case 'waiting':
    case 'cho-xu-ly':
    case 'moi-tao':
      return 'new';
    case 'todo':
    case 'review':
    case 'accepted':
      return 'accepted';
    case 'selected':
      return 'accepted';
    case 'in_progress':
      return 'in_progress';
    case 'in-progress':
      return 'in_progress';
    case 'done':
    case 'completed':
      return 'completed';
    case 'hoan-thanh':
    case 'closed':
      return 'completed';
    case 'blocked':
      return 'in_progress';
    case 'canceled':
    case 'cancelled':
      return 'cancelled';
    default:
      return 'new';
  }
}

function mapIncidentTaskToRequest(task: any, workspace: any | null, profile: any | null): RepairRequest {
  const workspaceId = String(task.workspace_id || workspace?.workspace_id || 'crm-db');
  const workspaceName = String(task.workspace_name || workspace?.workspace_name || profile?.workspace_name || '').trim();

  // Tra cứu thông tin địa điểm từ mac_id trong cache LAN sites
  const rawMacId = String(task.mac_id || '').trim();
  const siteInfo = rawMacId
    ? (macToSiteCache.get(rawMacId.toUpperCase()) || macToSiteCache.get(rawMacId))
    : undefined;
  const locationLabel = siteInfo?.locationName || workspaceName || workspaceId || 'Chưa rõ vị trí';

  // Thông tin khách hàng từ profile / workspace
  const customerName = String(
    task.customer_name || profile?.full_name || profile?.name ||
    workspace?.company_name || workspace?.workspace_name || workspace?.customer_name || ''
  ).trim() || undefined;
  const customerPhone = String(
    task.customer_phone || profile?.phone || profile?.phone_number ||
    workspace?.phone || workspace?.phone_number || ''
  ).trim() || undefined;
  const customerEmail = String(
    task.customer_email || profile?.email || ''
  ).trim() || undefined;
  const customerAddress = String(
    task.customer_address || workspace?.address || profile?.address || ''
  ).trim() || undefined;

  const assignedTo = task.assignee_id != null && String(task.assignee_id).trim() !== ''
    ? String(task.assignee_id)
    : null;

  const mappedProgressNotes = Array.isArray(task.progress_notes)
    ? task.progress_notes.map((n: any) => {
      const actorId = String(n?.actor?.id ?? profile?.id ?? 'public-user');
      const actorName = n?.actor?.name != null ? String(n.actor.name) : null;
      if (actorName) publicUserNames.set(actorId, actorName);
      return {
        id: String(n.id),
        note: String(n.note || ''),
        images: Array.isArray(n.images) ? n.images : [],
        createdBy: actorId,
        createdAt: String(n.created_at || new Date().toISOString()),
      };
    })
    : [];

  const mappedMaterials = Array.isArray(task.replacement_materials)
    ? task.replacement_materials.map((m: any) => ({
      id: String(m.id),
      repairRequestId: String(task.id),
      name: String(m.material_name || ''),
      quantity: Number(m.quantity || 0),
      unitPrice: Number(m.unit_price || 0),
      totalPrice: Number(m.line_total || (Number(m.quantity || 0) * Number(m.unit_price || 0))),
    }))
    : [];

  const completedAt = task.completed_at ? String(task.completed_at) : null;
  const completionNote = task.completion_note != null ? String(task.completion_note) : '';
  const laborCost = task.labor_cost != null && !Number.isNaN(Number(task.labor_cost))
    ? Number(task.labor_cost)
    : undefined;

  const mappedStatus = mapTaskStatus(String(task.status || 'backlog'));
  const completionReport = mappedStatus === 'completed' && (completedAt || completionNote || laborCost != null)
    ? {
      description: completionNote,
      attachments: [],
      completedAt: completedAt ?? new Date().toISOString(),
      laborCost,
    }
    : null;

  return {
    id: String(task.id),
    machineName: String(task.machine_name || task.title || `Sự cố #${task.id}`),
    locationId: locationLabel,
    workspaceId,
    description: String(task.description || task.title || ''),
    priority: task.priority === 'critical' || task.priority === 'high' || task.priority === 'medium' || task.priority === 'low'
      ? task.priority
      : 'medium',
    status: mappedStatus,
    createdBy: String(profile?.id ?? workspace?.company_id ?? task.reporter_id ?? 'public-user'),
    assignedTo,
    attachments: [],
    progressNotes: mappedProgressNotes,
    materials: mappedMaterials,
    completionReport,
    contactPhone: undefined,
    createdAt: String(task.created_at || task.createAt || task.reported_at || task.updated_at || new Date().toISOString()),
    updatedAt: String(task.updated_at || task.updateAt || task.status_updated_at || task.created_at || new Date().toISOString()),
    acceptedAt: task.assigned_at ? String(task.assigned_at) : null,
    completedAt,
    // Thông tin khách hàng
    customerName,
    customerPhone,
    customerEmail,
    customerAddress,
    // Thông tin máy từ quản lý MAC ID
    macAddress: rawMacId || undefined,
    machineLocationName: siteInfo?.locationName,
    machineLocationAddress: siteInfo?.locationAddress,
    machineContactEmails: siteInfo?.contactEmails?.length ? siteInfo.contactEmails : undefined,
    machineInCharge: siteInfo?.inCharge,
  };
}
// --- Auth ---



export async function apiProfileByEmail(email: string): Promise<{
  success: boolean;
  message: string;
  profile: any | null;
}> {
  const res = await fetch(`${PUBLIC_BASE_URL}/api/app-db/users/profile-by-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ email }),
  });

  const data = await res.json().catch(() => ({}));
  return {
    success: Boolean(data?.success),
    message: String(data?.message || ''),
    profile: data?.profile ?? null,
  };
}

export async function mockLogin(
  email: string,
  password: string,
): Promise<LoginResult> {
  try {
    const data = await fetchApi('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    if (!data.ok) {
      return { success: false, error: data.error || 'Email hoặc mật khẩu không đúng' };
    }

    const user = data.user;
    const mappedUser: User = {
      id: String(user.id),
      username: user.username,
      email: user.email,
      fullName: user.full_name,
      role: user.role === 'admin' ? 'admin' : 'technician',
      locationIds: [],
      workspaceIds: Array.isArray(user.workspaceIds) ? user.workspaceIds.map((id: any) => String(id)) : [],
      companyId: 'default',
      companyName: 'Default Company'
    };

    return { success: true, user: mappedUser };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function mockRegister(
  email: string,
  password: string,
  fullName: string,
  phoneNumber?: string,
  address?: string,
): Promise<LoginResult> {
  try {
    const res = await fetchApi('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        full_name: fullName,
        username: email.split('@')[0],
        phone_number: phoneNumber,
        notes: address,
        lead: 'default',
        role: 'technician'
      })
    });
    const user = res.user;
    const mappedUser: User = {
      id: String(user.id),
      username: user.username,
      email: user.email,
      fullName: user.full_name,
      role: 'technician',
      locationIds: [],
      workspaceIds: Array.isArray(user.workspaceIds) ? user.workspaceIds.map((id: any) => String(id)) : [],
      companyId: 'default',
      companyName: 'Default Company'
    };
    return { success: true, user: mappedUser };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function mockLoginWithGoogle(
  token: string,
): Promise<LoginResult> {
  try {
    const data = await fetchApi('/api/login/google', {
      method: 'POST',
      body: JSON.stringify({ token })
    });

    if (!data.ok) {
      return { success: false, error: data.error || 'Google Login failed' };
    }

    const user = data.user;
    const mappedUser: User = {
      id: String(user.id),
      username: user.username,
      email: user.email,
      fullName: user.full_name,
      role: 'technician',
      locationIds: [],
      workspaceIds: Array.isArray(user.workspaceIds) ? user.workspaceIds.map((id: any) => String(id)) : [],
      companyId: 'default',
      companyName: 'Default Company'
    };

    return { success: true, user: mappedUser };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function mockChangePassword(
  userId: string,
  _currentPassword: string,
  newPassword: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await fetchApi(`/api/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ password: newPassword })
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// --- Repair Requests ---

export async function mockGetRequests(
  filters?: RepairRequestFilters,
  email?: string,
): Promise<RepairRequest[]> {
  if (email) {
    // Đảm bảo cache mac_id → địa điểm đã được tải
    await ensureMacLocationCache();
    const data = await apiIncidentsByEmail(email);
    let requests = data.tasks.map((task: any) => mapIncidentTaskToRequest(task, data.workspace, data.profile));

    if (filters?.status) {
      requests = requests.filter((request) => request.status === filters.status);
    }
    if (filters?.priority) {
      requests = requests.filter((request) => request.priority === filters.priority);
    }
    if (filters?.locationId) {
      requests = requests.filter((request) => request.locationId === filters.locationId);
    }

    return requests;
  }

  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.priority) params.append('priority', filters.priority);

  // Use /api/tasks as backend mapping
  const data = await fetchApi(`/api/tasks?${params.toString()}&lead=default`);
  return (data.rows || []).map((r: any) => ({
    id: String(r.id),
    machineName: r.machine_name,
    locationId: r.location_id || 'loc-1',
    workspaceId: r.workspace_id || 'ws-1',
    description: r.description || r.title,
    priority: r.priority,
    status: r.status === 'backlog' ? 'new' : (r.status === 'done' ? 'completed' : r.status),
    createdBy: r.reporter_name || 'admin',
    assignedTo: r.assignee_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at || r.created_at,
    contactPhone: r.contact_phone,
    progressNotes: [],
    materials: [],
  }));
}

export async function mockGetRequestById(
  id: string,
  email?: string,
): Promise<RepairRequest | null> {
  const requests = await mockGetRequests(undefined, email);
  return requests.find((r) => r.id === id) ?? null;
}

export async function mockCreateRequest(
  data: any
): Promise<RepairRequest> {
  const res = await fetchApi('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({
      machine_name: data.machineName,
      title: data.description.slice(0, 50),
      description: data.description,
      priority: data.priority,
      lead: 'default',
      status: 'backlog',
      agent_uid: 'frontend'
    })
  });
  return res.row;
}

export async function mockUpdateStatus(
  requestId: string,
  newStatus: RepairStatus,
  data?: any
): Promise<RepairRequest> {
  const s_map: any = { "new": "backlog", "accepted": "todo", "in_progress": "in_progress", "completed": "done", "cancelled": "canceled" };
  const res = await fetchApi(`/api/tasks/${requestId}?lead=default`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: s_map[newStatus] || newStatus, lead: 'default',
      assignee_id: data?.assignedTo ? parseInt(data.assignedTo) : undefined
    })
  });
  return res.row;
}

// --- Locations ---

export async function mockGetLocations(): Promise<Location[]> {
  const data = await fetchApi('/api/locations?lead=default');
  return data.rows.map((l: any) => ({
    id: l.id,
    name: l.name,
    address: l.address,
    phone: l.phone,
    machineCount: l.machine_count,
    workspaceId: l.workspace_id,
  }));
}

export async function mockAddLocation(data: any): Promise<Location> {
  const res = await fetchApi('/api/locations', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  return res.row;
}

export async function mockUpdateLocation(id: string, data: Partial<Location>): Promise<Location> {
  const res = await fetchApi(`/api/locations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
  return res.row;
}

export async function mockDeleteLocation(id: string): Promise<{ success: boolean }> {
  await fetchApi(`/api/locations/${id}`, {
    method: 'DELETE'
  });
  return { success: true };
}

// --- Workspaces ---

export async function mockGetWorkspaces(workspaceIds: string[]): Promise<Workspace[]> {
  const data = await fetchApi('/api/workspaces?lead=default');
  const wanted = new Set((workspaceIds || []).map((id) => String(id)));
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const filtered = wanted.size > 0 ? rows.filter((ws: any) => wanted.has(String(ws.id))) : rows;
  return filtered.map((ws: any) => ({
    id: ws.id,
    name: ws.name,
    logo: ws.logo,
    color: ws.color,
    address: ws.address,
  }));
}
