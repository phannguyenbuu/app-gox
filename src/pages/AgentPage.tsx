import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlowCard } from '../components/ui/GlowCard';
import { AnimatedList } from '../components/ui/AnimatedList';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import {
  getLanSites,
  saveCopierCredentials,
  triggerFetchAddressBook,
  getCommandStatus,
  addEmailDestination,
  addPrivateLanEmail,
  deleteEmailDestination,
  deleteLanEmail,
  modifyDeviceAddress,
  getScansFiles,
  installDriverOnAgent,
  getAgentSettings,
  updateAgentSettings,
  triggerAgentUtility,
  getAgentUtilityCommands,
  triggerAgentUtilityExec,
} from '../api/mockAgentApi';
import type { LanSiteInfo } from '../api/mockAgentApi';

const BASE_URL = import.meta.env.VITE_API_URL || 'https://agentapi.quanlymay.com';

interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'pending';
}

function getDestinationStatusHtml(entry: any, emails: any[], agents: any[]) {
  const emailVal = entry.email_address || entry.email || '';
  const folderVal = entry.physical_path || entry.folder || entry.folder_path || '';
  const addressValue = (emailVal || folderVal || '').trim();
  
  if (!addressValue) {
    return { label: 'UNKNOWN', type: 'error', title: '' };
  }
  
  const isEmail = entry.type === 'Email' || emailVal.includes('@');
  if (isEmail) {
    return { label: '✔ ACTIVE', type: 'success', title: '' };
  }

  const matchedEmail = emails.find(e => e.email.toLowerCase().trim() === addressValue.toLowerCase().trim());
  const portNumber = matchedEmail ? matchedEmail.email_number : Number(entry.registration_no);

  if (!portNumber || isNaN(portNumber)) {
    return { label: '✔ ACTIVE', type: 'success', title: '' };
  }

  const masterAgent = (agents || []).find(a => a.is_master && a.is_online) || (agents || []).find(a => a.is_online) || (agents || [])[0];
  if (masterAgent) {
    const site = (masterAgent.ftp_sites || []).find((s: any) => Number(s.port) === Number(portNumber));
    if (site) {
      const expectedPath = ('C:/Scangox/' + addressValue).toLowerCase().replace(/\\/g, '/');
      const actualPath = (site.path || '').toLowerCase().replace(/\\/g, '/');
      const isCorrectPath = actualPath === expectedPath;

      if (site.running && isCorrectPath) {
        return { label: '✔ OK', type: 'success', title: '' };
      } else if (site.running && !isCorrectPath) {
        return { label: '⚠ CONFLICT', type: 'warning', title: `FTP site uses folder: ${site.path} instead of expected: C:/Scangox/${addressValue}` };
      } else if (site.error && (site.error.toLowerCase().includes('in use') || site.error.toLowerCase().includes('busy') || site.error.toLowerCase().includes('already bound') || site.error.toLowerCase().includes('already in use'))) {
        return { label: '❌ PORT BUSY', type: 'error', title: site.error };
      } else {
        return { label: '❌ FAILED', type: 'error', title: site.error || 'FTP site failed to start' };
      }
    } else {
      return { label: 'PENDING SETUP', type: 'warning', title: '' };
    }
  } else {
    return { label: 'OFFLINE', type: 'neutral', title: '' };
  }
}

// Mirrors backend _safe_path_token: strips accents, replaces non-alphanumeric with '-'
function safePathToken(value: string): string {
  const text = (value || '').trim();
  if (!text) return 'unknown';
  const ascii = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._@-]/g, '-').replace(/^[\s\-_.]+|[\s\-_.]+$/g, '');
  return ascii || 'unknown';
}

export function AgentPage() {
  const [lanSites, setLanSites] = useState<LanSiteInfo[]>([]);
  const [selectedLanUid, setSelectedLanUid] = useState<string>(() => {
    return localStorage.getItem('goxprint_selected_lan_uid') || '';
  });
  const [lanSitesLoading, setLanSitesLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'agents' | 'copiers'>(() => {
    const saved = localStorage.getItem('goxprint_active_tab');
    return (saved === 'agents' || saved === 'copiers') ? saved : 'agents';
  });

  // Polling / Command Status Map (key: printerId or entryRegNo, value: status message)
  const [commandStatus, setCommandStatus] = useState<Record<string, { message: string; isPending: boolean }>>({});
  
  // Collapsible lists
  const [expandedPrinters, setExpandedPrinters] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('goxprint_expanded_printers');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [expandedDrivers, setExpandedDrivers] = useState<Record<string, boolean>>({});
  const [expandedDriverMenus, setExpandedDriverMenus] = useState<Record<string, boolean>>({});

  // Credentials input states (key: printerId)
  const [copierCredentials, setCopierCredentials] = useState<Record<string, { user: string; pass: string }>>({});
  const [saveAuthLoading, setSaveAuthLoading] = useState<Record<string, boolean>>({});

  // Target Agent Select state (key: printerId, value: agentUid)
  const [selectedTargetAgents, setSelectedTargetAgents] = useState<Record<string, string>>({});

  // Live (uncached) address books loaded from agents (key: printerId)
  const [liveAddressBooks, setLiveAddressBooks] = useState<Record<string, any>>({});

  // Toast notifications
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Modals
  const [activeModal, setActiveModal] = useState<'storage' | 'public_ftp' | 'private_ftp' | 'info_detail' | 'ftp_detail' | 'utilities' | 'edit_ip' | null>(null);
  const [selectedUtilityAgent, setSelectedUtilityAgent] = useState<any | null>(null);
  const [ftpDetailData, setFtpDetailData] = useState<{ port: string | number; path: string; error?: string } | null>(null);
  const [editIpModalData, setEditIpModalData] = useState<{
    printerId: string;
    entry: any;
    currentIp: string;
    newIp: string;
  } | null>(null);
  
  // Custom Confirm Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Storage Modal states
  const [storageModalData, setStorageModalData] = useState<{ lanUid: string; email: string }>({ lanUid: '', email: '' });
  const [storageFiles, setStorageFiles] = useState<any[]>([]);
  const [storageLoading, setStorageLoading] = useState(false);

  // Add Public FTP states
  const [publicFtpData, setPublicFtpData] = useState<{ printerId: string; email: string; agentUid: string }>({ printerId: '', email: '', agentUid: '' });
  const [publicFtpLoading, setPublicFtpLoading] = useState(false);

  // Add Private FTP states
  const [privateFtpData, setPrivateFtpData] = useState<{ lanUid: string; agentUid: string; email: string }>({ lanUid: '', agentUid: '', email: '' });
  const [privateFtpLoading, setPrivateFtpLoading] = useState(false);

  // Info Detail states
  const [infoDetailData] = useState<{ regNo: string; name: string; details: any; error?: string }>({ regNo: '', name: '', details: null });

  // Scroll and tracking references
  const [initialLastViewedId] = useState<string>(() => {
    return localStorage.getItem('goxprint_last_viewed_copier_id') || '';
  });

  // ── LOCAL STORAGE SYNC ──
  useEffect(() => {
    localStorage.setItem('goxprint_active_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('goxprint_expanded_printers', JSON.stringify(expandedPrinters));
  }, [expandedPrinters]);

  // ── TOAST HELPER ──
  const showToast = useCallback((message: string, type: Toast['type'] = 'info', duration = 5000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  // Replace a toast by fixed ID — removes old one first, then adds new
  const replaceToast = useCallback((fixedId: string, message: string, type: Toast['type'] = 'info') => {
    setToasts((prev) => [
      ...prev.filter((t) => t.id !== fixedId),
      { id: fixedId, message, type }
    ]);
  }, []);

  // ── FETCH DATA ──
  const fetchLanSitesData = useCallback(async (showLoader = false) => {
    if (showLoader) setLanSitesLoading(true);
    try {
      const data = await getLanSites();
      setLanSites(data);
      
      // Auto select first LAN if none selected or invalid
      const savedLanUid = localStorage.getItem('goxprint_selected_lan_uid');
      const isValidSaved = savedLanUid && data.some(site => site.lan_uid === savedLanUid);
      if (data.length > 0) {
        if (isValidSaved) {
          setSelectedLanUid(savedLanUid);
        } else {
          setSelectedLanUid(data[0].lan_uid);
          localStorage.setItem('goxprint_selected_lan_uid', data[0].lan_uid);
        }
      }
    } catch (err) {
      console.error(err);
      showToast('Không thể kết nối dữ liệu VPS', 'error');
    } finally {
      if (showLoader) setLanSitesLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchLanSitesData(true);
  }, []);

  // Computed active LAN
  const selectedLan = useMemo(() => {
    return lanSites.find((site) => site.lan_uid === selectedLanUid);
  }, [lanSites, selectedLanUid]);

  const getTargetAgentUid = useCallback((printerId: string | number) => {
    const pId = Number(printerId);
    const printer = selectedLan?.printers?.find((p: any) => Number(p.id) === pId);
    if (!printer || !selectedLan) return '';
    const onlineAgents = (selectedLan.agents || []).filter((a: any) => a.is_online);
    const selected = selectedTargetAgents[pId];
    if (selected) {
      const isSelOnline = onlineAgents.some((a: any) => a.agent_uid === selected);
      if (isSelOnline) return selected;
    }
    if (printer.agent_uid) {
      const isAssignedOnline = onlineAgents.some((a: any) => a.agent_uid === printer.agent_uid);
      if (isAssignedOnline) return printer.agent_uid;
    }
    if (onlineAgents.length > 0) {
      return onlineAgents[0].agent_uid;
    }
    return printer.agent_uid || '';
  }, [selectedLan, selectedTargetAgents]);

  // State to store scan file counts for each private email destination on VPS
  const [emailFileCounts, setEmailFileCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!selectedLan || !selectedLan.emails) {
      setEmailFileCounts({});
      return;
    }
    
    let isMounted = true;
    const fetchCounts = async () => {
      const counts: Record<string, number> = {};
      const privateEmails = selectedLan.emails.filter(e => e.email_type === 'private');
      
      await Promise.all(
        privateEmails.map(async (em) => {
          try {
            const res = await getScansFiles(selectedLan.lan_uid, em.email);
            if (isMounted) {
              if (res.ok && Array.isArray(res.rows)) {
                counts[em.email] = res.rows.length;
              } else {
                counts[em.email] = 0;
              }
            }
          } catch (err) {
            console.error(`Failed to fetch scan files count for ${em.email}`, err);
            if (isMounted) {
              counts[em.email] = 0;
            }
          }
        })
      );
      if (isMounted) {
        setEmailFileCounts(counts);
      }
    };
    
    fetchCounts();
    return () => {
      isMounted = false;
    };
  }, [selectedLan]);

  // Agent utilities states
  const [scanAutoOpenFile, setScanAutoOpenFile] = useState(true);
  const [scanAutoOpenDir, setScanAutoOpenDir] = useState(true);
  const [utilitySettingsLoading, setUtilitySettingsLoading] = useState(false);
  const [utilityActionPending, setUtilityActionPending] = useState<string | null>(null);
  const [utilityStatusMsg, setUtilityStatusMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [utilityCommands, setUtilityCommands] = useState<any[]>([]);
  const [utilityCommandsLoading, setUtilityCommandsLoading] = useState(false);
  const [customRunCommand, setCustomRunCommand] = useState('');

  const loadUtilitySettings = useCallback(async (agent: any) => {
    if (!agent) return;
    setUtilitySettingsLoading(true);
    setUtilityStatusMsg(null);
    
    try {
      const data = await getAgentSettings(agent.agent_uid);
      if (data.ok) {
        setScanAutoOpenFile(!!data.scan_auto_open_file);
        setScanAutoOpenDir(!!data.scan_auto_open_dir);
      } else {
        throw new Error(data.error || 'Agent không tồn tại trên VPS');
      }
    } catch (err: any) {
      console.error('Failed to load agent settings:', err);
      const errorMsg = err.message?.includes('Agent not found') || err.message?.includes('404')
        ? `Agent này chưa được đăng ký trên VPS backend. Vui lòng đảm bảo agent đang chạy và đã kết nối.`
        : `Không thể tải cài đặt từ VPS: ${err.message}`;
      setUtilityStatusMsg({
        text: errorMsg,
        isError: true
      });
      // Set defaults on error
      setScanAutoOpenFile(true);
      setScanAutoOpenDir(true);
    } finally {
      setUtilitySettingsLoading(false);
    }
  }, []);

  const handleToggleSetting = useCallback(async (key: 'scan_auto_open_file' | 'scan_auto_open_dir', currentValue: boolean) => {
    if (!selectedUtilityAgent) return;
    const nextValue = !currentValue;
    
    // Optimistic update
    if (key === 'scan_auto_open_file') {
      setScanAutoOpenFile(nextValue);
    } else {
      setScanAutoOpenDir(nextValue);
    }

    try {
      const data = await updateAgentSettings(selectedUtilityAgent.agent_uid, {
        [key]: nextValue
      });
      if (!data.ok) {
        throw new Error(data.error || 'Failed to update setting');
      }
      setUtilityStatusMsg({
        text: 'Đã cập nhật cài đặt thành công.',
        isError: false
      });
    } catch (err: any) {
      console.error('Failed to update agent setting:', err);
      // Rollback
      if (key === 'scan_auto_open_file') {
        setScanAutoOpenFile(currentValue);
      } else {
        setScanAutoOpenDir(currentValue);
      }
      setUtilityStatusMsg({
        text: `Lỗi cập nhật cài đặt: ${err.message}`,
        isError: true
      });
    }
  }, [selectedUtilityAgent]);

  const handleTriggerUtility = useCallback(async (action: 'printers' | 'scan' | 'dxdiag' | 'change_ip' | 'run_command', payload?: any) => {
    if (!selectedUtilityAgent) return;
    setUtilityActionPending(action);
    setUtilityStatusMsg({ text: '⌛ Đang gửi lệnh tới Agent...', isError: false });
    
    const backendAction = action === 'printers' ? 'devices_and_printers' : (action === 'scan' ? 'open_scan_folder' : (action === 'change_ip' ? 'change_ip' : (action === 'run_command' ? 'run_command' : 'dxdiag')));
    
    try {
      const res = await triggerAgentUtility(selectedUtilityAgent.agent_uid, backendAction, payload);
      if (!res.ok || !res.command_id) {
        throw new Error(res.error || 'Không thể tạo lệnh tiện ích');
      }
      
      const commandId = res.command_id;
      const maxPollMs = 60000;
      const pollInterval = 1000;
      const startTime = Date.now();
      
      const timer = setInterval(async () => {
        try {
          const elapsed = Date.now() - startTime;
          if (elapsed > maxPollMs) {
            clearInterval(timer);
            setUtilityStatusMsg({ text: 'Yêu cầu quá thời gian chờ (60s)', isError: true });
            setUtilityActionPending(null);
            return;
          }
          
          const statusRes = await getCommandStatus(commandId);
          if (statusRes.status === 'success') {
            clearInterval(timer);
            setUtilityStatusMsg({ text: '⚡ Thực hiện lệnh tiện ích thành công!', isError: false });
            setUtilityActionPending(null);
          } else if (statusRes.status === 'failed' || !statusRes.ok) {
            clearInterval(timer);
            setUtilityStatusMsg({ text: `❌ Thất bại: ${statusRes.error || 'Lệnh thất bại từ Agent'}`, isError: true });
            setUtilityActionPending(null);
          } else {
            const elapsedSec = Math.round(elapsed / 1000);
            if (statusRes.received_at) {
              setUtilityStatusMsg({ text: `⚡ Agent đã nhận lệnh - đang mở tiện ích... (${elapsedSec}s)`, isError: false });
            } else {
              setUtilityStatusMsg({ text: `⌛ Đang chuyển lệnh tới Agent... (${elapsedSec}s)`, isError: false });
            }
          }
        } catch (pollErr: any) {
          console.error('Error polling utility status:', pollErr);
        }
      }, pollInterval);
      
    } catch (err: any) {
      console.error(`Failed to trigger ${action}:`, err);
      setUtilityStatusMsg({
        text: `Lỗi kết nối hoặc gửi lệnh: ${err.message}`,
        isError: true
      });
      setUtilityActionPending(null);
    }
  }, [selectedUtilityAgent]);

  // Dynamic exec: gửi command_content từ JSON đến agent để exec()
  const handleTriggerUtilityExec = useCallback(async (command: string, commandContent: string) => {
    if (!selectedUtilityAgent) return;
    setUtilityActionPending(command);
    setUtilityStatusMsg({ text: '⌛ Đang gửi lệnh tới Agent...', isError: false });
    try {
      const res = await triggerAgentUtilityExec(selectedUtilityAgent.agent_uid, command, commandContent);
      if (!res.ok || !res.command_id) {
        throw new Error(res.error || 'Không thể tạo lệnh tiện ích');
      }
      const commandId = res.command_id;
      const maxPollMs = 60000;
      const startTime = Date.now();
      const timer = setInterval(async () => {
        try {
          const elapsed = Date.now() - startTime;
          if (elapsed > maxPollMs) {
            clearInterval(timer);
            setUtilityStatusMsg({ text: 'Yêu cầu quá thời gian chờ (60s)', isError: true });
            setUtilityActionPending(null);
            return;
          }
          const statusRes = await getCommandStatus(commandId);
          if (statusRes.status === 'success') {
            clearInterval(timer);
            setUtilityStatusMsg({ text: '⚡ Thực hiện lệnh thành công!', isError: false });
            setUtilityActionPending(null);
          } else if (statusRes.status === 'failed' || !statusRes.ok) {
            clearInterval(timer);
            setUtilityStatusMsg({ text: `❌ Thất bại: ${statusRes.error || 'Lệnh thất bại từ Agent'}`, isError: true });
            setUtilityActionPending(null);
          } else {
            const elapsedSec = Math.round(elapsed / 1000);
            setUtilityStatusMsg({ text: `⌛ Đang xử lý... (${elapsedSec}s)`, isError: false });
          }
        } catch (pollErr: any) {
          console.error('Poll error:', pollErr);
        }
      }, 1000);
    } catch (err: any) {
      setUtilityStatusMsg({ text: `Lỗi: ${err.message}`, isError: true });
      setUtilityActionPending(null);
    }
  }, [selectedUtilityAgent]);

  useEffect(() => {
    if (activeModal === 'utilities' && selectedUtilityAgent) {
      loadUtilitySettings(selectedUtilityAgent);
      // Fetch dynamic command list from backend JSON
      setUtilityCommandsLoading(true);
      getAgentUtilityCommands(selectedUtilityAgent.agent_uid)
        .then((res: any) => {
          if (res?.ok && Array.isArray(res.commands)) {
            setUtilityCommands(res.commands);
          }
        })
        .catch((err: any) => console.error('Failed to load utility commands:', err))
        .finally(() => setUtilityCommandsLoading(false));
    }
  }, [activeModal, selectedUtilityAgent, loadUtilitySettings]);

  // Filter out offline and Unknown Printers, and sort the last viewed one to the top
  const filteredPrinters = useMemo(() => {
    if (!selectedLan) return [];
    const filtered = (selectedLan.printers || []).filter((p: any) => {
      // 1. Không show các máy in offline
      if (!p.is_online) return false;
      
      // 2. Không show Unknown Printer
      const name = (p.printer_name || '').toLowerCase().trim();
      if (!name || name.includes('unknown') || name === 'unknown printer') return false;

      // 3. Lọc generic printer như pdf, fax, brother, etc.
      if (
        name.includes('pdf') ||
        name.includes('fax') ||
        name.includes('brother') ||
        name.includes('canon lbp') ||
        name.includes('rustdesk')
      ) {
        return false;
      }

      return true;
    });

    if (initialLastViewedId) {
      return [...filtered].sort((a, b) => {
        const aMatch = String(a.id) === initialLastViewedId;
        const bMatch = String(b.id) === initialLastViewedId;
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        return 0;
      });
    }

    return filtered;
  }, [selectedLan, initialLastViewedId]);

  const handleCopierClick = (printerId: string) => {
    localStorage.setItem('goxprint_last_viewed_copier_id', printerId);
  };

  // Pre-fill target agent and credentials maps when selectedLan changes
  useEffect(() => {
    if (selectedLan) {
      const defaultTargets: Record<string, string> = {};
      const defaultCreds: Record<string, { user: string; pass: string }> = {};

      selectedLan.printers.forEach((p) => {
        // Target agent default (first online agent or printer.agent_uid)
        const onlineAgents = (selectedLan.agents || []).filter((a) => a.is_online);
        const matchedAgent = onlineAgents.find((a) => a.agent_uid === p.agent_uid) || onlineAgents[0];
        defaultTargets[p.id] = matchedAgent ? matchedAgent.agent_uid : (p.agent_uid || '');

        // Web credentials
        defaultCreds[p.id] = { user: p.auth_user || '', pass: p.auth_password || '' };
      });

      setSelectedTargetAgents((prev) => ({ ...defaultTargets, ...prev }));
      setCopierCredentials((prev) => ({ ...defaultCreds, ...prev }));
    }
  }, [selectedLan]);

  // ── SAVE AUTH (WEB CREDENTIALS) ──
  const handleSaveAuth = async (printerId: string) => {
    const creds = copierCredentials[printerId] || { user: '', pass: '' };
    setSaveAuthLoading((prev) => ({ ...prev, [printerId]: true }));
    try {
      const res = await saveCopierCredentials(printerId, creds.user, creds.pass);
      if (res.ok) {
        showToast('Đã lưu tài khoản Web UI máy photocopy thành công', 'success');
        // Update local status in state
        setLanSites((prevSites) =>
          prevSites.map((site) => ({
            ...site,
            printers: site.printers.map((p) =>
              String(p.id) === String(printerId)
                ? { ...p, auth_user: creds.user, auth_password: creds.pass }
                : p
            ),
          }))
        );
      } else {
        throw new Error(res.error || 'Lưu thất bại');
      }
    } catch (err: any) {
      showToast(`Lỗi lưu Auth: ${err.message}`, 'error');
    } finally {
      setSaveAuthLoading((prev) => ({ ...prev, [printerId]: false }));
    }
  };

  // ── POLLING COMMAND STATUS ──
  const pollCommandStatus = (
    commandId: number,
    targetKey: string,
    onSuccess: (pollData: any) => void,
    onFailed: (errorMsg: string) => void,
    pendingLabel = 'Đang thực hiện lệnh...'
  ) => {
    setCommandStatus((prev) => ({ ...prev, [targetKey]: { message: pendingLabel, isPending: true } }));

    const maxPollMs = 180000;
    const pollInterval = 2000;
    const startTime = Date.now();
    let toastReceivedShown = false;

    const timer = setInterval(async () => {
      try {
        const elapsed = Date.now() - startTime;
        if (elapsed > maxPollMs) {
          clearInterval(timer);
          setCommandStatus((prev) => {
            const updated = { ...prev };
            delete updated[targetKey];
            return updated;
          });
          onFailed('Lệnh bị quá thời gian (Timeout 180s)');
          return;
        }

        const res = await getCommandStatus(commandId);
        const elapsedSec = Math.round(elapsed / 1000);

        if (res.status === 'success') {
          clearInterval(timer);
          setCommandStatus((prev) => {
            const updated = { ...prev };
            delete updated[targetKey];
            return updated;
          });
          onSuccess(res);
        } else if (res.status === 'failed' || !res.ok) {
          clearInterval(timer);
          setCommandStatus((prev) => {
            const updated = { ...prev };
            delete updated[targetKey];
            return updated;
          });
          onFailed(res.error || 'Lệnh thực hiện thất bại từ Agent');
        } else {
          // Command is pending
          if (res.received_at) {
            setCommandStatus((prev) => ({
              ...prev,
              [targetKey]: { message: `⚡ Agent đã nhận - đang thực thi... (${elapsedSec}s)`, isPending: true },
            }));
            if (!toastReceivedShown) {
              toastReceivedShown = true;
              showToast('Agent đã nhận lệnh và đang truy cập máy photocopy...', 'info', 3000);
            }
          } else {
            setCommandStatus((prev) => ({
              ...prev,
              [targetKey]: { message: `⌛ Đang gửi lệnh tới agent... (${elapsedSec}s)`, isPending: true },
            }));
          }
        }
      } catch (err: any) {
        console.warn('Poll command error:', err.message);
      }
    }, pollInterval);
  };

  // ── REFECTH / SYNC ADDRESS BOOK ──
  const handleRefetchAddressBook = async (printerId: string) => {
    const targetAgent = getTargetAgentUid(printerId);
    showToast('Bắt đầu gửi yêu cầu đồng bộ danh bạ máy in...', 'info', 3000);
    
    try {
      const res = await triggerFetchAddressBook(printerId, targetAgent || undefined);
      if (!res.ok || !res.command_id) {
        throw new Error(res.error || 'Không thể tạo lệnh đồng bộ');
      }

      pollCommandStatus(
        res.command_id,
        printerId,
        async (pollData: any) => {
          showToast('Đã đồng bộ danh bạ máy photocopy thành công!', 'success');
          await fetchLanSitesData();
          if (pollData && pollData.address_book_sync) {
            setLiveAddressBooks((prev) => ({ ...prev, [printerId]: pollData.address_book_sync }));
          }
          // Auto expand and view address book after sync
          setExpandedPrinters((prev) => ({ ...prev, [printerId]: true }));
        },
        (errorMsg) => {
          showToast(`Đồng bộ thất bại: ${errorMsg}`, 'error');
        },
        '⌛ Đang đồng bộ danh bạ...'
      );
    } catch (err: any) {
      showToast(`Lỗi gửi lệnh đồng bộ: ${err.message}`, 'error');
    }
  };

  // ── ADD PUBLIC FTP ──
  const handleAddPublicFtp = async () => {
    const { printerId, email, agentUid } = publicFtpData;
    if (!email || !email.includes('@')) {
      showToast('Địa chỉ email không hợp lệ', 'error');
      return;
    }
    setPublicFtpLoading(true);
    showToast('Đang tạo yêu cầu thêm FTP/Email lên máy in...', 'info', 3000);

    try {
      const res = await addEmailDestination(printerId, email, agentUid || undefined);
      setPublicFtpLoading(false);
      setActiveModal(null);

      if (!res.ok || !res.command_id) {
        throw new Error(res.error || 'Lỗi gửi lệnh');
      }

      pollCommandStatus(
        res.command_id,
        printerId,
        async (pollData: any) => {
          showToast(`Đã thêm điểm scan ${email} thành công!`, 'success');
          await fetchLanSitesData();
          if (pollData && pollData.address_book_sync) {
            setLiveAddressBooks((prev) => ({ ...prev, [printerId]: pollData.address_book_sync }));
          }
        },
        (errorMsg) => {
          showToast(`Thêm điểm scan thất bại: ${errorMsg}`, 'error');
        },
        `⌛ Đang thêm điểm scan ${email}...`
      );
    } catch (err: any) {
      setPublicFtpLoading(false);
      showToast(`Lỗi: ${err.message}`, 'error');
    }
  };

  // ── ADD PRIVATE FTP ──
  const handleAddPrivateFtp = async () => {
    const { lanUid, agentUid, email } = privateFtpData;
    if (!email || !email.includes('@')) {
      showToast('Địa chỉ email không hợp lệ', 'error');
      return;
    }
    setPrivateFtpLoading(true);
    try {
      const res = await addPrivateLanEmail('default', lanUid, agentUid, email);
      setPrivateFtpLoading(false);
      setActiveModal(null);

      if (res.ok) {
        showToast('Đã thêm Private FTP thành công', 'success');
        await fetchLanSitesData();
      } else {
        throw new Error(res.error || 'Lỗi server');
      }
    } catch (err: any) {
      setPrivateFtpLoading(false);
      showToast(`Lỗi thêm FTP riêng: ${err.message}`, 'error');
    }
  };

  // ── DELETE DESTINATION ──
  const handleDeleteDest = (printerId: string, entry: any) => {
    const emailVal = entry.email_address || entry.email || '';
    const folderVal = entry.physical_path || entry.folder || entry.folder_path || '';
    const destVal = (emailVal || folderVal || '').trim();
    const regNo = String(entry.registration_no || '').trim();

    setConfirmModal({
      isOpen: true,
      title: 'Xác nhận xóa',
      message: `Bạn có chắc chắn muốn xóa điểm scan này khỏi máy photocopy?\nEmail/Folder: ${destVal}`,
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));

        // Checking if it is a private LAN email
        const emailsList = selectedLan?.emails || [];
        const matchedEmail = emailsList.find((e) => e.email.toLowerCase().trim() === destVal.toLowerCase().trim());
        
        if (matchedEmail && matchedEmail.id) {
          // Direct deletion from LAN Emails
          showToast('Đang xóa điểm scan private khỏi LAN...', 'info', 3000);
          try {
            const res = await deleteLanEmail(matchedEmail.id);
            if (res.ok) {
              showToast('Đã xóa thành công!', 'success');
              await fetchLanSitesData();
            } else {
              throw new Error(res.error || 'Không thể xóa');
            }
          } catch (err: any) {
            showToast(`Lỗi xóa: ${err.message}`, 'error');
          }
          return;
        }

        // Copier Address Book entry deletion (requires command status polling)
        const targetAgent = getTargetAgentUid(printerId);
        showToast('Gửi lệnh xóa điểm scan trên máy photocopy...', 'info', 3000);

        try {
          const res = await deleteEmailDestination(printerId, regNo, entry.entry_id || '', targetAgent || undefined);
          if (!res.ok || !res.command_id) {
            throw new Error(res.error || 'Không thể tạo lệnh xóa');
          }

          pollCommandStatus(
            res.command_id,
            printerId,
            async (pollData: any) => {
              showToast(`Đã xóa đăng ký #${regNo} thành công!`, 'success');
              await fetchLanSitesData();
              if (pollData && pollData.address_book_sync) {
                setLiveAddressBooks((prev) => ({ ...prev, [printerId]: pollData.address_book_sync }));
              }
            },
            (errorMsg) => {
              showToast(`Lỗi xóa điểm scan: ${errorMsg}`, 'error');
            },
            `⌛ Đang xóa điểm scan #${regNo}...`
          );
        } catch (err: any) {
          showToast(`Lỗi gửi lệnh xóa: ${err.message}`, 'error');
        }
      }
    });
  };

  const handleEditIP = (printerId: string, entry: any) => {
    const currentFolder = entry.folder || entry.physical_path || entry.folder_path || '';
    let currentIp = '';
    const ftpMatch = currentFolder.match(/ftp:\/\/([^:/]+)/);
    const smbMatch = currentFolder.match(/^\\\\([^\\]+)/);
    if (ftpMatch) {
      currentIp = ftpMatch[1];
    } else if (smbMatch) {
      currentIp = smbMatch[1];
    }

    setEditIpModalData({
      printerId,
      entry,
      currentIp,
      newIp: currentIp || '192.168.1.100'
    });
    setActiveModal('edit_ip');
  };

  const handleSaveEditIP = async () => {
    if (!editIpModalData) return;
    const { printerId, entry, newIp } = editIpModalData;
    const currentFolder = entry.folder || entry.physical_path || entry.folder_path || '';
    const ftpMatch = currentFolder.match(/ftp:\/\/([^:/]+)/);
    const smbMatch = currentFolder.match(/^\\\\([^\\]+)/);

    let newFolder = currentFolder;
    if (ftpMatch) {
      newFolder = currentFolder.replace(/ftp:\/\/([^:/]+)/, `ftp://${newIp}`);
    } else if (smbMatch) {
      newFolder = currentFolder.replace(/^\\\\([^\\]+)/, `\\\\${newIp}`);
    }

    const targetAgent = getTargetAgentUid(printerId);
    const regNo = entry.registration_no;

    setActiveModal(null);
    showToast('Gửi yêu cầu thay đổi IP của điểm scan...', 'info', 3000);

    try {
      const printer = selectedLan?.printers?.find((pr: any) => pr.id === Number(printerId));
      const copierIp = printer?.ip || '';

      const res = await modifyDeviceAddress({
        id: Number(printerId), // Pass printer ID to ensure correct database record selection
        ip: copierIp,
        action: 'address_modify',
        registration_no: regNo,
        name: entry.name,
        email: entry.email_address || entry.email || '',
        folder: newFolder,
        user_code: entry.user_code || '-',
        agent_uid: targetAgent || undefined,
        fields: {}
      });

      if (!res.ok || !res.command_id) {
        throw new Error(res.error || 'Không thể tạo lệnh thay đổi IP');
      }

      pollCommandStatus(
        res.command_id,
        printerId,
        async (pollData: any) => {
          showToast(`Đã thay đổi IP điểm scan #${regNo} thành công!`, 'success');
          await fetchLanSitesData();
          if (pollData && pollData.address_book_sync) {
            setLiveAddressBooks((prev) => ({ ...prev, [printerId]: pollData.address_book_sync }));
          }
        },
        (errorMsg) => {
          showToast(`Lỗi thay đổi IP: ${errorMsg}`, 'error');
        },
        `⌛ Đang cập nhật IP điểm scan #${regNo}...`
      );
    } catch (err: any) {
      showToast(`Lỗi gửi lệnh thay đổi IP: ${err.message}`, 'error');
    }
  };

  /*
  // ── DETAILED INFO ENTRY (INFOR) ──
  const handleFetchEntryDetail = async (printerId: string, entry: any) => {
    const regNo = String(entry.registration_no || '').trim();
    const targetAgent = getTargetAgentUid(printerId);
    
    // Key to show command status on the specific entry row
    const entryRowKey = `${printerId}-${regNo}`;
    showToast(`Đang truy vấn thông số chi tiết của điểm scan #${regNo}...`, 'info', 3000);

    try {
      const res = await triggerFetchAddressBook(printerId, targetAgent || undefined);
      if (!res.ok || !res.command_id) {
        throw new Error(res.error || 'Không thể gửi yêu cầu');
      }

      pollCommandStatus(
        res.command_id,
        entryRowKey,
        async (pollData) => {
          showToast('Đã tải thông số chi tiết!', 'success');
          await fetchLanSitesData();

          const syncData = pollData.address_book_sync || {};
          const matchedEntry = (syncData.address_list || []).find(
            (e: any) => String(e.registration_no).trim() === regNo
          );

          if (matchedEntry) {
            const folderStr = matchedEntry.folder_path || matchedEntry.folder || '';
            let details = null;

            if (folderStr) {
              let proto = '';
              let server = '';
              let port = '';
              let path = '';

              if (folderStr.startsWith('ftp://')) {
                proto = 'FTP';
                const match = folderStr.match(/ftp:\/\/([^:\/]+)(?::(\d+))?(.*)/);
                if (match) {
                  server = match[1];
                  port = match[2] || '21';
                  path = match[3] || '/';
                }
              } else if (folderStr.startsWith('\\\\')) {
                proto = 'SMB';
                const match = folderStr.match(/\\\\([^\\]+)\\(.*)/);
                if (match) {
                  server = match[1];
                  path = '\\' + match[2];
                  port = '445';
                } else {
                  server = folderStr.substring(2);
                  path = '\\';
                  port = '445';
                }
              } else {
                server = folderStr;
              }

              details = { proto, server, port, path };
            }

            setInfoDetailData({
              regNo,
              name: matchedEntry.name,
              details,
              error: details ? undefined : 'Không tìm thấy cấu hình thư mục scan.',
            });
          } else {
            setInfoDetailData({
              regNo,
              name: entry.name,
              details: null,
              error: 'Không tìm thấy chi tiết đăng ký trong danh bạ đồng bộ.',
            });
          }
          setActiveModal('info_detail');
        },
        (errorMsg) => {
          showToast(`Truy vấn thất bại: ${errorMsg}`, 'error');
        },
        '⌛ Đang lấy dữ liệu...'
      );
    } catch (err: any) {
      showToast(`Lỗi: ${err.message}`, 'error');
    }
  };
  */

  // ── STORAGE SCANS FILES LIST ──
  const handleOpenStorageFiles = async (lanUid: string, email: string) => {
    setStorageModalData({ lanUid, email });
    setStorageLoading(true);
    setStorageFiles([]);
    setActiveModal('storage');

    try {
      const res = await getScansFiles(lanUid, email);
      if (res.ok) {
        setStorageFiles(res.rows || []);
      } else {
        throw new Error(res.error || 'Lỗi server');
      }
    } catch (err: any) {
      showToast(`Không thể lấy tệp đã scan: ${err.message}`, 'error');
    } finally {
      setStorageLoading(false);
    }
  };

  // ── INSTALL DRIVER ON CLIENT PC ──
  const handleRemoteInstallDriver = (printerId: string, brand: string, model: string, drName: string, drUrl: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Cài đặt Driver từ xa',
      message: `Bạn có chắc muốn gửi lệnh cài đặt driver "${drName}" từ xa lên PC đại diện?`,
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        const TOAST_ID = 'driver-install-progress';
        replaceToast(TOAST_ID, '⏳ Đang gửi lệnh cài đặt driver tới Agent...', 'info');
        try {
          const res = await installDriverOnAgent(printerId, brand, model, drName, drUrl);
          if (!res.ok) throw new Error(res.error || 'Server trả về lỗi');

          const commandId = res.command_id;
          if (!commandId) {
            replaceToast(TOAST_ID, '✅ Đã gửi lệnh cài đặt driver.', 'success');
            return;
          }

          // Poll for progress — driver install can take up to 5 minutes
          const maxPollMs = 300000;
          const pollInterval = 2000;
          const startTime = Date.now();
          let lastProgressText = '';

          const timer = setInterval(async () => {
            try {
              const elapsed = Date.now() - startTime;
              if (elapsed > maxPollMs) {
                clearInterval(timer);
                replaceToast(TOAST_ID, '⏰ Quá thời gian chờ (5 phút). Kiểm tra trên PC đại diện.', 'info');
                return;
              }

              const statusRes = await getCommandStatus(commandId);
              if (statusRes.status === 'success') {
                clearInterval(timer);
                replaceToast(TOAST_ID, '✅ Cài đặt driver thành công!', 'success');
              } else if (statusRes.status === 'failed' || !statusRes.ok) {
                clearInterval(timer);
                replaceToast(TOAST_ID, `❌ Cài driver thất bại: ${statusRes.error || 'Lỗi không xác định'}`, 'error');
              } else {
                const progressText = statusRes.progress_text || '';
                if (progressText && progressText !== lastProgressText) {
                  lastProgressText = progressText;
                  replaceToast(TOAST_ID, progressText, 'info');
                } else if (!progressText) {
                  const elapsedSec = Math.round(elapsed / 1000);
                  if (statusRes.received_at) {
                    replaceToast(TOAST_ID, `⚡ Agent đã nhận lệnh - đang cài đặt driver... (${elapsedSec}s)`, 'info');
                  } else {
                    replaceToast(TOAST_ID, `⌛ Đang chuyển lệnh tới Agent... (${elapsedSec}s)`, 'info');
                  }
                }
              }
            } catch (pollErr) {
              // Silently continue polling on network errors
            }
          }, pollInterval);
        } catch (err: any) {
          replaceToast(TOAST_ID, `❌ Không thể cài driver: ${err.message}`, 'error');
        }
      }
    });
  };

  // Helpers
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getDestinationStatus = (entry: any) => {
    return getDestinationStatusHtml(
      entry,
      selectedLan?.emails || [],
      selectedLan?.agents || []
    );
  };

  return (
    <motion.div
      style={styles.container}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Toast Notification Container */}
      <div style={styles.toastContainer}>
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              style={{
                ...styles.toast,
                borderLeft: `4px solid ${
                  t.type === 'success'
                    ? 'var(--color-success)'
                    : t.type === 'error'
                    ? 'var(--color-error)'
                    : 'var(--color-primary)'
                }`,
              }}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.9 }}
            >
              <span style={styles.toastIcon}>
                {t.type === 'success' ? '✔️' : t.type === 'error' ? '❌' : 'ℹ️'}
              </span>
              <div style={{ flex: 1, fontSize: '0.8rem' }}>{t.message}</div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* FIXED HEADER BLOCK */}
      <div style={styles.fixedHeader}>
        <div style={styles.header}>
          <h1 style={styles.title}>🛠️ Quản lý Mạng LAN</h1>
          <button
            style={{ ...styles.smallBtn, borderColor: 'var(--color-secondary)', color: 'var(--color-secondary)' }}
            onClick={() => fetchLanSitesData(true)}
          >
            🔄 Làm mới
          </button>
        </div>

        {/* LAN Select filter */}
        <div style={styles.filterBar}>
          <label style={styles.filterLabel}>Mạng LAN hiện tại:</label>
          {lanSitesLoading && lanSites.length === 0 ? (
            <LoadingSpinner size="sm" />
          ) : (
            <select
              value={selectedLanUid}
              onChange={(e) => setSelectedLanUid(e.target.value)}
              style={styles.lanSelect}
            >
              {lanSites.map((site) => (
                <option key={site.lan_uid} value={site.lan_uid}>
                  {site.lan_name || site.lan_uid} ({site.active_agents} Agent - {site.printers?.length ?? 0} máy Photo)
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Tab bar switch */}
        <div style={styles.tabBar}>
          <button
            style={{
              ...styles.tabBtn,
              color: activeTab === 'agents' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              borderBottom: activeTab === 'agents' ? '2px solid var(--color-primary)' : '2px solid transparent',
            }}
            onClick={() => setActiveTab('agents')}
          >
            💻 Máy tính ({selectedLan?.agents?.length ?? 0})
          </button>
          <button
            style={{
              ...styles.tabBtn,
              color: activeTab === 'copiers' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              borderBottom: activeTab === 'copiers' ? '2px solid var(--color-primary)' : '2px solid transparent',
            }}
            onClick={() => setActiveTab('copiers')}
          >
            🖨️ Photocopy ({filteredPrinters.length})
          </button>
        </div>
      </div>

      {/* Content Area with Top Margin to avoid overlapping the fixed header */}
      <div style={styles.scrollableContent}>
        {lanSitesLoading && (
          <div style={styles.loadingWrapper}>
            <LoadingSpinner size="md" />
          </div>
        )}

        {!lanSitesLoading && selectedLan && (
          <AnimatePresence mode="wait">
            {activeTab === 'agents' ? (
              <motion.div
                key="agents-tab"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                style={styles.tabContent}
              >
                <AnimatedList>
                  {selectedLan.agents.length === 0 ? (
                    <div style={styles.emptyText}>Không có Agent nào kết nối trong mạng LAN này.</div>
                  ) : (
                    selectedLan.agents.map((agent) => {
                      const isOnline = agent.is_online;
                      return (
                        <GlowCard key={agent.agent_uid}>
                          <div style={styles.cardHeader}>
                            <span style={styles.cardTitle}>💻 {agent.hostname}</span>
                            <span
                              style={{
                                ...styles.statusBadge,
                                color: isOnline ? 'var(--color-status-online)' : 'var(--color-status-offline)',
                                borderColor: isOnline ? 'var(--color-status-online)' : 'var(--color-status-offline)',
                                background: isOnline ? 'rgba(0, 255, 136, 0.08)' : 'rgba(255, 68, 102, 0.08)',
                              }}
                            >
                              {isOnline ? (agent.is_master ? '★ MASTER' : '● ONLINE') : '● OFFLINE'}
                            </span>
                          </div>

                          <div style={styles.cardDetails}>
                            <div style={styles.detailRow}>
                              <span style={styles.detailLabel}>UID:</span>
                              <span style={{ ...styles.detailValue, fontFamily: 'monospace', fontSize: '0.75rem' }}>{agent.agent_uid}</span>
                            </div>
                            <div style={styles.detailRow}>
                              <span style={styles.detailLabel}>IP cục bộ:</span>
                              <span style={styles.detailValue}>{agent.local_ip}</span>
                            </div>
                            <div style={styles.detailRow}>
                              <span style={styles.detailLabel}>Địa chỉ MAC:</span>
                              <span style={styles.detailValue}>{agent.local_mac || '—'}</span>
                            </div>
                            <div style={styles.detailRow}>
                              <span style={styles.detailLabel}>Tệp scan (VPS):</span>
                              <span style={styles.detailValue}>
                                {(() => {
                                  // Path máy: FTP site "goxprint" là site duy nhất agent tạo
                                  const goxprintSite = (agent.ftp_sites || []).find(
                                    (s: any) => (s.name || '').toLowerCase() === 'goxprint'
                                  ) || (agent.ftp_sites || [])[0];
                                  const localPath = goxprintSite?.path || '';

                                  // Path VPS thống nhất: storage/uploads/scans/<lead>/<lan_uid>/<agent_uid>/
                                  const lanUidSafe = safePathToken(selectedLan?.lan_uid || '');
                                  const agentUidSafe = safePathToken(agent.agent_uid || '');
                                  const leadSafe = safePathToken(agent.lead || 'default');
                                  const vpsPath = `storage/uploads/scans/${leadSafe}/${lanUidSafe}/${agentUidSafe}/`;

                                  const agentEmails = selectedLan ? selectedLan.emails.filter(
                                    (e: any) => e.email_type === 'private' && e.pc_name && e.pc_name.toLowerCase().trim() === agent.agent_uid.toLowerCase().trim()
                                  ) : [];
                                  const totalCount = agentEmails.reduce((sum: number, em: any) => sum + (emailFileCounts[em.email] ?? 0), 0);

                                  return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                      {/* Paths chung cho agent */}
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', background: 'var(--color-inset-bg)', borderRadius: '6px', padding: '6px 8px', fontSize: '0.65rem' }}>
                                        <div style={{ wordBreak: 'break-all' }}>
                                          <span style={{ color: 'var(--color-text-secondary)' }}>🖥 Máy: </span>
                                          <code style={{ fontFamily: 'monospace', color: localPath ? 'var(--color-primary)' : 'var(--color-text-secondary)', fontStyle: localPath ? 'normal' : 'italic' }}>
                                            {localPath || '%LOCALAPPDATA%\\Temp\\GoPrinxAgent\\ftp'}
                                          </code>
                                        </div>
                                        <div style={{ wordBreak: 'break-all' }}>
                                          <span style={{ color: 'var(--color-text-secondary)' }}>☁ VPS: </span>
                                          <code style={{ fontFamily: 'monospace', color: 'var(--color-accent, #7c6af7)' }}>{vpsPath}</code>
                                        </div>
                                      </div>

                                      {/* Danh sách email private có tệp */}
                                      {agentEmails.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                          {agentEmails.map((em: any) => {
                                            const count = emailFileCounts[em.email] ?? 0;
                                            return (
                                              <button
                                                key={em.email}
                                                style={{ ...styles.linkButton, textAlign: 'left', fontSize: '0.68rem' }}
                                                onClick={() => handleOpenStorageFiles(selectedLan?.lan_uid || '', em.email)}
                                                title={`Xem tệp của ${em.email}`}
                                              >
                                                📁 {count} tệp
                                              </button>
                                            );
                                          })}
                                          <div style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)' }}>
                                            Tổng: <strong style={{ color: 'var(--color-text)' }}>{totalCount} tệp</strong>
                                          </div>
                                        </div>
                                      )}
                                      {agentEmails.length === 0 && (
                                        <span style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                                          Chưa có email riêng trên máy này
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()}
                              </span>
                            </div>

                            <div style={styles.detailRow}>
                              <span style={styles.detailLabel}>FTP Ports:</span>
                              <span style={styles.detailValue}>{agent.ftp_ports || '—'}</span>
                            </div>
                            <div style={styles.detailRow}>
                              <span style={styles.detailLabel}>Tiện ích:</span>
                              <span style={styles.detailValue}>
                                <button
                                  onClick={() => {
                                    setSelectedUtilityAgent(agent);
                                    setActiveModal('utilities');
                                  }}
                                  style={{
                                    color: 'var(--color-primary)',
                                    fontWeight: 700,
                                    border: '1px solid var(--color-primary)',
                                    borderRadius: '6px',
                                    padding: '4px 8px',
                                    fontSize: '0.68rem',
                                    background: 'rgba(59, 130, 246, 0.05)',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                  }}
                                >
                                  🛠️ Mở trang Tiện ích
                                </button>
                              </span>
                            </div>
                            <div style={styles.detailRow}>
                              <span style={styles.detailLabel}>Cập nhật lúc:</span>
                              <span style={styles.detailValue}>{agent.updated_at || '—'}</span>
                            </div>
                          </div>

                          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--color-surface-light)' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '8px' }}>
                              📂 Dịch vụ FTP đang chạy:
                            </span>
                            {(!agent.ftp_sites || agent.ftp_sites.length === 0) ? (
                              <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', fontStyle: 'italic', padding: '6px' }}>
                                Không có FTP site nào hoạt động.
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {agent.ftp_sites.map((site: any, sIdx: number) => {
                                  const isRunning = site.running;
                                  return (
                                    <div
                                      key={sIdx}
                                      style={{
                                        background: 'var(--color-inset-bg)',
                                        border: `1px solid ${isRunning ? 'var(--color-surface-light)' : 'rgba(255, 68, 102, 0.4)'}`,
                                        borderRadius: '8px',
                                        padding: '10px 12px',
                                        fontSize: '0.72rem',
                                        color: 'var(--color-text)',
                                        boxShadow: isRunning ? 'none' : '0 0 8px rgba(255, 68, 102, 0.15)',
                                      }}
                                    >
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <span
                                            style={{
                                              display: 'inline-block',
                                              width: '6px',
                                              height: '6px',
                                              borderRadius: '50%',
                                              backgroundColor: isRunning ? 'var(--color-status-online)' : 'var(--color-status-offline)',
                                              boxShadow: isRunning ? '0 0 6px var(--color-status-online)' : 'none'
                                            }}
                                          />
                                          <strong style={{ color: isRunning ? 'var(--color-text)' : 'var(--color-error)' }}>
                                            Cổng Port: {site.port}
                                          </strong>
                                          <span style={{ fontSize: '0.65rem', color: 'var(--color-text-secondary)' }}>
                                            ({isRunning ? 'Đang chạy' : 'Đã dừng'})
                                          </span>
                                        </div>
                                        {site.error && (
                                          <span style={{ fontSize: '0.65rem', color: 'var(--color-error)' }}>
                                            Lỗi: {site.error}
                                          </span>
                                        )}
                                      </div>

                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '12px' }}>
                                        <div style={{ wordBreak: 'break-all' }}>
                                          <span style={{ color: 'var(--color-text-secondary)' }}>🖥 Thư mục (máy): </span>
                                          <code style={{ fontFamily: 'monospace', color: 'var(--color-primary)' }}>{site.path}</code>
                                        </div>
                                        <div style={{ display: 'flex', gap: '16px' }}>
                                          <div>
                                            <span style={{ color: 'var(--color-text-secondary)' }}>User: </span>
                                            <strong style={{ color: 'var(--color-text)' }}>{site.ftp_user || 'goxprint'}</strong>
                                          </div>
                                          <div>
                                            <span style={{ color: 'var(--color-text-secondary)' }}>Pass: </span>
                                            <strong style={{ color: 'var(--color-text)' }}>{site.ftp_password || 'goxprint'}</strong>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </GlowCard>
                      );
                    })
                  )}
                </AnimatedList>
              </motion.div>
            ) : (
              <motion.div
                key="copiers-tab"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                style={styles.tabContent}
              >
                <AnimatedList>
                  {filteredPrinters.length === 0 ? (
                    <div style={styles.emptyText}>Không tìm thấy máy photocopy nào hoạt động trong dải LAN này.</div>
                  ) : (
                    filteredPrinters.map((p) => {
                      const isExpanded = expandedPrinters[p.id] || false;
                      const driversExpanded = expandedDrivers[p.id] || false;
                      const hasDrivers = p.suggested_drivers && p.suggested_drivers.length > 0;
                      
                      const sync = liveAddressBooks[p.id] || {};
                      const syncCount = sync.address_list ? sync.address_list.length : 0;
                      const syncTime = sync.timestamp ? new Date(sync.timestamp).toLocaleTimeString('vi-VN') : '';
                      
                      const isPending = commandStatus[p.id]?.isPending || false;
                      const statusMsg = commandStatus[p.id]?.message || '';

                      // Filter online agents for relays
                      const onlineAgents = (selectedLan.agents || []).filter((a) => a.is_online);
                      const selectedAgentUid = getTargetAgentUid(p.id);

                      return (
                        <div
                          key={p.id}
                          id={`copier-card-${p.id}`}
                          onClick={() => handleCopierClick(String(p.id))}
                          style={{ width: '100%' }}
                        >
                          <GlowCard>
                          {/* Header details */}
                          <div style={styles.cardHeader}>
                            <div>
                              <span style={styles.copierTitle}>🖨️ {p.printer_name}</span>
                              <div style={styles.copierSubtitle}>IP: {p.ip} · MAC: {p.mac_id || '—'}</div>
                            </div>
                            <span
                              style={{
                                ...styles.statusBadge,
                                color: p.is_online ? 'var(--color-status-online)' : 'var(--color-status-offline)',
                                borderColor: p.is_online ? 'var(--color-status-online)' : 'var(--color-status-offline)',
                                background: p.is_online ? 'rgba(0, 255, 136, 0.08)' : 'rgba(255, 68, 102, 0.08)',
                              }}
                            >
                              {p.is_online ? 'ONLINE' : 'OFFLINE'}
                            </span>
                          </div>

                          {/* Connection Credentials Form */}
                          <div style={styles.sectionBlock}>
                            <span style={styles.sectionBlockTitle}>🔐 Tài khoản Web máy in:</span>
                            <div style={styles.credsInputRow}>
                              <input
                                type="text"
                                style={styles.credsInput}
                                placeholder="admin"
                                value={copierCredentials[p.id]?.user || ''}
                                onChange={(e) =>
                                  setCopierCredentials((prev) => ({
                                    ...prev,
                                    [p.id]: { ...prev[p.id], user: e.target.value },
                                  }))
                                }
                              />
                              <input
                                type="password"
                                style={styles.credsInput}
                                placeholder="mật khẩu"
                                value={copierCredentials[p.id]?.pass || ''}
                                onChange={(e) =>
                                  setCopierCredentials((prev) => ({
                                    ...prev,
                                    [p.id]: { ...prev[p.id], pass: e.target.value },
                                  }))
                                }
                              />
                              <button
                                style={{ ...styles.smallBtn, padding: '8px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                                onClick={() => handleSaveAuth(p.id)}
                                disabled={saveAuthLoading[p.id]}
                              >
                                {saveAuthLoading[p.id] ? 'Lưu...' : 'Lưu Auth'}
                              </button>
                            </div>
                          </div>

                          {/* Relay Target Agent selector */}
                          <div style={styles.detailRow}>
                            <span style={styles.detailLabel}>Target Agent:</span>
                            <select
                              style={styles.relaySelect}
                              value={selectedAgentUid}
                              onChange={(e) =>
                                setSelectedTargetAgents((prev) => ({ ...prev, [p.id]: e.target.value }))
                              }
                            >
                              {onlineAgents.length === 0 ? (
                                <option value="">(Không có Agent online)</option>
                              ) : (
                                onlineAgents.map((a) => (
                                  <option key={a.agent_uid} value={a.agent_uid}>
                                    {a.hostname} ({a.local_ip})
                                  </option>
                                ))
                              )}
                            </select>
                          </div>

                          {/* Sync Status Box */}
                          <div
                            style={{
                              ...styles.syncStatusBox,
                              background:
                                sync.status === 'success'
                                  ? 'rgba(0, 255, 136, 0.05)'
                                  : sync.status === 'error'
                                  ? 'rgba(255, 68, 102, 0.05)'
                                  : 'var(--color-inset-bg)',
                              borderColor:
                                sync.status === 'success'
                                  ? 'rgba(0, 255, 136, 0.15)'
                                  : sync.status === 'error'
                                  ? 'rgba(255, 68, 102, 0.15)'
                                  : 'var(--color-surface-light)',
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={styles.syncStatusTitle}>Trạng thái đồng bộ danh bạ:</span>
                              <div style={styles.syncStatusText}>
                                {isPending ? (
                                  <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>{statusMsg}</span>
                                ) : sync.status === 'success' ? (
                                  <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                                    ✔ Đồng bộ OK ({syncCount} mục) · {syncTime}
                                  </span>
                                ) : sync.status === 'error' ? (
                                  <span style={{ color: 'var(--color-error)' }}>
                                    ❌ Lỗi: {sync.error} {syncTime ? `(${syncTime})` : ''}
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--color-text-secondary)' }}>Chưa có thông tin danh bạ</span>
                                )}
                              </div>
                            </div>

                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                style={{ ...styles.smallBtn, padding: '6px 10px', fontSize: '0.75rem', height: 'auto' }}
                                onClick={() => handleRefetchAddressBook(p.id)}
                                disabled={isPending || onlineAgents.length === 0}
                              >
                                🔄 {sync.status === 'success' ? 'Cập nhật' : 'Đồng bộ'}
                              </button>
                            </div>
                          </div>

                          {/* Suggested Drivers Block */}
                          {hasDrivers && (
                            <div style={{ marginTop: '8px' }}>
                              <button
                                style={styles.expandSubBtn}
                                onClick={() =>
                                  setExpandedDrivers((prev) => ({ ...prev, [p.id]: !driversExpanded }))
                                }
                              >
                                {driversExpanded ? '▲ Ẩn driver đề xuất' : '▼ Xem driver đề xuất từ catalog'}
                              </button>

                              <AnimatePresence>
                                {driversExpanded && (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    style={{ overflow: 'hidden', marginTop: '6px' }}
                                  >
                                    <div style={styles.suggestedDriverBlock}>
                                      {p.suggested_drivers.map((sd: any, idx: number) => {
                                        const brandColor =
                                          sd.brand === 'ricoh'
                                            ? 'var(--color-primary)'
                                            : sd.brand === 'toshiba'
                                            ? 'var(--color-error)'
                                            : 'var(--color-success)';
                                        const sdMenuKey = `${p.id}-${idx}`;
                                        const isMenuOpen = expandedDriverMenus[sdMenuKey] || false;

                                        return (
                                          <div key={idx} style={styles.driverSuggestionItem}>
                                            <div
                                              style={styles.driverModelHeader}
                                              onClick={() =>
                                                setExpandedDriverMenus((prev) => ({
                                                  ...prev,
                                                  [sdMenuKey]: !isMenuOpen,
                                                }))
                                              }
                                            >
                                              <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                                                <span
                                                  style={{
                                                    display: 'inline-block',
                                                    width: '6px',
                                                    height: '6px',
                                                    borderRadius: '50%',
                                                    backgroundColor: brandColor,
                                                    marginRight: '6px',
                                                  }}
                                                />
                                                {sd.brand.toUpperCase()} - {sd.model}
                                              </span>
                                              <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)' }}>
                                                {isMenuOpen ? '▲' : '▼'}
                                              </span>
                                            </div>

                                            {isMenuOpen && (
                                              <div style={styles.driverOptionsList}>
                                                {sd.drivers && sd.drivers.length > 0 ? (
                                                  sd.drivers.map((drv: any, dIdx: number) => (
                                                    <div key={dIdx} style={styles.driverFileRow}>
                                                      <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={styles.driverFileName}>{drv.name}</div>
                                                        <div style={styles.driverFileUrl} title={drv.url}>
                                                          {drv.url.split('/').pop()}
                                                        </div>
                                                      </div>
                                                      <div style={{ display: 'flex', gap: '4px' }}>
                                                        <a
                                                          href={drv.url}
                                                          target="_blank"
                                                          rel="noreferrer"
                                                          style={styles.driverDownloadBtn}
                                                        >
                                                          Tải về
                                                        </a>
                                                        <button
                                                          style={{ ...styles.smallBtn, padding: '4px 8px', fontSize: '0.7rem' }}
                                                          onClick={() =>
                                                            handleRemoteInstallDriver(
                                                              p.id,
                                                              sd.brand,
                                                              sd.model,
                                                              drv.name,
                                                              drv.url
                                                            )
                                                          }
                                                          disabled={onlineAgents.length === 0}
                                                        >
                                                          Cài đặt
                                                        </button>
                                                      </div>
                                                    </div>
                                                  ))
                                                ) : (
                                                  <div style={styles.emptySubText}>Không tìm thấy driver nào.</div>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )}

                          {/* Top Action buttons */}
                          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                            <button
                              style={{ ...styles.smallBtn, flex: 1, justifyContent: 'center', fontSize: '0.8rem', padding: '8px 12px', display: 'flex', alignItems: 'center' }}
                              onClick={() => {
                                setPublicFtpData({ printerId: p.id, email: '', agentUid: selectedAgentUid });
                                setActiveModal('public_ftp');
                              }}
                              disabled={onlineAgents.length === 0}
                            >
                              ➕ Thêm FTP/Email
                            </button>

                            <button
                              style={{ ...styles.smallBtn, flex: 1, justifyContent: 'center', fontSize: '0.8rem', padding: '8px 12px', display: 'flex', alignItems: 'center', borderColor: 'var(--color-secondary)', color: 'var(--color-secondary)' }}
                              onClick={() => {
                                if (!isExpanded) {
                                  handleRefetchAddressBook(String(p.id));
                                } else {
                                  setExpandedPrinters((prev) => ({ ...prev, [p.id]: false }));
                                }
                              }}
                            >
                              {isExpanded ? '▲ Ẩn danh bạ' : '👁 Xem danh bạ'}
                            </button>
                          </div>

                          {/* Copier Scan Destinations list */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                style={{ overflow: 'hidden' }}
                              >
                                <div style={styles.destinationsBlock}>
                                  <span style={styles.destBlockTitle}>📂 Danh sách điểm scan:</span>
                                  
                                  {sync.status === 'success' && sync.address_list && sync.address_list.length > 0 ? (
                                    sync.address_list
                                      .filter((entry: any) => entry.type !== 'Summary' && entry.registration_no !== '-')
                                      .map((entry: any, eIdx: number) => {
                                        const emailVal = entry.email_address || entry.email || '';
                                        const folderVal = entry.physical_path || entry.folder || entry.folder_path || '';
                                        const destVal = (emailVal || folderVal || '').trim();

                                        let destType = 'Folder';
                                        if (folderVal.startsWith('ftp://')) destType = 'FTP';
                                        else if (folderVal.startsWith('\\\\')) destType = 'SMB';
                                        else if (emailVal || emailVal.includes('@')) destType = 'Email';

                                        const statusInfo = getDestinationStatus(entry);
                                        const regNo = entry.registration_no;
                                        const rowKey = `${p.id}-${regNo}`;
                                        const isRowPending = commandStatus[rowKey]?.isPending || false;
                                        const rowStatusMsg = commandStatus[rowKey]?.message || '';

                                        return (
                                          <div key={eIdx} style={styles.destItemCard}>
                                            <div style={styles.destItemHeader}>
                                              <span style={styles.destItemTitle}>
                                                <span
                                                  style={{
                                                    ...styles.destTypeBadge,
                                                    backgroundColor:
                                                      destType === 'FTP'
                                                        ? 'rgba(0, 212, 255, 0.12)'
                                                        : destType === 'SMB'
                                                        ? 'rgba(123, 47, 247, 0.12)'
                                                        : 'rgba(0, 255, 136, 0.12)',
                                                    color:
                                                      destType === 'FTP'
                                                        ? 'var(--color-primary)'
                                                        : destType === 'SMB'
                                                        ? 'var(--color-secondary)'
                                                        : 'var(--color-success)',
                                                  }}
                                                >
                                                  {destType}
                                                </span>
                                                {entry.name}
                                              </span>
                                              <span style={styles.destRegNo}>
                                                {typeof entry.file_count === 'number' && (
                                                  <span
                                                    onClick={() => handleOpenStorageFiles(selectedLan.lan_uid, destVal)}
                                                    style={{
                                                      color: 'var(--color-primary)',
                                                      marginRight: '8px',
                                                      fontWeight: 600,
                                                      cursor: 'pointer',
                                                      textDecoration: 'underline',
                                                      display: 'inline-flex',
                                                      alignItems: 'center',
                                                      gap: '3px'
                                                    }}
                                                    title="Xem danh sách tệp tin đã scan trên VPS"
                                                  >
                                                    📁 {entry.file_count} files
                                                  </span>
                                                )}
                                                Reg: #{regNo}
                                              </span>
                                            </div>

                                            <div style={styles.destPathValue}>{destVal}</div>

                                            {/* FTP Credentials */}
                                            {destType === 'FTP' && (
                                              <div style={styles.ftpCredentialsBox}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                  <span>User: <strong style={{ color: 'var(--color-primary)' }}>goxprint</strong></span>
                                                  <button
                                                    style={styles.copyTextBtn}
                                                    onClick={() => {
                                                      navigator.clipboard.writeText('goxprint');
                                                      showToast('Đã copy user goxprint', 'success', 1500);
                                                    }}
                                                  >
                                                    Copy
                                                  </button>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                                                  <span>Pass: <strong style={{ color: 'var(--color-text-secondary)' }}>goxprint</strong></span>
                                                  <button
                                                    style={styles.copyTextBtn}
                                                    onClick={() => {
                                                      navigator.clipboard.writeText('goxprint');
                                                      showToast('Đã copy password goxprint', 'success', 1500);
                                                    }}
                                                  >
                                                    Copy
                                                  </button>
                                                </div>
                                              </div>
                                            )}

                                            {/* Connection Status badge */}
                                            <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {statusInfo.label === 'PENDING SETUP' ? (
                                                  <button
                                                    style={{
                                                      ...styles.destStatusBadge,
                                                      color: 'var(--color-warning)',
                                                      background: 'rgba(255, 170, 0, 0.08)',
                                                      border: '1px dashed var(--color-warning)',
                                                      cursor: 'pointer',
                                                      display: 'inline-flex',
                                                      alignItems: 'center',
                                                      gap: '4px',
                                                      padding: '2px 6px',
                                                      fontWeight: 600,
                                                      fontSize: '0.68rem',
                                                      borderRadius: '4px',
                                                    }}
                                                    onClick={() => handleEditIP(p.id, entry)}
                                                    disabled={isRowPending}
                                                    title="Click để thay đổi IP của điểm scan này"
                                                  >
                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '2px' }}>
                                                      <path d="M12 20h9"/>
                                                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                                                    </svg>
                                                    Edit IP
                                                  </button>
                                                ) : (
                                                  <span
                                                    style={{
                                                      ...styles.destStatusBadge,
                                                      color:
                                                        statusInfo.type === 'success'
                                                          ? 'var(--color-success)'
                                                          : statusInfo.type === 'warning'
                                                          ? 'var(--color-warning)'
                                                          : 'var(--color-error)',
                                                      background:
                                                        statusInfo.type === 'success'
                                                          ? 'rgba(0, 255, 136, 0.08)'
                                                          : statusInfo.type === 'warning'
                                                          ? 'rgba(255, 170, 0, 0.08)'
                                                          : 'rgba(255, 68, 102, 0.08)',
                                                    }}
                                                    title={statusInfo.title}
                                                  >
                                                    {statusInfo.label}
                                                  </span>
                                                )}

                                                {isRowPending && (
                                                  <span style={{ fontSize: '0.72rem', color: 'var(--color-warning)' }}>
                                                    {rowStatusMsg}
                                                  </span>
                                                )}
                                              </div>

                                              <button
                                                style={{
                                                  padding: '2px 8px',
                                                  fontSize: '0.7rem',
                                                  fontWeight: 600,
                                                  textAlign: 'center',
                                                  color: 'var(--color-error)',
                                                  background: 'rgba(255,255,255,0.02)',
                                                  border: '1px solid var(--color-surface-light)',
                                                  borderRadius: '4px',
                                                  cursor: 'pointer',
                                                }}
                                                onClick={() => handleDeleteDest(p.id, entry)}
                                                disabled={isRowPending}
                                              >
                                                🗑️ Xóa
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })
                                  ) : (
                                    <div style={styles.emptySubText}>
                                      {sync.status === 'error'
                                        ? 'Không thể tải danh sách (Lỗi đồng bộ)'
                                        : 'Đang tải hoặc danh sách trống. Nhấn đồng bộ để lấy trực tiếp.'}
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </GlowCard>
                      </div>
                    );
                    })
                  )}
                </AnimatedList>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* ── MODALS IMPLEMENTATIONS ── */}
      <AnimatePresence>
        {activeModal && (
          <div style={styles.modalOverlay} onClick={() => setActiveModal(null)}>
            <motion.div
              style={styles.modalCard}
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              {/* 1. Storage files view modal */}
              {activeModal === 'storage' && (
                <>
                  <div style={styles.modalHeader}>
                    <div>
                      <h3 style={styles.modalTitle}>📁 Kho tệp tin đã scan</h3>
                      <div style={styles.modalSubtitle}>{storageModalData.email}</div>
                    </div>
                    <button style={styles.modalCloseBtn} onClick={() => setActiveModal(null)}>
                      &times;
                    </button>
                  </div>

                  <div style={styles.modalBody}>
                    {storageLoading ? (
                      <div style={styles.modalLoading}>
                        <LoadingSpinner size="md" />
                        <span style={{ marginTop: '8px', fontSize: '0.82rem' }}>Đang tải danh sách tệp tin từ VPS...</span>
                      </div>
                    ) : storageFiles.length === 0 ? (
                      <div style={styles.emptySubText}>Không tìm thấy tệp tin đã scan nào trong thư mục này.</div>
                    ) : (
                      <div style={styles.filesList}>
                        {storageFiles.map((f, idx) => (
                          <div key={idx} style={styles.fileItemRow}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <a
                                href={`${BASE_URL}${f.url}`}
                                target="_blank"
                                rel="noreferrer"
                                style={styles.fileLinkName}
                              >
                                {f.name}
                              </a>
                              <div style={styles.fileMetaDetails}>
                                Dung lượng: {formatBytes(f.size)} · Mtime: {new Date(f.mtime).toLocaleString('vi-VN')}
                              </div>
                              {f.upload_completed_at && (
                                <div style={styles.fileUploadMeta}>
                                  Tải lên VPS: {new Date(f.upload_completed_at).toLocaleTimeString('vi-VN')}
                                  {f.upload_duration != null ? ` (${f.upload_duration}s)` : ''}
                                </div>
                              )}
                            </div>
                            <a
                              href={`${BASE_URL}${f.url}`}
                              download
                              target="_blank"
                              rel="noreferrer"
                              style={styles.fileDownloadBtn}
                            >
                              Tải về
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={styles.modalFooter}>
                    <button
                      style={{ ...styles.smallBtn, padding: '10px 16px', fontSize: '0.85rem' }}
                      onClick={() => handleOpenStorageFiles(storageModalData.lanUid, storageModalData.email)}
                    >
                      Làm mới danh sách
                    </button>
                    <button
                      style={{ ...styles.smallBtn, padding: '10px 16px', fontSize: '0.85rem', borderColor: 'var(--color-secondary)', color: 'var(--color-secondary)' }}
                      onClick={() => setActiveModal(null)}
                    >
                      Đóng
                    </button>
                  </div>
                </>
              )}

              {/* 2. Add Public FTP Modal */}
              {activeModal === 'public_ftp' && (
                <>
                  <div style={styles.modalHeader}>
                    <h3 style={styles.modalTitle}>➕ Thêm Public FTP/Email</h3>
                    <button style={styles.modalCloseBtn} onClick={() => setActiveModal(null)}>
                      &times;
                    </button>
                  </div>

                  <div style={styles.modalBody}>
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>Địa chỉ Email *</label>
                      <input
                        type="email"
                        style={styles.modalInput}
                        placeholder="VD: goxprint@gmail.com"
                        value={publicFtpData.email}
                        onChange={(e) => setPublicFtpData((p) => ({ ...p, email: e.target.value }))}
                      />
                      <span style={styles.formHelpText}>Mã FTP/Folder scan sẽ tự động được gán theo email này.</span>
                    </div>

                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>Relay Agent *</label>
                      <select
                        style={styles.modalInput}
                        value={publicFtpData.agentUid}
                        onChange={(e) => setPublicFtpData((p) => ({ ...p, agentUid: e.target.value }))}
                      >
                        {((selectedLan && selectedLan.agents) || [])
                          .filter((a) => a.is_online)
                          .map((a) => (
                            <option key={a.agent_uid} value={a.agent_uid}>
                              {a.hostname} ({a.local_ip})
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <div style={styles.modalFooter}>
                    <button
                      style={{ ...styles.smallBtn, padding: '10px 16px', fontSize: '0.85rem' }}
                      onClick={handleAddPublicFtp}
                      disabled={publicFtpLoading}
                    >
                      {publicFtpLoading ? 'Đang tạo...' : 'Tạo điểm scan'}
                    </button>
                    <button
                      style={{ ...styles.smallBtn, padding: '10px 16px', fontSize: '0.85rem', borderColor: 'var(--color-secondary)', color: 'var(--color-secondary)' }}
                      onClick={() => setActiveModal(null)}
                    >
                      Hủy bỏ
                    </button>
                  </div>
                </>
              )}

              {/* 3. Add Private FTP Modal */}
              {activeModal === 'private_ftp' && (
                <>
                  <div style={styles.modalHeader}>
                    <h3 style={styles.modalTitle}>➕ Thêm Private FTP</h3>
                    <button style={styles.modalCloseBtn} onClick={() => setActiveModal(null)}>
                      &times;
                    </button>
                  </div>

                  <div style={styles.modalBody}>
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>Địa chỉ Email riêng *</label>
                      <input
                        type="email"
                        style={styles.modalInput}
                        placeholder="VD: user.pc1@gmail.com"
                        value={privateFtpData.email}
                        onChange={(e) => setPrivateFtpData((p) => ({ ...p, email: e.target.value }))}
                      />
                      <span style={styles.formHelpText}>Cấu hình FTP riêng cho máy tính {privateFtpData.agentUid}</span>
                    </div>
                  </div>

                  <div style={styles.modalFooter}>
                    <button
                      style={{ ...styles.smallBtn, padding: '10px 16px', fontSize: '0.85rem' }}
                      onClick={handleAddPrivateFtp}
                      disabled={privateFtpLoading}
                    >
                      {privateFtpLoading ? 'Đang tạo...' : 'Tạo FTP riêng'}
                    </button>
                    <button
                      style={{ ...styles.smallBtn, padding: '10px 16px', fontSize: '0.85rem', borderColor: 'var(--color-secondary)', color: 'var(--color-secondary)' }}
                      onClick={() => setActiveModal(null)}
                    >
                      Hủy bỏ
                    </button>
                  </div>
                </>
              )}

              {/* 4. Info Detail modal */}
              {activeModal === 'info_detail' && (
                <>
                  <div style={styles.modalHeader}>
                    <div>
                      <h3 style={styles.modalTitle}>ℹ Chi tiết đăng ký điểm scan</h3>
                      <div style={styles.modalSubtitle}>Đăng ký: #{infoDetailData.regNo} · {infoDetailData.name}</div>
                    </div>
                    <button style={styles.modalCloseBtn} onClick={() => setActiveModal(null)}>
                      &times;
                    </button>
                  </div>

                  <div style={styles.modalBody}>
                    {infoDetailData.error ? (
                      <div style={{ color: 'var(--color-error)', fontSize: '0.85rem' }}>{infoDetailData.error}</div>
                    ) : (
                      <div style={styles.modalDetailsList}>
                        <div style={styles.detailRow}>
                          <span style={styles.detailLabel}>Giao thức:</span>
                          <span style={{ ...styles.detailValue, fontWeight: 700, color: 'var(--color-primary)' }}>
                            {infoDetailData.details?.proto}
                          </span>
                        </div>
                        <div style={styles.detailRow}>
                          <span style={styles.detailLabel}>Server Host:</span>
                          <span style={styles.detailValue}>{infoDetailData.details?.server}</span>
                        </div>
                        <div style={styles.detailRow}>
                          <span style={styles.detailLabel}>Cổng Port:</span>
                          <span style={styles.detailValue}>{infoDetailData.details?.port}</span>
                        </div>
                        <div style={styles.detailRow}>
                          <span style={styles.detailLabel}>Đường dẫn tệp:</span>
                          <span style={{ ...styles.detailValue, fontFamily: 'monospace' }}>{infoDetailData.details?.path}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={styles.modalFooter}>
                    <button
                      style={{ ...styles.smallBtn, padding: '10px 16px', fontSize: '0.85rem' }}
                      onClick={() => setActiveModal(null)}
                    >
                      Đóng cửa sổ
                    </button>
                  </div>
                </>
              )}

              {/* 4.5. FTP Detail Modal */}
              {activeModal === 'ftp_detail' && ftpDetailData && (
                <>
                  <div style={styles.modalHeader}>
                    <div>
                      <h3 style={styles.modalTitle}>📂 Chi tiết dịch vụ FTP</h3>
                      <div style={styles.modalSubtitle}>Cổng Port: {ftpDetailData.port}</div>
                    </div>
                    <button
                      style={styles.modalCloseBtn}
                      onClick={() => {
                        setActiveModal(null);
                        setFtpDetailData(null);
                      }}
                    >
                      &times;
                    </button>
                  </div>

                  <div style={styles.modalBody}>
                    <div style={styles.modalDetailsList}>
                      <div style={styles.detailRow}>
                        <span style={styles.detailLabel}>Cổng Port:</span>
                        <span style={{ ...styles.detailValue, fontWeight: 700, color: 'var(--color-primary)' }}>
                          {ftpDetailData.port}
                        </span>
                      </div>
                      <div style={styles.detailRow}>
                        <span style={styles.detailLabel}>Trạng thái:</span>
                        <span
                          style={{
                            ...styles.detailValue,
                            fontWeight: 700,
                            color: !ftpDetailData.error ? 'var(--color-success)' : 'var(--color-error)'
                          }}
                        >
                          {!ftpDetailData.error ? 'Đang hoạt động (RUNNING)' : 'Lỗi khởi chạy (ERROR)'}
                        </span>
                      </div>
                      {ftpDetailData.error && (
                        <div style={styles.detailRow}>
                          <span style={styles.detailLabel}>Chi tiết lỗi:</span>
                          <span style={{ ...styles.detailValue, color: 'var(--color-error)' }}>
                            {ftpDetailData.error}
                          </span>
                        </div>
                      )}
                      <div style={{ marginTop: '12px' }}>
                        <span style={{ ...styles.detailLabel, display: 'block', marginBottom: '4px' }}>Thư mục lưu trữ:</span>
                        <div
                          style={{
                            fontFamily: 'monospace',
                            fontSize: '0.72rem',
                            color: 'var(--color-text)',
                            background: 'var(--color-inset-bg)',
                            padding: '10px',
                            borderRadius: '8px',
                            border: '1px solid var(--color-surface-light)',
                            wordBreak: 'break-all',
                            lineHeight: 1.4
                          }}
                        >
                          {ftpDetailData.path}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={styles.modalFooter}>
                    <button
                      style={{ ...styles.smallBtn, padding: '10px 16px', fontSize: '0.85rem' }}
                      onClick={() => {
                        setActiveModal(null);
                        setFtpDetailData(null);
                      }}
                    >
                      Đóng cửa sổ
                    </button>
                  </div>
                </>
              )}

              {/* 4.6. Utilities Modal */}
              {activeModal === 'utilities' && selectedUtilityAgent && (
                <>
                  <div style={styles.modalHeader}>
                    <div>
                      <h3 style={styles.modalTitle}>🛠️ Công cụ & Tiện ích Agent</h3>
                      <div style={styles.modalSubtitle}>
                        Máy: {selectedUtilityAgent.hostname} · IP: {selectedUtilityAgent.local_ip}:{selectedUtilityAgent.web_port || 9173}
                      </div>
                    </div>
                    <button
                      style={styles.modalCloseBtn}
                      onClick={() => {
                        setActiveModal(null);
                        setSelectedUtilityAgent(null);
                        setUtilityStatusMsg(null);
                      }}
                    >
                      &times;
                    </button>
                  </div>

                  <div style={{ ...styles.modalBody, gap: '16px', display: 'flex', flexDirection: 'column' }}>
                    
                    {/* Status Alert block */}
                    {utilityStatusMsg && (
                      <div
                        style={{
                          padding: '10px 12px',
                          borderRadius: '8px',
                          fontSize: '0.78rem',
                          lineHeight: 1.4,
                          background: utilityStatusMsg.isError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                          color: utilityStatusMsg.isError ? '#ef4444' : '#10b981',
                          border: `1px solid ${utilityStatusMsg.isError ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)'}`,
                        }}
                      >
                        {utilityStatusMsg.text}
                      </div>
                    )}

                    {/* Section 1: Cấu hình tự động mở scan */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <h4 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        ⚙️ Cài đặt tự động mở tệp scan
                      </h4>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--color-inset-bg)', padding: '12px', borderRadius: '8px', border: '1px solid var(--color-surface-light)' }}>
                        {utilitySettingsLoading ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                            <LoadingSpinner size="sm" /> Đang tải cấu hình cài đặt...
                          </div>
                        ) : (
                          <>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-text)' }}>
                              <input
                                type="checkbox"
                                checked={scanAutoOpenFile}
                                onChange={() => handleToggleSetting('scan_auto_open_file', scanAutoOpenFile)}
                                style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                              />
                              <div>
                                <div style={{ fontWeight: 500 }}>Tự động mở file khi có scan mới</div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)' }}>Mở trực tiếp file vừa scan bằng ứng dụng mặc định</div>
                              </div>
                            </label>

                            <hr style={{ border: 0, borderTop: '1px solid var(--color-surface-light)', margin: '4px 0' }} />

                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-text)' }}>
                              <input
                                type="checkbox"
                                checked={scanAutoOpenDir}
                                onChange={() => handleToggleSetting('scan_auto_open_dir', scanAutoOpenDir)}
                                style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                              />
                              <div>
                                <div style={{ fontWeight: 500 }}>Tự động mở thư mục scan mới</div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)' }}>Mở thư mục chứa file scan trong Windows Explorer (mặc định ON)</div>
                              </div>
                            </label>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Section 2: Công cụ hệ thống Windows */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <h4 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        🖥️ Công cụ hệ thống Windows
                      </h4>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {/* Dynamic commands from JSON — thêm lệnh mới vào utility_commands.json trên VPS là xong */}
                        {utilityCommandsLoading ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--color-text-secondary)', padding: '8px 0' }}>
                            <LoadingSpinner size="sm" /> Đang tải danh sách lệnh...
                          </div>
                        ) : utilityCommands.length > 0 ? (
                          utilityCommands
                            .filter((cmd: any) => cmd.command !== 'dxdiag')
                            .map((cmd: any) => (
                              <button
                                key={cmd.command}
                                onClick={() => handleTriggerUtilityExec(cmd.command, cmd.command_content)}
                                disabled={utilityActionPending !== null}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '12px',
                                  background: 'var(--color-surface-light)',
                                  border: '1px solid var(--color-surface-light)',
                                  borderRadius: '8px',
                                  padding: '10px 12px',
                                  cursor: utilityActionPending !== null ? 'not-allowed' : 'pointer',
                                  textAlign: 'left',
                                  width: '100%',
                                  transition: 'all 0.2s',
                                  opacity: utilityActionPending !== null ? 0.6 : 1,
                                }}
                                onMouseEnter={(e) => {
                                  if (utilityActionPending === null) {
                                    e.currentTarget.style.borderColor = 'var(--color-primary)';
                                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.05)';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.borderColor = 'var(--color-surface-light)';
                                  e.currentTarget.style.background = 'var(--color-surface-light)';
                                }}
                              >
                                <div style={{ fontSize: '1.4rem' }}>{cmd.icon || '🔧'}</div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text)' }}>{cmd.label}</div>
                                  <div style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)' }}>{cmd.description}</div>
                                </div>
                                {utilityActionPending === cmd.command && <LoadingSpinner size="sm" />}
                              </button>
                            ))
                        ) : (
                          // Fallback: nếu chưa có JSON, dùng 2 lệnh mặc định
                          <>
                            <button onClick={() => handleTriggerUtility('printers')} disabled={utilityActionPending !== null} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--color-surface-light)', border: '1px solid var(--color-surface-light)', borderRadius: '8px', padding: '10px 12px', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.2s' }}>
                              <div style={{ fontSize: '1.4rem' }}>🖨️</div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text)' }}>Danh sách Máy in & Thiết bị</div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)' }}>Mở Control Panel \ Devices and Printers</div>
                              </div>
                              {utilityActionPending === 'printers' && <LoadingSpinner size="sm" />}
                            </button>
                            <button onClick={() => handleTriggerUtility('scan')} disabled={utilityActionPending !== null} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--color-surface-light)', border: '1px solid var(--color-surface-light)', borderRadius: '8px', padding: '10px 12px', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.2s' }}>
                              <div style={{ fontSize: '1.4rem' }}>📂</div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text)' }}>Thư mục Scan gốc</div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)' }}>Mở thư mục lưu trữ file scan trên PC</div>
                              </div>
                              {utilityActionPending === 'scan' && <LoadingSpinner size="sm" />}
                            </button>
                          </>
                        )}

                        {/* Run command input — luôn hiển thị ở dưới cùng */}
                        <div style={{ background: 'var(--color-surface-light)', border: '1px solid var(--color-surface-light)', borderRadius: '8px', padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <div style={{ fontSize: '1.4rem' }}>💻</div>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text)' }}>Thực hiện lệnh Run</div>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                            <input
                              type="text"
                              value={customRunCommand}
                              onChange={(e) => setCustomRunCommand(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && customRunCommand.trim()) {
                                  handleTriggerUtility('run_command', { command_line: customRunCommand.trim() });
                                }
                              }}
                              placeholder="Nhập lệnh cần chạy..."
                              disabled={utilityActionPending !== null}
                              style={{
                                flex: 1,
                                padding: '6px 10px',
                                borderRadius: '6px',
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-surface)',
                                color: 'var(--color-text)',
                                fontSize: '0.78rem',
                                outline: 'none',
                                fontFamily: 'monospace',
                              }}
                            />
                            <button
                              onClick={() => {
                                if (customRunCommand.trim()) {
                                  handleTriggerUtility('run_command', { command_line: customRunCommand.trim() });
                                }
                              }}
                              disabled={utilityActionPending !== null || !customRunCommand.trim()}
                              style={{
                                padding: '6px 14px',
                                borderRadius: '6px',
                                border: 'none',
                                background: customRunCommand.trim() ? 'var(--color-primary)' : 'var(--color-surface)',
                                color: customRunCommand.trim() ? '#fff' : 'var(--color-text-secondary)',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: customRunCommand.trim() && utilityActionPending === null ? 'pointer' : 'not-allowed',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              {utilityActionPending === 'run_command' ? <LoadingSpinner size="sm" /> : '▶ Run'}
                            </button>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {[
                              { label: 'dxdiag', cmd: 'dxdiag', desc: 'Cấu hình phần cứng' },
                              { label: 'msconfig', cmd: 'msconfig', desc: 'Cấu hình hệ thống' },
                              { label: 'ping', cmd: 'ping google.com', desc: 'Kiểm tra mạng' },
                            ].map((item) => (
                              <button
                                key={item.cmd}
                                onClick={() => setCustomRunCommand(item.cmd)}
                                disabled={utilityActionPending !== null}
                                title={item.desc}
                                style={{
                                  padding: '3px 10px',
                                  borderRadius: '12px',
                                  border: '1px solid var(--color-border)',
                                  background: customRunCommand === item.cmd ? 'rgba(59, 130, 246, 0.15)' : 'var(--color-surface)',
                                  color: customRunCommand === item.cmd ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                                  fontSize: '0.68rem',
                                  cursor: utilityActionPending !== null ? 'not-allowed' : 'pointer',
                                  transition: 'all 0.2s',
                                  fontFamily: 'monospace',
                                }}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>


                  </div>

                  <div style={styles.modalFooter}>
                    <button
                      style={{ ...styles.smallBtn, padding: '10px 16px', fontSize: '0.85rem' }}
                      onClick={() => {
                        setActiveModal(null);
                        setSelectedUtilityAgent(null);
                        setUtilityStatusMsg(null);
                      }}
                    >
                      Đóng cửa sổ
                    </button>
                  </div>
                </>
              )}

              {/* 7. Edit IP Modal */}
              {activeModal === 'edit_ip' && editIpModalData && (
                <>
                  <div style={styles.modalHeader}>
                    <h3 style={styles.modalTitle}>✏️ Thay đổi IP điểm scan</h3>
                    <button style={styles.modalCloseBtn} onClick={() => setActiveModal(null)}>
                      &times;
                    </button>
                  </div>
                  <div style={styles.modalBody}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
                      Nhập địa chỉ IP mới cho điểm scan <strong>{editIpModalData.entry.name}</strong>:
                    </div>
                    <input
                      type="text"
                      value={editIpModalData.newIp}
                      onChange={(e) =>
                        setEditIpModalData((prev: any) => prev ? { ...prev, newIp: e.target.value } : null)
                      }
                      placeholder="Ví dụ: 192.168.1.100"
                      style={styles.modalInput}
                    />
                    <div style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)', marginTop: '8px', fontStyle: 'italic' }}>
                      Đường dẫn hiện tại: {editIpModalData.entry.folder || editIpModalData.entry.physical_path || editIpModalData.entry.folder_path}
                    </div>
                  </div>
                  <div style={styles.modalFooter}>
                    <button
                      style={{ ...styles.smallBtn, background: 'none', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', padding: '8px 16px' }}
                      onClick={() => setActiveModal(null)}
                    >
                      Hủy bỏ
                    </button>
                    <button
                      style={{ ...styles.smallBtn, background: 'var(--color-primary)', border: 'none', color: '#fff', padding: '8px 16px', fontWeight: 'bold' }}
                      onClick={handleSaveEditIP}
                      disabled={!editIpModalData.newIp.trim()}
                    >
                      Lưu lại
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5. CUSTOM CONFIRMATION MODAL */}
      <AnimatePresence>
        {confirmModal.isOpen && (
          <div style={styles.confirmOverlay} onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}>
            <motion.div
              style={styles.confirmModalCard}
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>⚠️ {confirmModal.title}</h3>
                <button
                  style={styles.modalCloseBtn}
                  onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                >
                  &times;
                </button>
              </div>

              <div style={styles.modalBody}>
                <p style={{ fontSize: '0.82rem', color: 'var(--color-text)', lineHeight: 1.4, margin: 0, whiteSpace: 'pre-line' }}>
                  {confirmModal.message}
                </p>
              </div>

              <div style={styles.modalFooter}>
                <button
                  style={{
                    ...styles.smallBtn,
                    padding: '10px 16px',
                    fontSize: '0.82rem',
                    background: 'var(--color-error)',
                    borderColor: 'var(--color-error)',
                    color: 'white',
                  }}
                  onClick={confirmModal.onConfirm}
                >
                  Đồng ý
                </button>
                <button
                  style={{
                    ...styles.smallBtn,
                    padding: '10px 16px',
                    fontSize: '0.82rem',
                    borderColor: 'var(--color-secondary)',
                    color: 'var(--color-secondary)',
                  }}
                  onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                >
                  Hủy bỏ
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    paddingBottom: '100px',
    display: 'flex',
    flexDirection: 'column',
    maxWidth: '428px',
    marginLeft: 'auto',
    marginRight: 'auto',
    boxSizing: 'border-box',
    position: 'relative',
  },
  fixedHeader: {
    position: 'fixed',
    top: 0,
    left: '50%',
    transform: 'translateX(-50%)',
    width: '100%',
    maxWidth: '428px',
    background: 'var(--color-bg)',
    zIndex: 100,
    padding: '16px 14px 8px 14px',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    borderBottom: '1px solid var(--color-surface-light)',
  },
  scrollableContent: {
    marginTop: '176px', // Offsets the height of fixedHeader
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: '1.25rem',
    fontWeight: 700,
    color: 'var(--color-primary)',
    margin: 0,
  },
  filterBar: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '10px 12px',
    borderRadius: '10px',
    background: 'color-mix(in srgb, var(--color-primary) 6%, var(--color-surface))',
    border: '1px solid color-mix(in srgb, var(--color-primary) 15%, transparent)',
  },
  filterLabel: {
    fontSize: '0.72rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  lanSelect: {
    fontSize: '0.82rem',
    padding: '8px 10px',
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-surface-light)',
    borderRadius: '6px',
    cursor: 'pointer',
    width: '100%',
  },
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid var(--color-surface-light)',
  },
  tabBtn: {
    flex: 1,
    padding: '10px 4px',
    fontSize: '0.82rem',
    fontWeight: 700,
    textAlign: 'center',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    transition: 'color var(--anim-fast)',
  },
  tabContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  loadingWrapper: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '40px 0',
  },
  emptyText: {
    textAlign: 'center',
    color: 'var(--color-text-secondary)',
    fontSize: '0.8rem',
    padding: '24px 0',
    fontStyle: 'italic',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '8px',
    gap: '8px',
  },
  cardTitle: {
    fontSize: '0.9rem',
    fontWeight: 700,
    color: 'var(--color-text)',
  },
  copierTitle: {
    fontSize: '0.9rem',
    fontWeight: 700,
    color: 'var(--color-primary)',
    display: 'block',
  },
  copierSubtitle: {
    fontSize: '0.72rem',
    color: 'var(--color-text-secondary)',
    marginTop: '2px',
    fontFamily: 'monospace',
  },
  statusBadge: {
    fontSize: '0.65rem',
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: '4px',
    border: '1px solid',
    flexShrink: 0,
  },
  cardDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    background: 'var(--color-inset-bg)',
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1px solid var(--color-surface-light)',
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '0.78rem',
  },
  detailLabel: {
    color: 'var(--color-text-secondary)',
    fontWeight: 500,
  },
  detailValue: {
    color: 'var(--color-text)',
    fontWeight: 600,
    textAlign: 'right',
  },
  cardActionWrapper: {
    marginTop: '8px',
  },
  sectionBlock: {
    marginTop: '8px',
    padding: '8px',
    background: 'var(--color-inset-bg)',
    borderRadius: '8px',
    border: '1px solid var(--color-surface-light)',
  },
  sectionBlockTitle: {
    fontSize: '0.75rem',
    fontWeight: 700,
    color: 'var(--color-text-secondary)',
    display: 'block',
    marginBottom: '6px',
  },
  credsInputRow: {
    display: 'flex',
    gap: '6px',
  },
  credsInput: {
    fontSize: '0.8rem',
    padding: '6px 8px',
    background: 'var(--color-bg)',
    border: '1px solid var(--color-surface-light)',
    borderRadius: '6px',
    flex: 1,
    minWidth: 0,
  },
  relaySelect: {
    fontSize: '0.8rem',
    padding: '4px 6px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-surface-light)',
    borderRadius: '6px',
    cursor: 'pointer',
    flex: 1,
    marginLeft: '12px',
    minWidth: 0,
    color: 'var(--color-text)',
  },
  syncStatusBox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1px solid',
    marginTop: '8px',
    gap: '8px',
  },
  syncStatusTitle: {
    fontSize: '0.72rem',
    color: 'var(--color-text-secondary)',
    fontWeight: 600,
    display: 'block',
  },
  syncStatusText: {
    fontSize: '0.75rem',
    marginTop: '2px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  destinationsBlock: {
    marginTop: '10px',
    padding: '10px 8px',
    background: 'var(--color-inset-bg)',
    borderRadius: '8px',
    border: '1px solid var(--color-surface-light)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  destBlockTitle: {
    fontSize: '0.78rem',
    fontWeight: 700,
    color: 'var(--color-text-secondary)',
    borderBottom: '1px solid var(--color-surface-light)',
    paddingBottom: '4px',
  },
  destItemCard: {
    padding: '8px 10px',
    background: 'var(--color-surface)',
    borderRadius: '6px',
    border: '1px solid var(--color-surface-light)',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  destItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  destItemTitle: {
    fontSize: '0.8rem',
    fontWeight: 700,
    color: 'var(--color-text)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  },
  destTypeBadge: {
    fontSize: '0.6rem',
    fontWeight: 800,
    padding: '1px 4px',
    borderRadius: '3px',
  },
  destRegNo: {
    fontSize: '0.7rem',
    color: 'var(--color-text-secondary)',
    fontWeight: 600,
  },
  destPathValue: {
    fontSize: '0.72rem',
    color: 'var(--color-text-secondary)',
    fontFamily: 'monospace',
    wordBreak: 'break-all',
  },
  destStatusBadge: {
    fontSize: '0.62rem',
    fontWeight: 700,
    padding: '1px 5px',
    borderRadius: '3px',
  },
  destRowActions: {
    display: 'flex',
    gap: '4px',
    marginTop: '6px',
    borderTop: '1px solid var(--color-surface-light)',
    paddingTop: '6px',
  },
  destRowBtn: {
    flex: 1,
    padding: '4px 0',
    fontSize: '0.7rem',
    fontWeight: 600,
    textAlign: 'center',
    color: 'var(--color-primary)',
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid var(--color-surface-light)',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  ftpCredentialsBox: {
    marginTop: '4px',
    background: 'var(--color-inset-bg)',
    padding: '4px 6px',
    borderRadius: '4px',
    fontSize: '0.7rem',
    border: '1px solid var(--color-surface-light)',
    color: 'var(--color-text)',
  },
  copyTextBtn: {
    color: 'var(--color-primary)',
    fontSize: '0.65rem',
    fontWeight: 700,
    cursor: 'pointer',
    background: 'none',
    border: 'none',
  },
  expandSubBtn: {
    fontSize: '0.72rem',
    color: 'var(--color-primary)',
    fontWeight: 600,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 0',
    display: 'block',
  },
  suggestedDriverBlock: {
    padding: '8px',
    background: 'var(--color-inset-bg)',
    border: '1px solid var(--color-surface-light)',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  driverSuggestionItem: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-surface-light)',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  driverModelHeader: {
    padding: '6px 8px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    background: 'rgba(255,255,255,0.02)',
  },
  driverOptionsList: {
    padding: '6px',
    borderTop: '1px solid var(--color-surface-light)',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  driverFileRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 6px',
    background: 'var(--color-inset-bg)',
    borderRadius: '4px',
    gap: '6px',
  },
  driverFileName: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  driverFileUrl: {
    fontSize: '0.62rem',
    color: 'var(--color-text-secondary)',
    fontFamily: 'monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  driverDownloadBtn: {
    fontSize: '0.7rem',
    fontWeight: 700,
    color: 'var(--color-primary)',
    padding: '4px 8px',
    borderRadius: '4px',
    background: 'rgba(0, 212, 255, 0.08)',
    border: '1px solid rgba(0, 212, 255, 0.2)',
    whiteSpace: 'nowrap',
  },
  emptySubText: {
    fontSize: '0.72rem',
    color: 'var(--color-text-secondary)',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: '8px 0',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    zIndex: 150,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  modalCard: {
    backgroundColor: 'var(--color-surface)',
    borderTop: '1px solid var(--color-surface-light)',
    borderTopLeftRadius: '16px',
    borderTopRightRadius: '16px',
    width: '100%',
    maxWidth: '428px',
    maxHeight: '82vh',
    display: 'flex',
    flexDirection: 'column',
    padding: '16px',
    boxSizing: 'border-box',
    boxShadow: '0 -4px 24px rgba(0,0,0,0.3)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px',
  },
  modalTitle: {
    fontSize: '0.95rem',
    fontWeight: 700,
    color: 'var(--color-text)',
    margin: 0,
  },
  modalSubtitle: {
    fontSize: '0.72rem',
    color: 'var(--color-text-secondary)',
    fontFamily: 'monospace',
    marginTop: '2px',
    wordBreak: 'break-all',
  },
  modalCloseBtn: {
    fontSize: '1.5rem',
    lineHeight: 1,
    cursor: 'pointer',
    color: 'var(--color-text-secondary)',
    background: 'none',
    border: 'none',
    padding: '0 4px',
  },
  modalBody: {
    flex: 1,
    overflowY: 'auto',
    marginBottom: '12px',
  },
  modalLoading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '30px 0',
  },
  modalFooter: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginBottom: '12px',
  },
  formHelpText: {
    fontSize: '0.68rem',
    color: 'var(--color-text-secondary)',
    marginTop: '2px',
  },
  modalInput: {
    fontSize: '0.85rem',
    padding: '8px 10px',
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-surface-light)',
    borderRadius: '6px',
    width: '100%',
  },
  filesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  fileItemRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 10px',
    background: 'var(--color-inset-bg)',
    borderRadius: '6px',
    border: '1px solid var(--color-surface-light)',
    gap: '8px',
  },
  fileLinkName: {
    fontSize: '0.78rem',
    fontWeight: 700,
    color: 'var(--color-primary)',
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    wordBreak: 'break-all',
  },
  fileMetaDetails: {
    fontSize: '0.68rem',
    color: 'var(--color-text-secondary)',
    marginTop: '2px',
  },
  fileUploadMeta: {
    fontSize: '0.65rem',
    color: 'var(--color-secondary)',
    marginTop: '1px',
    fontWeight: 500,
  },
  fileDownloadBtn: {
    fontSize: '0.72rem',
    fontWeight: 700,
    color: 'var(--color-primary)',
    padding: '5px 10px',
    borderRadius: '4px',
    background: 'rgba(0, 212, 255, 0.08)',
    border: '1px solid rgba(0, 212, 255, 0.2)',
    whiteSpace: 'nowrap',
  },
  modalDetailsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '10px',
    background: 'var(--color-inset-bg)',
    borderRadius: '8px',
    border: '1px solid var(--color-surface-light)',
  },
  toastContainer: {
    position: 'fixed',
    top: '12px',
    left: '12px',
    right: '12px',
    zIndex: 999,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    maxWidth: '404px',
    marginLeft: 'auto',
    marginRight: 'auto',
    pointerEvents: 'none',
  },
  toast: {
    background: 'rgba(18, 18, 26, 0.95)',
    backdropFilter: 'blur(10px)',
    borderRadius: '8px',
    padding: '10px 12px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    border: '1px solid var(--color-surface-light)',
    color: 'var(--color-text)',
    pointerEvents: 'auto',
  },
  toastIcon: {
    fontSize: '0.9rem',
    flexShrink: 0,
  },
  smallBtn: {
    background: 'transparent',
    color: 'var(--color-primary)',
    border: '1px solid var(--color-surface-light)',
    borderRadius: '6px',
    padding: '6px 10px',
    fontSize: '0.75rem',
    fontWeight: 500,
    cursor: 'pointer',
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
  },
  confirmOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    zIndex: 160,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
  },
  confirmModalCard: {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-surface-light)',
    borderRadius: '12px',
    width: '90%',
    maxWidth: '360px',
    padding: '16px',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    margin: 'auto',
  },
};
