import type { Agent, AgentActionResult, PrinterDriverConfig, ScanConfig, Copier } from '../types/agent';

const BASE_URL = import.meta.env.VITE_API_URL || 'https://agentapi.quanlymay.com';

const pendingRequests = new Map<string, Promise<any>>();

async function fetchApi(path: string, options: RequestInit = {}) {
  const cacheKey = `${options.method || 'GET'}:${path}:${options.body || ''}`;
  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey)!;
  }

  const promise = (async () => {
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Token': 'change-me',
          ...options.headers,
        },
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
      }
      return await res.json();
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, promise);
  return promise;
}

export async function mockGetAgents(lanUid?: string): Promise<Agent[]> {
  try {
    const res = await fetchApi('/api/lan-sites?lead=default');
    const rows = res.rows || [];
    const uniqueAgents = new Map<string, Agent>();

    rows.forEach((row: any) => {
      if (lanUid && row.lan_uid !== lanUid) return;

      (row.agents || []).forEach((agent: any) => {
        if (!uniqueAgents.has(agent.agent_uid)) {
          const hasFtpSites = Array.isArray(agent.ftp_sites) && agent.ftp_sites.length > 0;
          const isFtpRunning = hasFtpSites && agent.ftp_sites.some((site: any) => site.running);
          
          uniqueAgents.set(agent.agent_uid, {
            id: agent.agent_uid,
            hostname: agent.hostname || agent.agent_uid || 'Agent',
            ipAddress: agent.local_ip || '',
            os: 'Windows',
            status: agent.is_online ? 'online' : 'offline',
            lastSeen: agent.updated_at || '',
            driverInstalled: true,
            scanSmbInstalled: false,
            scanFtpInstalled: isFtpRunning,
            scanConfigured: isFtpRunning,
          });
        }
      });
    });

    return Array.from(uniqueAgents.values());
  } catch (err) {
    console.error('Failed to get agents from lan-sites:', err);
    return [];
  }
}

export async function mockInstallPrinterDriver(agentId: string, config: PrinterDriverConfig): Promise<AgentActionResult> {
  try {
    const res = await fetchApi(`/api/devices/${config.printerIp}/install-driver`, {
      method: 'POST',
      body: JSON.stringify({
        brand: config.brand,
        model: config.model,
        driver_name: config.driverName,
        driver_url: config.driverUrl || '',
      }),
    });
    return {
      success: res.ok !== false,
      message: res.message || `Lệnh cài driver đã được gửi thành công.`,
      agentId
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Lỗi cài driver: ${err.message}`,
      agentId
    };
  }
}

export async function getDriversCatalog(brand: string): Promise<any[]> {
  try {
    const res = await fetchApi(`/api/drivers/${brand.toLowerCase()}`);
    if (res.ok && res.data) {
      return res.data;
    }
    return [];
  } catch (err) {
    console.error('Failed to fetch drivers catalog:', err);
    return [];
  }
}

export async function mockInstallScan(agentId: string, _config: ScanConfig): Promise<AgentActionResult> {
  return { success: true, message: `Lệnh cài scan đã được gửi đến agent ${agentId}`, agentId };
}

export async function mockBulkInstallDriver(_config: PrinterDriverConfig): Promise<AgentActionResult[]> {
  return [];
}

export async function mockBulkInstallScan(_config: ScanConfig): Promise<AgentActionResult[]> {
  return [];
}

export async function mockSendNotification(_agentId: string | 'all', _message: string): Promise<AgentActionResult> {
  return { success: true, message: `Đã gửi thông báo` };
}

export interface LanSiteInfo {
  lead: string;
  lan_uid: string;
  lan_name: string;
  address?: string;
  subnet_cidr?: string;
  gateway_ip?: string;
  gateway_mac?: string;
  fingerprint_signature?: string;
  active_agents: number;
  agents: any[];
  emails: any[];
  printers: any[];
}

export async function getLanSites(): Promise<LanSiteInfo[]> {
  try {
    const res = await fetchApi('/api/lan-sites?lead=default');
    return res.rows || [];
  } catch (err) {
    console.error('Failed to fetch LAN sites:', err);
    return [];
  }
}

export async function mockGetCopiers(lanUid?: string): Promise<Copier[]> {
  try {
    const res = await fetchApi('/api/lan-sites?lead=default');
    const rows = res.rows || [];
    const uniqueCopiers = new Map<string, Copier>();

    rows.forEach((row: any) => {
      if (lanUid && row.lan_uid !== lanUid) return;

      (row.printers || []).forEach((p: any) => {
        const key = p.mac_id || p.ip || String(p.id);
        if (!key || uniqueCopiers.has(key)) return;

        const printerType = (p.printer_type || p.printer_name || '').toLowerCase();
        let brand: 'Ricoh' | 'Toshiba' | 'Xerox' = 'Ricoh';
        if (printerType.includes('toshiba')) brand = 'Toshiba';
        else if (printerType.includes('xerox') || printerType.includes('fujifilm')) brand = 'Xerox';

        const rawName: string = p.printer_name || '';
        const model = rawName.replace(/^(ricoh|toshiba|xerox|fujifilm)\s*/i, '').trim() || 'Unknown';

        uniqueCopiers.set(key, {
          id: String(p.id),
          name: rawName || 'Máy photocopy',
          brand,
          model,
          ipAddress: p.ip || '',
          macId: p.mac_id || '',
          status: p.is_online ? 'online' as const : 'offline' as const,
          lastSeen: '',
          connectedPCs: (row.agents || []).map((a: any) => a.hostname).filter(Boolean),
          driverVersion: '',
          location: row.lan_name || row.lan_uid || '',
          isConfigured: p.enabled ?? true,
        });
      });
    });

    return Array.from(uniqueCopiers.values());
  } catch (err) {
    console.error('Failed to get copiers from lan-sites:', err);
    return [];
  }
}

export async function mockConfigureCopier(
  copierId: string,
  _config: { macId: string; ipAddress?: string; webUsername: string; webPassword: string }
): Promise<AgentActionResult> {
  return { success: true, message: `Đã cập nhật cấu hình máy ${copierId}` };
}

export async function mockDeleteCopier(copierId: string): Promise<AgentActionResult> {
  return { success: true, message: `Đã xóa máy photocopy ${copierId}` };
}

export async function mockUpdateAgent(agentId: string, _data: Partial<Agent>): Promise<AgentActionResult> {
  return { success: true, message: `Đã cập nhật thông tin agent ${agentId}` };
}

export async function mockDeleteAgent(agentId: string): Promise<AgentActionResult> {
  return { success: true, message: `Đã xóa agent ${agentId}` };
}

// ── REAL API CALLS TO VPS BACKEND ──

export async function saveCopierCredentials(printerId: string, user: string, pass: string): Promise<any> {
  return fetchApi(`/api/devices/${printerId}/credentials`, {
    method: 'PATCH',
    body: JSON.stringify({ auth_user: user, auth_password: pass })
  });
}

export async function triggerFetchAddressBook(printerId: string, agentUid?: string): Promise<any> {
  const path = agentUid ? `/api/devices/${printerId}/fetch-address-book?agent_uid=${agentUid}` : `/api/devices/${printerId}/fetch-address-book`;
  return fetchApi(path, { method: 'POST' });
}

export async function getCommandStatus(commandId: number): Promise<any> {
  return fetchApi(`/api/commands/${commandId}/status`);
}

export async function addEmailDestination(printerId: string, name: string, email: string, agentUid?: string): Promise<any> {
  const path = agentUid ? `/api/devices/${printerId}/add-email-dest?agent_uid=${agentUid}` : `/api/devices/${printerId}/add-email-dest`;
  return fetchApi(path, {
    method: 'POST',
    body: JSON.stringify({ name, email })
  });
}

export async function addPrivateLanEmail(lead: string, lanUid: string, pcName: string, email: string): Promise<any> {
  return fetchApi('/api/lan-emails', {
    method: 'POST',
    body: JSON.stringify({ lead, lan_uid: lanUid, email, email_type: 'private', pc_name: pcName })
  });
}

export async function deleteEmailDestination(printerId: string, regNo: string, entryId: string, agentUid?: string): Promise<any> {
  return fetchApi(`/api/devices/${printerId}/delete-email-dest`, {
    method: 'POST',
    body: JSON.stringify({ registration_no: regNo, entry_id: entryId, agent_uid: agentUid })
  });
}

export async function modifyDeviceAddress(body: any): Promise<any> {
  return fetchApi('/api/devices/action', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export async function deleteLanEmail(emailId: number): Promise<any> {
  return fetchApi(`/api/lan-emails/${emailId}`, {
    method: 'DELETE'
  });
}

export async function getScansFiles(lanUid: string, email: string): Promise<any> {
  return fetchApi(`/api/scans/files?lan_uid=${encodeURIComponent(lanUid)}&email=${encodeURIComponent(email)}`);
}

export async function installDriverOnAgent(printerId: string, brand: string, model: string, driverName: string, driverUrl: string): Promise<any> {
  return fetchApi(`/api/devices/${printerId}/install-driver`, {
    method: 'POST',
    body: JSON.stringify({ brand, model, driver_name: driverName, driver_url: driverUrl })
  });
}

export async function getAgentSettings(agentUid: string): Promise<any> {
  return fetchApi(`/api/agents/${agentUid}/settings?lead=default`);
}

export async function getJobs(lead?: string, lanUid?: string, agentUid?: string): Promise<any> {
  const params = new URLSearchParams();
  if (lead) params.append('lead', lead);
  if (lanUid) params.append('lan_uid', lanUid);
  if (agentUid) params.append('agent_uid', agentUid);
  params.append('t', Date.now().toString());
  return fetchApi(`/api/jobs?${params.toString()}`);
}

export async function updateAgentSettings(agentUid: string, settings: { scan_auto_open_file?: boolean; scan_auto_open_dir?: boolean }): Promise<any> {
  return fetchApi(`/api/agents/${agentUid}/settings?lead=default`, {
    method: 'POST',
    body: JSON.stringify(settings),
  });
}

export async function triggerAgentUtility(agentUid: string, action: string, payload?: any): Promise<any> {
  return fetchApi(`/api/agents/${agentUid}/utility/${action}?lead=default`, {
    method: 'POST',
    body: payload ? JSON.stringify(payload) : undefined,
  });
}

export async function getAgentUtilityCommands(agentUid: string): Promise<any> {
  return fetchApi(`/api/agents/${agentUid}/utility-commands?lead=default&t=${Date.now()}`);
}

export async function triggerAgentUtilityExec(agentUid: string, command: string, commandContent: string): Promise<any> {
  return fetchApi(`/api/agents/${agentUid}/utility/exec?lead=default`, {
    method: 'POST',
    body: JSON.stringify({ command, command_content: commandContent }),
  });
}

export async function triggerEmergencyRestart(agentUid: string): Promise<any> {
  return fetchApi(`/api/agents/${agentUid}/emergency-restart?lead=default`, {
    method: 'POST',
    body: '{}',
  });
}

