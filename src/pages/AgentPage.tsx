import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  triggerEmergencyRestart,
  getJobs,
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
  const [selectedCameraAgentUid, setSelectedCameraAgentUid] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'agents' | 'copiers' | 'cameras'>(() => {
    const saved = localStorage.getItem('goxprint_active_tab');
    return (saved === 'agents' || saved === 'copiers' || saved === 'cameras') ? saved : 'agents';
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

  // Camera States
  const [cameras, setCameras] = useState<any[]>([]);
  const [camerasLoading, setCamerasLoading] = useState(false);
  const [selectedCamera, setSelectedCamera] = useState<any | null>(null);
  const [cameraForm, setCameraForm] = useState({
    id: null as number | null,
    camera_name: 'Camera mới',
    rtsp_url: '',
    segment_duration: 60,
    prefix: 'rec',
    video_codec: 'copy',
    audio_codec: 'copy',
    no_audio: true
  });
  const [cameraStatus, setCameraStatus] = useState<any>(null);
  const [cameraLogs, setCameraLogs] = useState<any[]>([]);
  const [cameraFiles, setCameraFiles] = useState<any[]>([]);
  const [cameraTestResult, setCameraTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [cameraTestLoading, setCameraTestLoading] = useState(false);

  const [queryTimestamp, setQueryTimestamp] = useState('');
  const [queryDuration, setQueryDuration] = useState(10);
  const [queriedVideoUrl, setQueriedVideoUrl] = useState('');
  const [queryVideoLoading, setQueryVideoLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeLoadingFile, setActiveLoadingFile] = useState<string | null>(null);
  const [isRecording30s, setIsRecording30s] = useState(false);
  const [recording30sCountdown, setRecording30sCountdown] = useState(30);
  const [customRecordDuration, setCustomRecordDuration] = useState(30);


  useEffect(() => {
    if (!queryVideoLoading) {
      setActiveLoadingFile(null);
    }
  }, [queryVideoLoading]);

  // Register parent window dummy functions for Ricoh iframe scripts
  useEffect(() => {
    (window as any).fnGetCookie = (_name?: string) => {
      return '';
    };
    (window as any).fnSetCookie = (_name?: string, _value?: string) => {
      // Dummy
    };
    (window as any).fnGetLocalestring = (_key?: string) => {
      return '';
    };
    (window as any).fnGetHelp = (_url?: string) => {
      // Dummy
    };
  }, []);

  // Toast notifications
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Modals
  const [activeModal, setActiveModal] = useState<'storage' | 'public_ftp' | 'private_ftp' | 'info_detail' | 'ftp_detail' | 'utilities' | 'edit_ip' | 'remote_lock' | 'toshiba_vnc' | null>(null);
  const [selectedUtilityAgent, setSelectedUtilityAgent] = useState<any | null>(null);
  const [ftpDetailData, setFtpDetailData] = useState<{ port: string | number; path: string; error?: string } | null>(null);
  const [remoteLockPrinter, setRemoteLockPrinter] = useState<{ ip: string; name: string; id: string | number; agentUid: string } | null>(null);
  const [toshibaVncData, setToshibaVncData] = useState<{ ip: string; printerName: string; agentUid: string } | null>(null);
  const [allocatedVncAddr, setAllocatedVncAddr] = useState<string>('');
  const [vncTunnelLoading, setVncTunnelLoading] = useState<boolean>(false);
  const [webPreviewModal, setWebPreviewModal] = useState<{ isOpen: boolean; title: string; html: string; ip: string; path: string; agentUid: string; url?: string } | null>(null);
  const [webPreviewLoading, setWebPreviewLoading] = useState<boolean>(false);
  const [directLan, setDirectLan] = useState<boolean>(() => {
    return localStorage.getItem('goxprint_direct_lan') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('goxprint_direct_lan', String(directLan));
  }, [directLan]);

  const detectBrand = (name: string): 'ricoh' | 'toshiba' | 'other' => {
    const lower = (name || '').toLowerCase();
    if (
      lower.includes('ricoh') ||
      lower.includes('savin') ||
      lower.includes('aficio') ||
      lower.includes('gestetner') ||
      lower.includes('lanier') ||
      lower.includes('infotec') ||
      lower.includes('mp ') ||
      lower.startsWith('mp') ||
      lower.includes('im ') ||
      lower.startsWith('im') ||
      lower.includes('pro ') ||
      lower.startsWith('pro')
    ) {
      return 'ricoh';
    }
    if (lower.includes('toshiba')) {
      return 'toshiba';
    }
    return 'other';
  };

  const [webPreviewTab, setWebPreviewTab] = useState<'iframe' | 'html'>('iframe');
  const [showPreviewDetails, setShowPreviewDetails] = useState<boolean>(() => {
    return window.innerWidth >= 768;
  });
  const [webPreviewHistory, setWebPreviewHistory] = useState<string[]>([]);
  const [webPreviewHistoryIndex, setWebPreviewHistoryIndex] = useState<number>(-1);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string>('');
  const [scaleX, setScaleX] = useState<number>(0.95);
  const [scaleY, setScaleY] = useState<number>(0.95);
  const [lockAspect, setLockAspect] = useState<boolean>(true);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);
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

  const [installDriverModal, setInstallDriverModal] = useState<{
    isOpen: boolean;
    printerId: string;
    brand: string;
    model: string;
    driverName: string;
    driverUrl: string;
    selectedAgentUid: string;
  }>({
    isOpen: false,
    printerId: '',
    brand: '',
    model: '',
    driverName: '',
    driverUrl: '',
    selectedAgentUid: '',
  });

  // IP Input Modal state
  const [ipInputModal, setIpInputModal] = useState<{
    isOpen: boolean;
    title: string;
    hint: string;
    value: string;
    scanStatus?: string;
    error: string;
    onConfirm: (ip: string) => void;
  }>({
    isOpen: false,
    title: '🌐 Đổi địa chỉ IP tĩnh',
    hint: 'Nhập địa chỉ IPv4 tĩnh muốn gán cho máy Agent.',
    value: '',
    scanStatus: '',
    error: '',
    onConfirm: () => {},
  });


  // Storage Modal states
  const [storageModalData, setStorageModalData] = useState<{ lanUid: string; email: string }>({ lanUid: '', email: '' });
  const [storageFiles, setStorageFiles] = useState<any[]>([]);
  const [storageLoading, setStorageLoading] = useState(false);

  // Add Public FTP states
  const [publicFtpData, setPublicFtpData] = useState<{ printerId: string; name: string; email: string; agentUid: string }>({ printerId: '', name: '', email: '', agentUid: '' });
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

  const resolveRelativePath = (relative: string, current: string) => {
    if (relative.startsWith('http://') || relative.startsWith('https://') || relative.startsWith('data:')) {
      try {
        const parsed = new URL(relative);
        return parsed.pathname + parsed.search;
      } catch {
        return relative;
      }
    }
    
    if (relative.startsWith('/')) {
      return relative;
    }
    
    const baseClean = current.split('?')[0];
    const parts = baseClean.split('/');
    parts.pop(); // remove filename
    const baseDir = parts.join('/');
    
    const resolved = baseDir + '/' + relative;
    try {
      const urlObj = new URL(resolved, 'http://localhost');
      return urlObj.pathname + urlObj.search;
    } catch {
      return resolved;
    }
  };

  const fetchRemotePage = async (
    printerIp: string,
    targetPath: string,
    _method: string = 'GET',
    _postData?: any,
    _isHistoryNav: boolean = false,
    agentUidParam?: string,
    printerPort: number = 80
  ) => {
    const activeAgentUid = agentUidParam || webPreviewModal?.agentUid;
    if (!activeAgentUid) {
      console.error('No agent UID available for remote page fetch');
      showToast('Không tìm thấy Target Agent UID', 'error');
      return;
    }

    if (directLan) {
      // Direct LAN mode: Open directly in a new tab immediately
      window.open(`http://${printerIp}:${printerPort}${targetPath || '/'}`, '_blank');
      return;
    }

    // Tunnel mode: Open both loading tabs immediately to bypass browser popup blocker
    const createLoaderHtml = (title: string, desc: string) => `
      <html>
        <head>
          <title>${title}</title>
          <style>
            body {
              background: #0f172a;
              color: #f8fafc;
              font-family: sans-serif;
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
            }
            .spinner {
              border: 4px solid rgba(255,255,255,0.1);
              width: 36px;
              height: 36px;
              border-radius: 50%;
              border-left-color: #3b82f6;
              animation: spin 1s linear infinite;
              margin-bottom: 16px;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          </style>
        </head>
        <body>
          <div class="spinner"></div>
          <div style="font-weight: 600; font-size: 1.1rem; margin-bottom: 8px;">${title}</div>
          <div style="color: #94a3b8; font-size: 0.9rem;">${desc}</div>
        </body>
      </html>
    `;

    const wildcardTab = window.open('about:blank', '_blank');
    if (wildcardTab) {
      wildcardTab.document.write(createLoaderHtml(
        'Đang kết nối tên miền...',
        `Đang kết nối đến máy in ${printerIp} qua tên miền *.app.goxprint.com...`
      ));
    }

    try {
      const response = await fetch(`${BASE_URL}/api/agents/${activeAgentUid}/tunnel/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printer_ip: printerIp, printer_port: printerPort })
      });
      const data = await response.json();
      if (data.ok) {
        if (wildcardTab && data.url) {
          wildcardTab.location.href = data.url;
        }
      } else {
        if (wildcardTab) wildcardTab.close();
        showToast('Kết nối lỗi: ' + (data.error || 'Không thể khởi động đường hầm SSH ngược trên Agent'), 'error');
      }
    } catch (err: any) {
      if (wildcardTab) wildcardTab.close();
      showToast('Lỗi hệ thống VPS: ' + (err.message || err), 'error');
    }
  };

  /* const fetchRemotePageOld = async (
    printerIp: string,
    targetPath: string,
    method: string = 'GET',
    postData?: any,
    isHistoryNav: boolean = false,
    agentUidParam?: string
  ) => {
    const activeAgentUid = agentUidParam || webPreviewModal?.agentUid;
    if (!activeAgentUid) {
      console.error('No agent UID available for remote page fetch');
      return;
    }
    
    setWebPreviewModal(prev => {
      const isFirstLoad = !prev || prev.html === 'LOADING';
      return {
        isOpen: true,
        title: prev?.title || ('Web Image Monitor - ' + printerIp),
        html: isFirstLoad ? 'LOADING' : prev.html,
        ip: printerIp,
        path: targetPath,
        agentUid: activeAgentUid
      };
    });
    if (directLan) {
      setWebPreviewModal(prev => {
        return {
          isOpen: true,
          title: prev?.title || ('Web Image Monitor (LAN) - ' + printerIp),
          html: 'DIRECT_LAN',
          ip: printerIp,
          path: targetPath,
          agentUid: activeAgentUid
        };
      });
      setWebPreviewLoading(false);
      return;
    }

    setWebPreviewLoading(true);

    try {
      const base64Data = postData ? btoa(JSON.stringify(postData)) : '';
      const script = `target_ip = '${printerIp}'\ntarget_path = '${targetPath}'\ntarget_method = '${method}'\ntarget_data = '${base64Data}'`;
      
      const res: any = await triggerAgentUtilityExec(activeAgentUid, 'open_web_setting', script);
      if (!res.ok || !res.command_id) {
        setWebPreviewModal(prev => prev ? { ...prev, html: `ERROR: ${res.error || 'Không thể tạo lệnh tiện ích'}` } : null);
        setWebPreviewLoading(false);
        return;
      }

      const commandId = res.command_id;
      const maxPollMs = 60000;
      const startTime = Date.now();
      
      const pollTimer = setInterval(async () => {
        try {
          const elapsed = Date.now() - startTime;
          if (elapsed > maxPollMs) {
            clearInterval(pollTimer);
            setWebPreviewModal(prev => prev ? { ...prev, html: 'ERROR: Yêu cầu quá thời gian chờ (60s)' } : null);
            return;
          }

          const statusRes = await getCommandStatus(commandId);
          if (statusRes.status === 'success') {
            clearInterval(pollTimer);
            let parsedRes: any = {};
            try {
              let raw = statusRes.result_payload || statusRes.error || '';
              if (typeof raw === 'string') {
                raw = raw.trim();
                if (raw.startsWith('"') && raw.endsWith('"')) {
                  try {
                    raw = JSON.parse(raw);
                  } catch {}
                }
                parsedRes = JSON.parse(raw);
              } else {
                parsedRes = raw;
              }
            } catch (parseErr) {
              parsedRes = { error: 'Lỗi parse JSON: ' + (statusRes.result_payload || statusRes.error) };
            }

            if (parsedRes.html) {
              let rawHtml = parsedRes.html;
              const returnedPath = parsedRes.path || targetPath;

              let preparedHtml = rawHtml;

              // 1. Strip render-blocking stylesheets and external scripts to prevent the browser from freezing on unreachable IP assets
              preparedHtml = preparedHtml.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, '');
              preparedHtml = preparedHtml.replace(/<script[^>]*src=[^>]*><\/script>/gi, '');
              preparedHtml = preparedHtml.replace(/<script[^>]*src=[^>]*\s*\/>/gi, '');

              // 2. Insert base tag, CDN jQuery, and top-level fallbacks to prevent ReferenceErrors from executing inline scripts early
              const fallbacks = `
                <script>
                  // Toshiba fallbacks
                  window.fnGetLocaleString = window.fnGetLocaleString || function(id, defaultVal) { return defaultVal || id || ""; };
                  window.fnGetResolveLocaleForDisplay = window.fnGetResolveLocaleForDisplay || function(id, defaultVal) { return defaultVal || id || ""; };
                  window.fnGetResolveLocale = window.fnGetResolveLocale || function(id, defaultVal) { return defaultVal || id || ""; };
                  window.fnGetLocale = window.fnGetLocale || function(id, defaultVal) { return defaultVal || id || ""; };
                  window.InitiateServerRequest = window.InitiateServerRequest || function() {};

                  // Ricoh fallbacks
                  window.mouseOverTransfer = window.mouseOverTransfer || function() {};
                  window.mouseOutTransfer = window.mouseOutTransfer || function() {};
                  window.menuParent_Mouseover = window.menuParent_Mouseover || function() {};
                  window.menuParent_Mouseout = window.menuParent_Mouseout || function() {};
                  window.menuChild_Mouseover = window.menuChild_Mouseover || function() {};
                  window.menuChild_Mouseout = window.menuChild_Mouseout || function() {};

                  // Override navigation functions
                  window.wsMenu_jumpUrl = window.wsMenu_jumpurl = window.wsMenu_jumpURL = function(url) {
                    window.parent.postMessage({
                      type: 'iframe_navigate',
                      href: url,
                      currentPath: ${JSON.stringify(returnedPath)},
                      target: '_self'
                    }, '*');
                  };
                  window.jumpTo = function(url) {
                    window.parent.postMessage({
                      type: 'iframe_navigate',
                      href: url,
                      currentPath: ${JSON.stringify(returnedPath)},
                      target: '_self'
                    }, '*');
                  };
                </script>
              `;
              const jqueryCdn = `<script src="https://code.jquery.com/jquery-1.4.4.min.js"></script>`;
              const baseTag = `<base href="http://${printerIp}/">${jqueryCdn}${fallbacks}`;
              if (/<head[^>]*>/i.test(preparedHtml)) {
                preparedHtml = preparedHtml.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
              } else {
                preparedHtml = `${baseTag}${preparedHtml}`;
              }

              const customStyle = `
                <style>
                  body {
                    font-family: system-ui, -apple-system, sans-serif;
                    color: #1e293b;
                    background-color: #f8fafc;
                    margin: 20px;
                    line-height: 1.5;
                  }
                  a {
                    color: #2563eb;
                    text-decoration: none;
                    font-weight: 500;
                  }
                  a:hover {
                    text-decoration: underline;
                  }
                  ul {
                    padding-left: 20px;
                  }
                  li {
                    margin-bottom: 6px;
                  }
                  table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 15px 0;
                    background: white;
                    border-radius: 8px;
                    overflow: hidden;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                  }
                  th, td {
                    padding: 10px 14px;
                    border: 1px solid #e2e8f0;
                    text-align: left;
                  }
                  th {
                    background-color: #f1f5f9;
                    font-weight: 600;
                  }
                  input[type="text"], input[type="password"], select, textarea {
                    padding: 8px 12px;
                    border: 1px solid #cbd5e1;
                    border-radius: 6px;
                    font-size: 0.9rem;
                    background: white;
                  }
                  input[type="submit"], input[type="button"], button {
                    background-color: #2563eb;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 6px;
                    font-weight: 500;
                    cursor: pointer;
                  }
                  input[type="submit"]:hover, button:hover {
                    background-color: #1d4ed8;
                  }
                  #shortcutlink, #topwrap form, select[name="language"], input[name="switch"] {
                    display: inline-block;
                    margin-right: 10px;
                  }
                  #sideColumn ul {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                  }
                  #sideColumn > div > ul > li {
                    background: #e2e8f0;
                    margin-bottom: 10px;
                    padding: 10px;
                    border-radius: 8px;
                    font-weight: bold;
                  }
                  #sideColumn .submenu {
                    font-weight: normal;
                    margin-top: 6px;
                    padding-left: 10px;
                    background: #f1f5f9;
                    border-radius: 6px;
                    padding: 6px;
                  }
                  #sideColumn .submenu li {
                    margin: 4px 0;
                  }
                  .display-n {
                    display: block !important;
                  }
                </style>
              `;

              if (preparedHtml.includes('</head>')) {
                preparedHtml = preparedHtml.replace('</head>', `${customStyle}</head>`);
              } else {
                preparedHtml = customStyle + preparedHtml;
              }

              const injectScript = `
                <script>
                (function() {
                  // Register dummy fallback locale functions for Toshiba printers
                  window.fnGetLocaleString = window.fnGetLocaleString || function(id, defaultVal) {
                    return defaultVal || id || "";
                  };
                  window.fnGetResolveLocaleForDisplay = window.fnGetResolveLocaleForDisplay || function(id, defaultVal) {
                    return defaultVal || id || "";
                  };
                  window.fnGetResolveLocale = window.fnGetResolveLocale || function(id, defaultVal) {
                    return defaultVal || id || "";
                  };
                  window.fnGetLocale = window.fnGetLocale || function(id, defaultVal) {
                    return defaultVal || id || "";
                  };

                  // Register dummy fallback menu/hover functions for Ricoh printers
                  window.mouseOverTransfer = window.mouseOverTransfer || function() {};
                  window.mouseOutTransfer = window.mouseOutTransfer || function() {};
                  window.menuParent_Mouseover = window.menuParent_Mouseover || function() {};
                  window.menuParent_Mouseout = window.menuParent_Mouseout || function() {};
                  window.menuChild_Mouseover = window.menuChild_Mouseover || function() {};
                  window.menuChild_Mouseout = window.menuChild_Mouseout || function() {};

                  // Redefine Ricoh menu navigation functions
                  window.wsMenu_jumpUrl = window.wsMenu_jumpurl = window.wsMenu_jumpURL = function(url) {
                    window.parent.postMessage({
                      type: 'iframe_navigate',
                      href: url,
                      currentPath: ${JSON.stringify(returnedPath)},
                      target: '_self'
                    }, '*');
                  };
                  window.jumpTo = function(url) {
                    window.parent.postMessage({
                      type: 'iframe_navigate',
                      href: url,
                      currentPath: ${JSON.stringify(returnedPath)},
                      target: '_self'
                    }, '*');
                  };

                  // Intercept anchor clicks
                  document.addEventListener('click', function(e) {
                    var anchor = e.target.closest('a');
                    if (anchor) {
                      var href = anchor.getAttribute('href');
                      if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
                        if (href.startsWith('http') && !href.includes('${printerIp}')) {
                          return;
                        }
                        e.preventDefault();
                        window.parent.postMessage({
                          type: 'iframe_navigate',
                          href: href,
                          currentPath: ${JSON.stringify(returnedPath)},
                          target: anchor.getAttribute('target') || '_self'
                        }, '*');
                      }
                    }
                  }, true);

                  // Intercept standard form submit events
                  document.addEventListener('submit', function(e) {
                    var form = e.target;
                    var action = form.getAttribute('action') || '';
                    e.preventDefault();
                    
                    var formData = {};
                    var inputs = form.querySelectorAll('input, select, textarea');
                    inputs.forEach(function(input) {
                      if (input.name) {
                        if (input.type === 'checkbox' || input.type === 'radio') {
                          if (input.checked) {
                            formData[input.name] = input.value;
                          }
                        } else {
                          formData[input.name] = input.value;
                        }
                      }
                    });

                    window.parent.postMessage({
                      type: 'iframe_submit',
                      action: action,
                      currentPath: ${JSON.stringify(returnedPath)},
                      formData: formData,
                      target: form.getAttribute('target') || '_self'
                    }, '*');
                  }, true);

                  // Intercept programmatic form.submit() calls
                  var originalSubmit = HTMLFormElement.prototype.submit;
                  HTMLFormElement.prototype.submit = function() {
                    var form = this;
                    var action = form.getAttribute('action') || '';
                    
                    var formData = {};
                    var inputs = form.querySelectorAll('input, select, textarea');
                    inputs.forEach(function(input) {
                      if (input.name) {
                        if (input.type === 'checkbox' || input.type === 'radio') {
                          if (input.checked) {
                            formData[input.name] = input.value;
                          }
                        } else {
                          formData[input.name] = input.value;
                        }
                      }
                    });

                    window.parent.postMessage({
                      type: 'iframe_submit',
                      action: action,
                      currentPath: ${JSON.stringify(returnedPath)},
                      formData: formData,
                      target: form.getAttribute('target') || '_self'
                    }, '*');
                  };
                })();
                </script>
              `;

              if (preparedHtml.includes('</body>')) {
                preparedHtml = preparedHtml.replace('</body>', `${injectScript}</body>`);
              } else {
                preparedHtml += injectScript;
              }

              if (!isHistoryNav) {
                const newHistory = webPreviewHistory.slice(0, webPreviewHistoryIndex + 1);
                newHistory.push(returnedPath);
                setWebPreviewHistory(newHistory);
                setWebPreviewHistoryIndex(newHistory.length - 1);
              }

              setWebPreviewModal(prev => prev ? { ...prev, html: preparedHtml, path: returnedPath } : null);
              setWebPreviewLoading(false);
            } else {
              setWebPreviewModal(prev => prev ? { ...prev, html: `ERROR: ${parsedRes.error || 'Agent không trả về HTML'}` } : null);
              setWebPreviewLoading(false);
            }
          } else if (statusRes.status === 'failed' || !statusRes.ok) {
            clearInterval(pollTimer);
            setWebPreviewModal(prev => prev ? { ...prev, html: `ERROR: ${statusRes.error || 'Lệnh thất bại từ Agent'}` } : null);
            setWebPreviewLoading(false);
          }
        } catch (pollErr: any) {
          console.error('Poll error:', pollErr);
        }
      }, 1500);

    } catch (err: any) {
      setWebPreviewModal(prev => prev ? { ...prev, html: `ERROR: ${err.message}` } : null);
      setWebPreviewLoading(false);
    }
  }; */

  const handleHistoryBack = () => {
    if (webPreviewHistoryIndex > 0 && webPreviewModal) {
      const prevIdx = webPreviewHistoryIndex - 1;
      setWebPreviewHistoryIndex(prevIdx);
      fetchRemotePage(webPreviewModal.ip, webPreviewHistory[prevIdx], 'GET', undefined, true);
    }
  };

  const handleHistoryForward = () => {
    if (webPreviewHistoryIndex < webPreviewHistory.length - 1 && webPreviewModal) {
      const nextIdx = webPreviewHistoryIndex + 1;
      setWebPreviewHistoryIndex(nextIdx);
      fetchRemotePage(webPreviewModal.ip, webPreviewHistory[nextIdx], 'GET', undefined, true);
    }
  };

  const handleToggleDirectLan = (enabled: boolean) => {
    setDirectLan(enabled);
    if (webPreviewModal) {
      if (enabled) {
        setWebPreviewModal(prev => prev ? { ...prev, html: 'DIRECT_LAN' } : null);
        setWebPreviewLoading(false);
      } else {
        // Trigger a fresh remote page fetch via Agent
        fetchRemotePage(webPreviewModal.ip, webPreviewModal.path, 'GET', undefined, false, webPreviewModal.agentUid);
      }
    }
  };

  const handleCloseWebPreview = () => {
    if (webPreviewModal && webPreviewModal.agentUid) {
      fetch(`${BASE_URL}/api/agents/${webPreviewModal.agentUid}/tunnel/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printer_ip: webPreviewModal.ip })
      }).catch(console.error);
    }
    setWebPreviewModal(null);
    setWebPreviewLoading(false);
    setWebPreviewHistory([]);
    setWebPreviewHistoryIndex(-1);
  };

  useEffect(() => {
    const handleIframeMessage = (e: MessageEvent) => {
      const msg = e.data;
      if (!msg || typeof msg !== 'object') return;
      if (!webPreviewModal || !webPreviewModal.ip) return;

      if (msg.type === 'iframe_navigate') {
        const resolved = resolveRelativePath(msg.href, msg.currentPath);
        fetchRemotePage(webPreviewModal.ip, resolved);
      } else if (msg.type === 'iframe_submit') {
        const resolved = resolveRelativePath(msg.action, msg.currentPath);
        fetchRemotePage(webPreviewModal.ip, resolved, 'POST', msg.formData);
      }
    };

    window.addEventListener('message', handleIframeMessage);
    return () => window.removeEventListener('message', handleIframeMessage);
  }, [webPreviewModal, webPreviewHistory, webPreviewHistoryIndex]);

  useEffect(() => {
    if (webPreviewModal?.html && webPreviewModal.html !== 'LOADING' && !webPreviewModal.html.startsWith('ERROR:')) {
      const blob = new Blob([webPreviewModal.html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      setPreviewBlobUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setPreviewBlobUrl('');
    }
  }, [webPreviewModal?.html]);

  // Apply scaling to iframe content
  useEffect(() => {
    const applyScaling = () => {
      try {
        const iframe = previewIframeRef.current;
        if (!iframe) return;
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc && doc.body) {
          // Reset html and body height constraints to let them grow dynamically to fit the full content height, avoiding cutoffs
          doc.documentElement.style.height = 'auto';
          doc.body.style.height = 'auto';
          doc.body.style.minHeight = '100%';

          doc.body.style.transform = `scale(${scaleX}, ${scaleY})`;
          doc.body.style.transformOrigin = 'top left';
          doc.body.style.width = `${100 / scaleX}%`;
          doc.body.style.boxSizing = 'border-box';
        }
      } catch (err) {
        console.error('Failed to apply scaling:', err);
      }
    };

    applyScaling();

    const iframe = previewIframeRef.current;
    if (iframe) {
      iframe.addEventListener('load', applyScaling);
      return () => {
        iframe.removeEventListener('load', applyScaling);
      };
    }
  }, [previewBlobUrl, scaleX, scaleY]);

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

  const fetchCameras = useCallback(async (agentUid: string) => {
    if (!agentUid) return;
    setCamerasLoading(true);
    try {
      const response = await fetch(`${BASE_URL}/api/agents/${agentUid}/cameras`);
      const data = await response.json();
      if (data.ok) {
        setCameras(data.cameras || []);
      } else {
        showToast('Không tải được danh sách camera: ' + data.error, 'error');
      }
    } catch (err: any) {
      showToast('Lỗi tải camera: ' + err.message, 'error');
    } finally {
      setCamerasLoading(false);
    }
  }, [showToast]);

  // Computed active LAN
  const selectedLan = useMemo(() => {
    return lanSites.find((site) => site.lan_uid === selectedLanUid);
  }, [lanSites, selectedLanUid]);

  const onlineAgents = useMemo(() => {
    return (selectedLan?.agents || []).filter((a: any) => a.is_online);
  }, [selectedLan]);

  const activeAgentUid = useMemo(() => {
    if (selectedCameraAgentUid) {
      const exists = onlineAgents.some((a: any) => a.agent_uid === selectedCameraAgentUid);
      if (exists) return selectedCameraAgentUid;
    }
    return onlineAgents[0]?.agent_uid || '';
  }, [selectedCameraAgentUid, onlineAgents]);

  const getLiveQueryTimestamp = () => {
    const now = new Date();
    const targetTime = new Date(now.getTime() - 45 * 1000);
    const YYYY = targetTime.getFullYear();
    const MM = String(targetTime.getMonth() + 1).padStart(2, '0');
    const DD = String(targetTime.getDate()).padStart(2, '0');
    const hh = String(targetTime.getHours()).padStart(2, '0');
    const mm = String(targetTime.getMinutes()).padStart(2, '0');
    const ss = String(targetTime.getSeconds()).padStart(2, '0');
    return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}`;
  };

  useEffect(() => {
    setSelectedCamera(null);
    setCameraForm({
      id: null,
      camera_name: '',
      rtsp_url: '',
      segment_duration: 60,
      prefix: 'rec',
      video_codec: 'copy',
      audio_codec: 'copy',
      no_audio: true,
    });
  }, [activeAgentUid]);

  useEffect(() => {
    if (activeTab === 'cameras' && activeAgentUid) {
      fetchCameras(activeAgentUid);
    }
  }, [activeTab, activeAgentUid, fetchCameras]);

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
  const [viewOutputModal, setViewOutputModal] = useState<{ isOpen: boolean; title: string; content: string }>({
    isOpen: false, title: '', content: '',
  });

  const [editableSettingsText, setEditableSettingsText] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSaveStatus, setSettingsSaveStatus] = useState<string | null>(null);

  const handleSaveSettings = async () => {
    if (!selectedUtilityAgent) return;
    try {
      JSON.parse(editableSettingsText);
    } catch (e: any) {
      setSettingsSaveStatus(`❌ Lỗi định dạng JSON: ${e.message}`);
      return;
    }
    setIsSavingSettings(true);
    setSettingsSaveStatus('⌛ Đang gửi cấu hình mới tới Agent...');
    const base64Content = btoa(unescape(encodeURIComponent(editableSettingsText)));
    const pythonScript = `import os, sys, json, base64
new_content = base64.b64decode("${base64Content}").decode("utf-8")
try:
    parsed = json.loads(new_content)
    exe_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.getcwd()
    candidates = [
        os.path.join(exe_dir, 'settings.json'),
        os.path.join(os.getcwd(), 'settings.json'),
        'settings.json',
    ]
    found = None
    for p in candidates:
        if os.path.exists(p):
            found = p
            break
    if not found:
        found = candidates[0]

    with open(found + '.bak', 'w', encoding='utf-8') as f_bak:
        try:
            with open(found, 'r', encoding='utf-8') as f_orig:
                f_bak.write(f_orig.read())
        except:
            pass

    with open(found, 'w', encoding='utf-8') as f:
        json.dump(parsed, f, ensure_ascii=False, indent=2)

    try:
        if 'bridge' in globals():
            globals()['bridge']._config.reload()
    except Exception as e:
        pass

    msg = "Đã lưu cấu hình thành công!"
    if globals().get('context'):
        globals()['context']['result_payload'] = msg
    else:
        raise RuntimeError(msg)
except Exception as e:
    raise RuntimeError(str(e))
`;
    try {
      const res = await triggerAgentUtilityExec(selectedUtilityAgent.agent_uid, 'save_settings_json', pythonScript);
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
            setSettingsSaveStatus('❌ Lưu thất bại: Hết thời gian chờ (60s)');
            setIsSavingSettings(false);
            return;
          }
          const statusRes = await getCommandStatus(commandId);
          if (statusRes.status === 'success') {
            clearInterval(timer);
            setSettingsSaveStatus('✔️ Đã lưu cấu hình và tự động reload thành công!');
            setIsSavingSettings(false);
            setViewOutputModal(prev => ({ ...prev, content: editableSettingsText }));
            setTimeout(() => setSettingsSaveStatus(null), 3000);
          } else if (statusRes.status === 'failed' || !statusRes.ok) {
            clearInterval(timer);
            setSettingsSaveStatus(`❌ Lỗi từ máy trạm: ${statusRes.error || 'Lưu thất bại'}`);
            setIsSavingSettings(false);
          }
        } catch (pollErr: any) {
          console.error('Poll error:', pollErr);
        }
      }, 1000);
    } catch (err: any) {
      setSettingsSaveStatus(`❌ Lỗi kết nối: ${err.message}`);
      setIsSavingSettings(false);
    }
  };

  const formatJsonText = (raw: string): string => {
    try {
      let parsed = raw;
      while (typeof parsed === 'string') {
        const trimmed = parsed.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
          parsed = JSON.parse(parsed);
        } else {
          break;
        }
      }
      if (typeof parsed === 'object' && parsed !== null) {
        return JSON.stringify(parsed, null, 2);
      }
      if (typeof parsed === 'string') {
        parsed = parsed.replace(/\\n/g, '\n')
                       .replace(/\\t/g, '\t')
                       .replace(/\\"/g, '"')
                       .replace(/\\\\/g, '\\');
      }
      return String(parsed);
    } catch (e) {
      return raw;
    }
  };

  useEffect(() => {
    if (viewOutputModal.isOpen && viewOutputModal.title.includes('settings.json')) {
      setEditableSettingsText(formatJsonText(viewOutputModal.content));
      setSettingsSaveStatus(null);
    }
  }, [viewOutputModal.isOpen, viewOutputModal.title, viewOutputModal.content]);

  const isDuplicatePending = async (agentUid: string, commandType: string, paramsToCheck: any): Promise<boolean> => {
    try {
      const res = await getJobs(undefined, undefined, agentUid);
      if (res.ok && res.jobs) {
        const pendingJobs = res.jobs.filter((job: any) => job.status === 'pending');
        for (const job of pendingJobs) {
          if (job.command_type !== commandType) continue;
          try {
            const jobParams = JSON.parse(job.command_params);
            let match = true;
            for (const key of Object.keys(paramsToCheck)) {
              if (jobParams[key] !== paramsToCheck[key]) {
                match = false;
                break;
              }
            }
            if (match) return true;
          } catch {
            if (job.command_params === JSON.stringify(paramsToCheck)) return true;
          }
        }
      }
    } catch (e) {
      console.error("Failed to check duplicate pending jobs", e);
    }
    return false;
  };

  // Commands that return content via RuntimeError — show in view modal instead of error
  const VIEW_COMMANDS = new Set(['view_settings_json', 'view_stout', 'view_sterror', 'get_public_ip', 'check_watchdog', 'open_web_setting']);
  const VIEW_COMMAND_TITLES: Record<string, string> = {
    view_settings_json: '⚙️ settings.json',
    view_stout: '📄 stout.txt — 100 dòng gần nhất',
    view_sterror: '🔴 sterror.txt — 100 dòng gần nhất',
    get_public_ip: '🌍 IP Public',
    check_watchdog: '🩺 Check Watchdog',
    open_web_setting: '🌐 Web setting',
  };

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

    const backendAction = action === 'printers' ? 'devices_and_printers' : (action === 'scan' ? 'open_scan_folder' : (action === 'change_ip' ? 'change_ip' : (action === 'run_command' ? 'run_command' : 'dxdiag')));
    const isDup = await isDuplicatePending(selectedUtilityAgent.agent_uid, 'trigger_utility', {
      action: backendAction,
      ...(payload || {})
    });
    if (isDup) {
      showToast('Lệnh tiện ích này đang chờ phản hồi từ Agent!', 'info');
      return;
    }

    setUtilityActionPending(action);
    setUtilityStatusMsg({ text: '⌛ Đang gửi lệnh tới Agent...', isError: false });
    
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

  const handleTriggerUtilityExec = useCallback(async (command: string, commandContent: string) => {
    if (!selectedUtilityAgent) return;

    const isDup = await isDuplicatePending(selectedUtilityAgent.agent_uid, 'trigger_utility', {
      action: 'exec_utility',
      command: command
    });
    if (isDup) {
      showToast('Yêu cầu chạy script/lệnh này đang chờ phản hồi từ Agent!', 'info');
      return;
    }
    
    // Find cmd in local state utilityCommands
    const cmdObj = utilityCommands.find(c => c.command === command);
    const isOutputModal = cmdObj?.output_modal || VIEW_COMMANDS.has(command);
    const displayTitle = cmdObj?.label || VIEW_COMMAND_TITLES[command] || command;

    let content = commandContent;
    if (command === 'change_agent_ip' || command === 'check_scan_ip_match') {
      const isChangeIp = command === 'change_agent_ip';
      const currentIp = selectedUtilityAgent?.local_ip || selectedUtilityAgent?.ip || selectedUtilityAgent?.agent_ip || selectedUtilityAgent?.localIp || '';
      
      // Open IP input modal immediately without blocking
      setIpInputModal({
        isOpen: true,
        title: isChangeIp ? '🌐 Đổi địa chỉ IP tĩnh' : '🔍 Kiểm tra IP khớp Copier',
        hint: isChangeIp
          ? 'Nhập địa chỉ IPv4 tĩnh muốn gán cho máy Agent.'
          : 'Nhập địa chỉ IP muốn kiểm tra xem copier nào có FTP Scan entry khớp.',
        value: currentIp,
        scanStatus: isChangeIp ? '⏳ Loading... Đang quét điểm scan FTP trên máy photo...' : '',
        error: '',
        onConfirm: (targetIp: string) => {
          const finalContent = commandContent.replace('__TARGET_IP__', targetIp);
          setUtilityActionPending(command);
          setUtilityStatusMsg({ text: '⌛ Đang gửi lệnh tới Agent...', isError: false });
          triggerAgentUtilityExec(selectedUtilityAgent!.agent_uid, command, finalContent)
            .then((res: any) => {
              if (!res.ok || !res.command_id) throw new Error(res.error || 'Không thể tạo lệnh tiện ích');
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
                    if (isOutputModal) {
                      setViewOutputModal({
                        isOpen: true,
                        title: displayTitle,
                        content: statusRes.result_payload || statusRes.result || '(không có nội dung)',
                      });
                      setUtilityStatusMsg(null);
                    } else {
                      setUtilityStatusMsg({ text: '⚡ Thực hiện lệnh thành công!', isError: false });
                    }
                    setUtilityActionPending(null);
                  } else if (statusRes.status === 'failed' || !statusRes.ok) {
                    clearInterval(timer);
                    if (isOutputModal) {
                      setViewOutputModal({
                        isOpen: true,
                        title: displayTitle,
                        content: statusRes.error || statusRes.result_payload || statusRes.result || '(không có nội dung)',
                      });
                      setUtilityStatusMsg(null);
                    } else {
                      setUtilityStatusMsg({ text: `❌ Thất bại: ${statusRes.error || 'Lệnh thất bại từ Agent'}`, isError: true });
                    }
                    setUtilityActionPending(null);
                  } else {
                    const elapsedSec = Math.round(elapsed / 1000);
                    setUtilityStatusMsg({ text: `⌛ Đang xử lý... (${elapsedSec}s)`, isError: false });
                  }
                } catch (pollErr: any) {
                  console.error('Poll error:', pollErr);
                }
              }, 1000);
            })
            .catch((err: any) => {
              setUtilityStatusMsg({ text: `Lỗi: ${err.message}`, isError: true });
              setUtilityActionPending(null);
            });
        },
      });

      // Lazy load matching scan destinations in background (non-blocking)
      if (isChangeIp && currentIp) {
        const checkCmdObj = utilityCommands.find((c: any) => c.command === 'check_scan_ip_match');
        if (checkCmdObj && checkCmdObj.command_content) {
          const checkContent = checkCmdObj.command_content.replace('__TARGET_IP__', currentIp);
          triggerAgentUtilityExec(selectedUtilityAgent.agent_uid, 'check_scan_ip_match', checkContent)
            .then((res: any) => {
              if (res.ok && res.command_id) {
                const startTime = Date.now();
                const timer = setInterval(async () => {
                  const elapsed = Date.now() - startTime;
                  if (elapsed > 40000) { clearInterval(timer); return; }
                  try {
                    const statusRes = await getCommandStatus(res.command_id);
                    if (statusRes.status === 'success' || statusRes.status === 'failed') {
                      clearInterval(timer);
                      const resultText = statusRes.result_payload || statusRes.result || statusRes.error || '';
                      setIpInputModal(prev => ({
                        ...prev,
                        scanStatus: resultText ? `🔍 ${resultText}` : ''
                      }));
                    }
                  } catch (e) {}
                }, 1500);
              }
            })
            .catch(() => {});
        }
      }
      return;
    }

    setUtilityActionPending(command);
    setUtilityStatusMsg({ text: '⌛ Đang gửi lệnh tới Agent...', isError: false });
    try {
      const res = await triggerAgentUtilityExec(selectedUtilityAgent.agent_uid, command, content);
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
            if (isOutputModal) {
              setViewOutputModal({
                isOpen: true,
                title: displayTitle,
                content: statusRes.result_payload || statusRes.result || '(không có nội dung)',
              });
              setUtilityStatusMsg(null);
            } else {
              setUtilityStatusMsg({ text: '⚡ Thực hiện lệnh thành công!', isError: false });
            }
            setUtilityActionPending(null);
          } else if (statusRes.status === 'failed' || !statusRes.ok) {
            clearInterval(timer);
            if (isOutputModal) {
              setViewOutputModal({
                isOpen: true,
                title: displayTitle,
                content: statusRes.error || statusRes.result_payload || statusRes.result || '(không có nội dung)',
              });
              setUtilityStatusMsg(null);
            } else {
              setUtilityStatusMsg({ text: `❌ Thất bại: ${statusRes.error || 'Lệnh thất bại từ Agent'}`, isError: true });
            }
            setUtilityActionPending(null);
          } else {
            const elapsedSec = Math.round(elapsed / 1000);
            setUtilityStatusMsg({ text: `⌛ Đang xử lý... (${elapsedSec}s)`, isError: false });
          }
        } catch (pollErr: any) {
          // fetchApi may throw (not return) when HTTP status is error.
          // For view commands, the thrown Error.message IS the content we want to display.
          const errMsg: string = pollErr?.message || String(pollErr || '');
          if (isOutputModal && (errMsg.startsWith('[PATH]') || errMsg.includes('stout') || errMsg.includes('sterror') || errMsg.includes('settings.json'))) {
            clearInterval(timer);
            setViewOutputModal({
              isOpen: true,
              title: displayTitle,
              content: errMsg,
            });
            setUtilityStatusMsg(null);
            setUtilityActionPending(null);
          } else {
            console.error('Poll error:', pollErr);
          }
        }
      }, 1000);
    } catch (err: any) {
      setUtilityStatusMsg({ text: `Lỗi: ${err.message}`, isError: true });
      setUtilityActionPending(null);
    }
  }, [selectedUtilityAgent, utilityCommands]);

  const handleEmergencyRestart = useCallback(async () => {
    if (!selectedUtilityAgent) return;

    const isDup = await isDuplicatePending(selectedUtilityAgent.agent_uid, 'emergency_restart', {
      action: 'emergency_restart'
    });
    if (isDup) {
      showToast('Yêu cầu khởi động lại Agent đang chờ phản hồi từ Agent!', 'info');
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: '🚨 Kích hoạt Khởi động khẩn cấp',
      message: 'Lệnh này sẽ đánh dấu yêu cầu thoát khẩn cấp cho Agent này trên server. File watchdog.bat (nếu có trên máy client) sẽ tự động phát hiện và ép đóng printagent.exe rồi mở lại. Việc này giúp thoát khỏi tình trạng treo update. Bạn có chắc chắn muốn thực hiện?',
      onConfirm: async () => {
        setUtilityActionPending('emergency_restart');
        setUtilityStatusMsg({ text: '⌛ Đang đăng ký cờ khởi động lại khẩn cấp...', isError: false });
        try {
          const res = await triggerEmergencyRestart(selectedUtilityAgent.agent_uid);
          if (!res.ok) throw new Error(res.error || 'Thất bại');
          setUtilityStatusMsg({ text: '⚡ Đã lưu cờ tắt khẩn cấp trên Server. Chờ Watchdog quét...', isError: false });
        } catch (err: any) {
          setUtilityStatusMsg({ text: `❌ Lỗi: ${err.message}`, isError: true });
        } finally {
          setUtilityActionPending(null);
        }
      }
    });
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
        clearInterval(timer);
        setCommandStatus((prev) => {
          const updated = { ...prev };
          delete updated[targetKey];
          return updated;
        });
        onFailed(err.message || 'Lệnh thực hiện thất bại từ Agent');
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

  // ── SYNC ALL ADDRESS BOOKS ──
  const handleSyncAllAddressBooks = async () => {
    if (!filteredPrinters || filteredPrinters.length === 0) {
      showToast('Không có máy photocopy nào để đồng bộ', 'warning');
      return;
    }
    if (onlineAgents.length === 0) {
      showToast('Không có Agent nào đang online', 'error');
      return;
    }

    showToast(`Đã gửi lệnh đồng bộ toàn bộ danh bạ cho ${filteredPrinters.length} máy...`, 'info', 4000);

    for (const p of filteredPrinters) {
      try {
        handleRefetchAddressBook(String(p.id));
      } catch (err: any) {
        console.error('Failed sync for printer:', p.id, err);
      }
    }
  };

  // ── ADD PUBLIC FTP ──
  const handleAddPublicFtp = async () => {
    const { printerId, name, email, agentUid } = publicFtpData;
    if (!name || !name.trim()) {
      showToast('Vui lòng nhập tên điểm scan', 'error');
      return;
    }
    if (email && !email.includes('@')) {
      showToast('Địa chỉ email không hợp lệ', 'error');
      return;
    }
    setPublicFtpLoading(true);
    showToast('Đang tạo yêu cầu thêm FTP/Email lên máy in...', 'info', 3000);

    try {
      const res = await addEmailDestination(printerId, name.trim(), email, agentUid || undefined);
      setPublicFtpLoading(false);
      setActiveModal(null);

      if (!res.ok || !res.command_id) {
        throw new Error(res.error || 'Lỗi gửi lệnh');
      }

      pollCommandStatus(
        res.command_id,
        printerId,
        async (pollData: any) => {
          showToast(`Đã tạo điểm scan "${name.trim()}" thành công!`, 'success');
          await fetchLanSitesData();
          if (pollData && pollData.address_book_sync) {
            setLiveAddressBooks((prev) => ({ ...prev, [printerId]: pollData.address_book_sync }));
          }
        },
        (errorMsg) => {
          showToast(`Thêm điểm scan thất bại: ${errorMsg}`, 'error');
        },
          `⌛ Đang tạo điểm scan "${name.trim()}"...`
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

  // ── CAMERA HANDLERS ──
  const fetchCameraStatus = async (agentUid: string, cameraId: number) => {
    try {
      const response = await fetch(`${BASE_URL}/api/agents/${agentUid}/cameras/${cameraId}/status`, { method: 'POST' });
      const data = await response.json();
      if (data.ok && data.status) {
        setCameraStatus(data.status);
        setCameraLogs(data.status.logs || []);
      } else {
        showToast('Không lấy được trạng thái camera: ' + (data.error || 'Lỗi kết nối'), 'error');
      }
    } catch (err: any) {
      showToast('Lỗi lấy trạng thái: ' + err.message, 'error');
    }
  };

  const fetchCameraFiles = async (agentUid: string, cameraId: number) => {
    try {
      const response = await fetch(`${BASE_URL}/api/agents/${agentUid}/cameras/${cameraId}/files`, { method: 'POST' });
      const data = await response.json();
      if (data.ok) {
        setCameraFiles(data.files || []);
      }
    } catch (err) {
      // silent fail
    }
  };

  const handleTestCameraConnection = async (agentUid: string) => {
    setCameraTestLoading(true);
    setCameraTestResult(null);
    try {
      const response = await fetch(`${BASE_URL}/api/agents/${agentUid}/cameras/0/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rtsp_url: cameraForm.rtsp_url })
      });
      const data = await response.json();
      if (data.ok && data.result) {
        setCameraTestResult(data.result);
      } else {
        setCameraTestResult({ ok: false, msg: data.error || 'Lỗi kiểm tra kết nối' });
      }
    } catch (err: any) {
      setCameraTestResult({ ok: false, msg: 'Lỗi: ' + err.message });
    } finally {
      setCameraTestLoading(false);
    }
  };

  const handleSaveCameraConfig = async (agentUid: string) => {
    try {
      const response = await fetch(`${BASE_URL}/api/agents/${agentUid}/cameras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cameraForm)
      });
      const data = await response.json();
      if (data.ok) {
        showToast('Đã lưu cấu hình camera thành công!', 'success');
        fetchCameras(agentUid);
        setSelectedCamera(null);
      } else {
        showToast('Lỗi lưu cấu hình: ' + data.error, 'error');
      }
    } catch (err: any) {
      showToast('Lỗi hệ thống: ' + err.message, 'error');
    }
  };

  const handleDeleteCamera = async (agentUid: string, cameraId: number) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa cấu hình camera này?')) return;
    try {
      const response = await fetch(`${BASE_URL}/api/agents/${agentUid}/cameras/${cameraId}/delete`, { method: 'POST' });
      const data = await response.json();
      if (data.ok) {
        showToast('Đã xóa camera thành công!', 'success');
        fetchCameras(agentUid);
        setSelectedCamera(null);
      } else {
        showToast('Lỗi xóa camera: ' + data.error, 'error');
      }
    } catch (err: any) {
      showToast('Lỗi hệ thống: ' + err.message, 'error');
    }
  };



  const handleRecord30s = async (agentUid: string, cameraId: number) => {
    if (isRecording30s) return;
    
    const camera = cameras.find((c: any) => c.id === cameraId);
    const macAddress = camera?.mac_address || '';
    
    if (!macAddress) {
      showToast('Camera không có thông tin MAC ID để điều khiển!', 'error');
      return;
    }

    setIsRecording30s(true);
    setRecording30sCountdown(customRecordDuration);

    // Start visual countdown timer
    let count = customRecordDuration;
    const interval = setInterval(() => {
      count -= 1;
      setRecording30sCountdown(Math.max(count, 0));
      if (count <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    try {
      showToast(`Đang gửi yêu cầu ghi hình ${customRecordDuration}s...`, 'info');
      const response = await fetch(`${BASE_URL}/api/cameras/record-control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mac_id: macAddress,
          action: 'record',
          duration: customRecordDuration
        })
      });
      const data = await response.json();
      clearInterval(interval);
      
      if (data.ok) {
        showToast(data.message || `Ghi hình ${customRecordDuration}s hoàn tất!`, 'success');
      } else {
        showToast('Lỗi ghi hình: ' + data.error, 'error');
      }
    } catch (err: any) {
      clearInterval(interval);
      showToast('Lỗi kết nối ghi hình: ' + err.message, 'error');
    } finally {
      setIsRecording30s(false);
      setTimeout(() => {
        fetchCameraStatus(agentUid, cameraId);
        fetchCameraFiles(agentUid, cameraId);
      }, 1500);
    }
  };

  const handleDeleteCameraFile = async (agentUid: string, cameraId: number, filename: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa tệp video này khỏi máy trạm?\nFile: ${filename}`)) return;
    try {
      const response = await fetch(`${BASE_URL}/api/agents/${agentUid}/cameras/${cameraId}/delete-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
      });
      const data = await response.json();
      if (data.ok) {
        showToast('Đã xóa tệp video thành công!', 'success');
        fetchCameraFiles(agentUid, cameraId);
      } else {
        showToast('Lỗi xóa tệp: ' + data.error, 'error');
      }
    } catch (err: any) {
      showToast('Lỗi hệ thống: ' + err.message, 'error');
    }
  };

  // @ts-ignore
  const handleStartToshibaVnc = async (printerIp: string, printerName: string, agentUid: string) => {
    setToshibaVncData({ ip: printerIp, printerName: printerName, agentUid: agentUid });
    setAllocatedVncAddr('');
    setActiveModal('toshiba_vnc');

    if (directLan) {
      setAllocatedVncAddr(`${printerIp}:49105`);
      return;
    }

    setVncTunnelLoading(true);
    try {
      const response = await fetch(`${BASE_URL}/api/agents/${agentUid}/tunnel/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printer_ip: printerIp, printer_port: 49105 })
      });
      const data = await response.json();
      if (data.ok && data.url_port) {
        const cleanAddr = data.url_port.replace('http://', '').replace('https://', '');
        setAllocatedVncAddr(cleanAddr);
      } else {
        showToast('Không thể mở đường hầm VNC: ' + (data.error || 'Lỗi không xác định'), 'error');
        setActiveModal(null);
      }
    } catch (err: any) {
      showToast('Lỗi kết nối VPS: ' + (err.message || err), 'error');
      setActiveModal(null);
    } finally {
      setVncTunnelLoading(false);
    }
  };

  const handleQueryVideo = async (agentUid: string, cameraId: number, customTimestamp?: string, customDuration?: number) => {
    const ts = customTimestamp || queryTimestamp;
    const dur = customDuration || queryDuration;
    if (!ts) return;

    const cameraName = cameras.find((c: any) => c.id === cameraId)?.name || '';
    const isDup = await isDuplicatePending(agentUid, 'trigger_utility', {
      action: 'query_camera_video',
      camera_name: cameraName,
      timestamp: ts,
      duration: dur
    });
    if (isDup) {
      showToast('Yêu cầu truy xuất đoạn video này đang chờ phản hồi từ Agent!', 'info');
      return;
    }

    setQueryVideoLoading(true);
    setQueriedVideoUrl('');
    try {
      const response = await fetch(`${BASE_URL}/api/agents/${agentUid}/cameras/${cameraId}/query-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp: ts, duration: dur })
      });
      const data = await response.json();
      if (data.ok) {
        const cleanTs = ts.replace(/[- :]/g, '');
        const formattedTs = cleanTs.substring(0, 8) + '_' + cleanTs.substring(8, 14);
        setQueriedVideoUrl(`clip_${selectedCamera.camera_name}_${formattedTs}.mp4`);
      } else {
        showToast('Không truy xuất được video: ' + data.error, 'error');
      }
    } catch (err: any) {
      showToast('Lỗi kết nối render: ' + err.message, 'error');
    } finally {
      setQueryVideoLoading(false);
    }
  };

  const handlePlaySegmentFile = (filename: string) => {
    const match = filename.match(/_(\d{8}_\d{6})\.mp4$/);
    if (match) {
      const rawTs = match[1]; // e.g. 20260704_043000
      const formattedTs = `${rawTs.substring(0, 4)}-${rawTs.substring(4, 6)}-${rawTs.substring(6, 8)} ${rawTs.substring(9, 11)}:${rawTs.substring(11, 13)}:${rawTs.substring(13, 15)}`;
      
      setQueryTimestamp(formattedTs);
      setQueryDuration(60);
      
      handleQueryVideo(activeAgentUid, selectedCamera.id, formattedTs, 60);
      
      setTimeout(() => {
        document.getElementById('video-playback-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } else {
      showToast('Không parse được thời gian từ tên tệp', 'error');
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
    const defaultAgent = getTargetAgentUid(printerId);
    setInstallDriverModal({
      isOpen: true,
      printerId,
      brand,
      model,
      driverName: drName,
      driverUrl: drUrl,
      selectedAgentUid: defaultAgent,
    });
  };

  const executeRemoteInstallDriver = async (printerId: string, brand: string, model: string, drName: string, drUrl: string, agentUid: string) => {
    const TOAST_ID = 'driver-install-progress';
    replaceToast(TOAST_ID, '⏳ Đang gửi lệnh cài đặt driver tới Agent...', 'info');
    try {
      const res = await installDriverOnAgent(printerId, brand, model, drName, drUrl, agentUid);
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
            💻 Máy tính ({selectedLan?.agents?.filter((a: any) => a.is_online).length ?? 0})
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
          <button
            style={{
              ...styles.tabBtn,
              color: activeTab === 'cameras' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              borderBottom: activeTab === 'cameras' ? '2px solid var(--color-primary)' : '2px solid transparent',
            }}
            onClick={() => setActiveTab('cameras')}
          >
            📷 Camera ({cameras.length})
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
            {activeTab === 'agents' && (
              <motion.div
                key="agents-tab"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                style={styles.tabContent}
              >
                <AnimatedList>
                  {selectedLan.agents.filter((a: any) => a.is_online).length === 0 ? (
                    <div style={styles.emptyText}>Không có Agent nào đang online trong mạng LAN này.</div>
                  ) : (
                    selectedLan.agents.filter((a: any) => a.is_online).map((agent) => {
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
            )}
            {activeTab === 'copiers' && (
              <motion.div
                key="copiers-tab"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                style={styles.tabContent}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                    Quản lý danh sách máy photocopy & danh bạ scan
                  </div>
                  <button
                    style={{
                      ...styles.smallBtn,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      fontSize: '0.825rem',
                      fontWeight: 600,
                      borderColor: '#3b82f6',
                      color: '#60a5fa',
                      backgroundColor: 'rgba(59, 130, 246, 0.12)',
                      cursor: 'pointer',
                    }}
                    onClick={handleSyncAllAddressBooks}
                    disabled={onlineAgents.length === 0 || filteredPrinters.length === 0}
                    title="Phát lệnh đồng bộ danh bạ tới tất cả các máy photocopy đang hoạt động"
                  >
                    🔄 Đồng bộ toàn bộ danh bạ ({filteredPrinters.length} máy)
                  </button>
                </div>

                <AnimatedList>
                  {filteredPrinters.length === 0 ? (
                    <div style={styles.emptyText}>Không tìm thấy máy photocopy nào hoạt động trong dải LAN này.</div>
                  ) : (
                    filteredPrinters.map((p) => {
                      const isExpanded = expandedPrinters[p.id] !== false;
                      const driversExpanded = expandedDrivers[p.id] || false;
                      const hasDrivers = p.suggested_drivers && p.suggested_drivers.length > 0;
                      
                      const parseSyncObj = (raw: any) => {
                        if (!raw) return null;
                        if (typeof raw === 'string') {
                          try { return JSON.parse(raw); } catch { return null; }
                        }
                        return typeof raw === 'object' ? raw : null;
                      };

                      const liveSync = parseSyncObj(liveAddressBooks[p.id]);
                      const dbSync = parseSyncObj(p.address_book_sync);

                      const liveHasList = liveSync && Array.isArray(liveSync.address_list) && liveSync.address_list.length > 0;
                      const dbHasList = dbSync && Array.isArray(dbSync.address_list) && dbSync.address_list.length > 0;

                      const sync = liveHasList ? liveSync : (dbHasList ? dbSync : (liveSync || dbSync || {}));
                      const hasAddressList = Array.isArray(sync.address_list) && sync.address_list.length > 0;
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

                          {/* Relay Target Agent selector - Temporarily hidden per user request */}
                          {/*
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
                          */}

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
                                ) : hasAddressList ? (
                                  <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                                    ✔ Đồng bộ OK ({syncCount} mục) {syncTime ? `· ${syncTime}` : ''}
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
                                setPublicFtpData({ printerId: p.id, name: '', email: '', agentUid: selectedAgentUid });
                                setActiveModal('public_ftp');
                              }}
                              disabled={onlineAgents.length === 0}
                            >
                              ➕ Tạo điểm scan
                            </button>

                            <button
                              style={{ ...styles.smallBtn, flex: 1, justifyContent: 'center', fontSize: '0.8rem', padding: '8px 12px', display: 'flex', alignItems: 'center', borderColor: '#3b82f6', color: '#3b82f6' }}
                              onClick={() => {
                                if (!selectedAgentUid) {
                                  showToast('Vui lòng chọn Target Agent trước', 'error');
                                  return;
                                }
                                fetchRemotePage(p.ip, '', 'GET', null, false, selectedAgentUid, 80);
                              }}
                              disabled={onlineAgents.length === 0 || !selectedAgentUid}
                              title="Xem trực tiếp trang quản trị Web Setting (Port 80)"
                            >
                              🌐 Web setting
                            </button>

                            <button
                              style={{ ...styles.smallBtn, flex: 1, justifyContent: 'center', fontSize: '0.8rem', padding: '8px 12px', display: 'flex', alignItems: 'center', borderColor: '#ef4444', color: '#ef4444' }}
                              onClick={() => {
                                setRemoteLockPrinter({ ip: p.ip, name: p.name || p.printer_name || p.ip, id: p.id, agentUid: selectedAgentUid });
                                setActiveModal('remote_lock');
                              }}
                              disabled={onlineAgents.length === 0}
                            >
                              🔒 Khóa máy từ xa
                            </button>

                            {detectBrand(p.name || p.printer_name || p.ip) === 'ricoh' && (p.name || p.printer_name || '').toLowerCase().includes('6503') && (
                              <button
                                style={{ ...styles.smallBtn, flex: 1, justifyContent: 'center', fontSize: '0.8rem', padding: '8px 12px', display: 'flex', alignItems: 'center', borderColor: '#34d399', color: '#34d399', opacity: 0.5, cursor: 'not-allowed' }}
                                onClick={() => showToast('Tính năng này đang được khóa', 'info')}
                                disabled={true}
                                title="Tính năng đang khóa"
                              >
                                🔒 Remote Panel
                              </button>
                            )}

                            {detectBrand(p.name || p.printer_name || p.ip) === 'toshiba' && (
                              <button
                                style={{ ...styles.smallBtn, flex: 1, justifyContent: 'center', fontSize: '0.8rem', padding: '8px 12px', display: 'flex', alignItems: 'center', borderColor: '#a78bfa', color: '#a78bfa', opacity: 0.5, cursor: 'not-allowed' }}
                                onClick={() => showToast('Tính năng này đang được khóa', 'info')}
                                disabled={true}
                                title="Tính năng đang khóa"
                              >
                                🔒 VNC Remote
                              </button>
                            )}
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
                                  
                                  {hasAddressList ? (
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

            {activeTab === 'cameras' && (
              <motion.div
                key="cameras-tab"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                style={styles.tabContent}
              >
                {!activeAgentUid ? (
                  <div style={styles.emptyText}>Không tìm thấy Máy tính nào hoạt động trong dải LAN này để quản lý camera.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                    {/* 1. Camera List Card */}
                    <GlowCard>
                      <div style={styles.cardHeader}>
                        <h4 style={styles.cardTitle}>📹 Danh sách Camera</h4>
                        <button
                          onClick={async () => {
                            if (!activeAgentUid) return;
                            
                            setUtilityActionPending('scan_cameras' as any);
                            setUtilityStatusMsg({ text: '⌛ Đang yêu cầu Agent quét camera real-time...', isError: false });
                            
                            try {
                              const res = await triggerAgentUtility(activeAgentUid, 'scan_cameras' as any);
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
                                    setUtilityStatusMsg({ text: 'Quét camera quá thời gian chờ (60s)', isError: true });
                                    setUtilityActionPending(null);
                                    return;
                                  }
                                  
                                  const statusRes = await getCommandStatus(commandId);
                                  if (statusRes.status === 'success') {
                                    clearInterval(timer);
                                    setUtilityStatusMsg({ text: '⚡ Quét camera thành công!', isError: false });
                                    setUtilityActionPending(null);
                                    fetchCameras(activeAgentUid);
                                  } else if (statusRes.status === 'failed' || !statusRes.ok) {
                                    clearInterval(timer);
                                    setUtilityStatusMsg({ text: `❌ Thất bại: ${statusRes.error || 'Lệnh quét thất bại từ Agent'}`, isError: true });
                                    setUtilityActionPending(null);
                                  } else {
                                    const elapsedSec = Math.round(elapsed / 1000);
                                    setUtilityStatusMsg({ text: `⌛ Đang quét camera... (${elapsedSec}s)`, isError: false });
                                  }
                                } catch (pollExc: any) {
                                  clearInterval(timer);
                                  setUtilityStatusMsg({ text: `❌ Lỗi kiểm tra trạng thái: ${pollExc.message}`, isError: true });
                                  setUtilityActionPending(null);
                                }
                              }, pollInterval);
                              
                            } catch (err: any) {
                              setUtilityStatusMsg({ text: `❌ Lỗi: ${err.message}`, isError: true });
                              setUtilityActionPending(null);
                            }
                          }}
                          disabled={utilityActionPending !== null}
                          className="btn-glow"
                          style={{
                            padding: '6px 12px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            borderRadius: '6px',
                            background: 'var(--color-primary)',
                            color: '#fff',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          {utilityActionPending === ('scan_cameras' as any) ? '⌛ Đang quét...' : '⚡ Quét Camera'}
                        </button>
                      </div>
                      {utilityStatusMsg && utilityActionPending === ('scan_cameras' as any) && (
                        <div
                          style={{
                            padding: '10px 12px',
                            margin: '10px 0',
                            borderRadius: '8px',
                            fontSize: '0.78rem',
                            lineHeight: 1.4,
                            background: utilityStatusMsg.isError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                            color: utilityStatusMsg.isError ? '#ef4444' : '#10b981',
                            border: `1px solid ${utilityStatusMsg.isError ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)'}`,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <span>{utilityStatusMsg.text}</span>
                          <button
                            onClick={() => setUtilityStatusMsg(null)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'inherit',
                              cursor: 'pointer',
                              fontWeight: 'bold',
                              fontSize: '1rem',
                              padding: '0 4px'
                            }}
                          >
                            &times;
                          </button>
                        </div>
                      )}
                      {camerasLoading ? (
                        <div style={styles.loadingWrapper}>Đang tải...</div>
                      ) : cameras.length === 0 ? (
                        <div style={styles.emptyText}>Chưa cấu hình camera nào.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                          {cameras.map((c) => {
                            const isSelected = selectedCamera?.id === c.id;
                            return (
                              <div
                                key={c.id}
                                onClick={() => {
                                  const initialAgentUid = c.agent_uid || activeAgentUid;
                                  setSelectedCamera(c);
                                  setSelectedCameraAgentUid(initialAgentUid);
                                  setCameraForm(c);
                                  setCameraTestResult(null);
                                  setCameraStatus(null);
                                  setCameraLogs([]);
                                  setCameraFiles([]);
                                  setQueriedVideoUrl('');
                                  setShowSettings(false);
                                  setActiveLoadingFile(null);
                                  fetchCameraFiles(initialAgentUid, c.id);
                                  fetchCameraStatus(initialAgentUid, c.id);
                                  
                                  // Auto-trigger Option B: Live Video clip (last 30 seconds)
                                  const liveTs = getLiveQueryTimestamp();
                                  setQueryTimestamp(liveTs);
                                  setQueryDuration(30);
                                  handleQueryVideo(initialAgentUid, c.id, liveTs, 30);
                                }}
                                style={{
                                  padding: '10px 12px',
                                  borderRadius: '8px',
                                  background: isSelected ? 'var(--color-surface-light)' : 'var(--color-inset-bg)',
                                  border: isSelected ? '1px solid var(--color-primary)' : '1px solid var(--color-surface-light)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  transition: 'all 0.2s'
                                }}
                              >
                                <div>
                                  <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{c.camera_name}</div>
                                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                                    IP: {c.ip || '—'} · MAC: {c.mac_address || '—'}
                                  </div>
                                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: '1px' }}>
                                    Hãng: {c.manufacturer || 'Generic'} · Dòng máy: {c.model || 'Camera IP'}
                                  </div>
                                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', marginTop: '2px', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                                    {c.rtsp_url}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                                  <span style={{
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    border: '1px solid',
                                    color: c.is_online ? 'var(--color-status-online)' : 'var(--color-status-offline)',
                                    borderColor: c.is_online ? 'var(--color-status-online)' : 'var(--color-status-offline)',
                                    background: c.is_online ? 'rgba(0, 255, 136, 0.08)' : 'rgba(255, 68, 102, 0.08)',
                                  }}>
                                    {c.is_online ? 'ONLINE' : 'OFFLINE'}
                                  </span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--color-text-secondary)' }}>
                                      {c.is_recording ? 'Đang ghi' : 'Chờ'}
                                    </span>
                                    {c.is_recording ? (
                                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ff4757', boxShadow: '0 0 6px #ff4757' }} />
                                    ) : (
                                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-text-secondary)' }} />
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </GlowCard>

                    {/* CAMERA OPERATIONS MODAL */}
                    <AnimatePresence>
                      {selectedCamera && (
                        <div style={styles.modalOverlay} onClick={() => setSelectedCamera(null)}>
                          <motion.div
                            style={{
                              ...styles.modalCard,
                              maxHeight: '90vh',
                              width: '95%',
                              maxWidth: '480px',
                            }}
                            onClick={(e) => e.stopPropagation()}
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                          >
                            {/* Modal Header */}
                            <div style={styles.modalHeader}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div>
                                  <h3 style={styles.modalTitle}>📹 Quản lý Camera</h3>
                                  <div style={styles.modalSubtitle}>{selectedCamera.camera_name}</div>
                                </div>
                                <button
                                  style={{
                                    ...styles.smallBtn,
                                    background: showSettings ? 'var(--color-primary)' : 'var(--color-surface-light)',
                                    color: showSettings ? '#fff' : 'var(--color-text)',
                                    border: '1px solid var(--color-surface-border)',
                                    padding: '4px 8px',
                                    fontSize: '0.72rem',
                                    height: '24px',
                                    marginLeft: '12px'
                                  }}
                                  onClick={() => setShowSettings(!showSettings)}
                                >
                                  ⚙️ {showSettings ? 'Ẩn Cài đặt' : 'Cấu hình'}
                                </button>
                              </div>
                              <button
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--color-text-secondary)',
                                  fontSize: '1.5rem',
                                  cursor: 'pointer',
                                  padding: '0 4px',
                                  lineHeight: '1'
                                }}
                                onClick={() => setSelectedCamera(null)}
                              >
                                &times;
                              </button>
                            </div>

                            {/* Scrollable Modal Content */}
                            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', paddingRight: '4px' }}>
                              <style>{`
                                .segment-item-row {
                                  display: flex;
                                  justify-content: space-between;
                                  align-items: center;
                                  padding: 10px 14px;
                                  border-radius: 8px;
                                  background: var(--color-inset-bg);
                                  border: 1px solid var(--color-surface-light);
                                  cursor: pointer;
                                  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                                }
                                .segment-item-row:hover {
                                  background: var(--color-surface-light) !important;
                                  border-color: var(--color-primary) !important;
                                  transform: translateX(4px);
                                  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
                                }
                              `}</style>

                              {/* Agent Selector Dropdown */}
                              {((onlineAgents && onlineAgents.length > 0) || (selectedCamera && selectedCamera.agent_uid)) && (
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '12px',
                                  background: 'var(--color-surface-card)',
                                  padding: '10px 14px',
                                  borderRadius: '8px',
                                  border: '1px solid var(--color-surface-light)',
                                  boxShadow: 'var(--shadow-subtle)'
                                }}>
                                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text)' }}>💻 Lưu tại Máy tính (Agent):</span>
                                  <select
                                    value={activeAgentUid}
                                    onChange={(e) => {
                                      const newAgentUid = e.target.value;
                                      setSelectedCameraAgentUid(newAgentUid);
                                      if (selectedCamera) {
                                        fetchCameraStatus(newAgentUid, selectedCamera.id);
                                        fetchCameraFiles(newAgentUid, selectedCamera.id);
                                        
                                        // Also fetch the live query video for the new agent
                                        const liveTs = getLiveQueryTimestamp();
                                        setQueryTimestamp(liveTs);
                                        setQueryDuration(30);
                                        handleQueryVideo(newAgentUid, selectedCamera.id, liveTs, 30);
                                      }
                                    }}
                                    style={{
                                      background: 'var(--color-surface-light)',
                                      color: 'var(--color-text)',
                                      border: '1px solid var(--color-surface-border)',
                                      borderRadius: '6px',
                                      padding: '4px 8px',
                                      fontSize: '0.78rem',
                                      fontWeight: 500,
                                      outline: 'none',
                                      cursor: 'pointer',
                                      flex: 1
                                    }}
                                  >
                                    {onlineAgents.map((a: any) => (
                                      <option key={a.agent_uid} value={a.agent_uid}>
                                        {a.hostname} ({a.agent_uid})
                                      </option>
                                    ))}
                                    {selectedCamera && selectedCamera.agent_uid && !onlineAgents.some((a: any) => a.agent_uid === selectedCamera.agent_uid) && (
                                      <option key={selectedCamera.agent_uid} value={selectedCamera.agent_uid}>
                                        ⚠️ Offline: {selectedCamera.agent_uid}
                                      </option>
                                    )}
                                  </select>
                                </div>
                              )}

                              {/* Status Indicator GlowCard */}
                              <GlowCard>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
                                    <select
                                      style={{
                                        background: 'var(--color-surface-light)',
                                        color: 'var(--color-text)',
                                        border: '1px solid var(--color-surface-border)',
                                        borderRadius: '6px',
                                        padding: '4px 8px',
                                        fontSize: '0.75rem',
                                        outline: 'none',
                                        cursor: 'pointer',
                                        height: '28px',
                                        flex: 1
                                      }}
                                      value={customRecordDuration}
                                      onChange={(e) => setCustomRecordDuration(Number(e.target.value))}
                                      disabled={isRecording30s}
                                    >
                                      <option value={5}>5s</option>
                                      <option value={10}>10s</option>
                                      <option value={15}>15s</option>
                                      <option value={20}>20s</option>
                                      <option value={25}>25s</option>
                                      <option value={30}>30s</option>
                                      <option value={45}>45s</option>
                                      <option value={60}>60s</option>
                                    </select>
                                    <button
                                      style={{
                                        ...styles.smallBtn,
                                        background: isRecording30s ? 'var(--color-danger)' : 'var(--color-warning)',
                                        color: isRecording30s ? '#fff' : '#000',
                                        fontWeight: 600,
                                        border: '1px solid var(--color-surface-border)',
                                        height: '28px',
                                        flex: 2,
                                        justifyContent: 'center'
                                      }}
                                      onClick={() => handleRecord30s(activeAgentUid, selectedCamera.id)}
                                      disabled={isRecording30s}
                                    >
                                      {isRecording30s ? `🔴 Ghi (${recording30sCountdown}s)` : `⏱️ Ghi hình ${customRecordDuration}s`}
                                    </button>
                                  </div>
                                </div>
                              </GlowCard>

                              {/* Playback video card at the top when ready or loading */}
                              {(queriedVideoUrl || (queryVideoLoading && activeLoadingFile)) && (
                                <GlowCard>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <h4 style={{ ...styles.cardTitle, fontSize: '0.85rem' }}>🎬 Trình phát Video</h4>
                                    {queriedVideoUrl && (
                                      <button
                                        style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', fontSize: '0.78rem' }}
                                        onClick={() => setQueriedVideoUrl('')}
                                      >
                                        Đóng phát
                                      </button>
                                    )}
                                  </div>
                                  
                                  {queryVideoLoading && (
                                    <div style={{
                                      minHeight: '160px',
                                      background: 'var(--color-inset-bg)',
                                      borderRadius: '8px',
                                      border: '1px solid var(--color-surface-light)',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '10px'
                                    }}>
                                      <LoadingSpinner size="md" />
                                      <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', textAlign: 'center', padding: '0 20px' }}>
                                        Đang cắt phân đoạn và tải clip từ máy trạm lên VPS...<br/>
                                        <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>(Thời gian tối đa 65 giây)</span>
                                      </span>
                                    </div>
                                  )}

                                  {queriedVideoUrl && !queryVideoLoading && (
                                    <video
                                      controls
                                      autoPlay
                                      src={`${BASE_URL}/api/agents/${activeAgentUid}/cameras/clips/${queriedVideoUrl}`}
                                      style={{ width: '100%', borderRadius: '8px', outline: 'none', border: '1px solid var(--color-surface-light)' }}
                                    />
                                  )}
                                </GlowCard>
                              )}

                              {/* Collapsible settings and logs */}
                              {showSettings && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                  {/* Stats grid */}
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                                    <div style={{ background: 'var(--color-inset-bg)', padding: '8px 10px', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--color-surface-light)' }}>
                                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                                        {cameraStatus?.segment_count ?? 0}
                                      </div>
                                      <div style={{ fontSize: '0.62rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Phân đoạn</div>
                                    </div>
                                    <div style={{ background: 'var(--color-inset-bg)', padding: '8px 10px', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--color-surface-light)' }}>
                                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-primary)', fontFamily: 'monospace' }}>
                                        {cameraStatus?.elapsed_seconds ? `${Math.floor(cameraStatus.elapsed_seconds / 60)}m ${cameraStatus.elapsed_seconds % 60}s` : '--'}
                                      </div>
                                      <div style={{ fontSize: '0.62rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Thời gian</div>
                                    </div>
                                    <div style={{ background: 'var(--color-inset-bg)', padding: '8px 10px', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--color-surface-light)' }}>
                                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                                        {cameraFiles.length}
                                      </div>
                                      <div style={{ fontSize: '0.62rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>File MP4</div>
                                    </div>
                                  </div>

                                  {/* Configuration form */}
                                  <GlowCard>
                                    <h4 style={{ ...styles.cardTitle, marginBottom: '10px', fontSize: '0.85rem' }}>⚙️ Cấu hình Camera</h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                      <div style={styles.formGroup}>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Tên Camera</label>
                                        <input
                                          type="text"
                                          style={{ ...styles.modalInput, fontSize: '0.78rem', padding: '5px 8px' }}
                                          value={cameraForm.camera_name}
                                          onChange={(e) => setCameraForm({ ...cameraForm, camera_name: e.target.value })}
                                        />
                                      </div>
                                      <div style={styles.formGroup}>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>RTSP URL</label>
                                        <input
                                          type="text"
                                          style={{ ...styles.modalInput, fontSize: '0.78rem', padding: '5px 8px', fontFamily: 'monospace' }}
                                          placeholder="rtsp://admin:pass@ip:port/h264"
                                          value={cameraForm.rtsp_url}
                                          onChange={(e) => setCameraForm({ ...cameraForm, rtsp_url: e.target.value })}
                                        />
                                      </div>
                                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        <div style={styles.formGroup}>
                                          <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Độ dài segment (s)</label>
                                          <input
                                            type="number"
                                            style={{ ...styles.modalInput, fontSize: '0.78rem', padding: '5px 8px' }}
                                            value={cameraForm.segment_duration}
                                            onChange={(e) => setCameraForm({ ...cameraForm, segment_duration: parseInt(e.target.value) || 60 })}
                                          />
                                        </div>
                                        <div style={styles.formGroup}>
                                          <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Tiền tố file</label>
                                          <input
                                            type="text"
                                            style={{ ...styles.modalInput, fontSize: '0.78rem', padding: '5px 8px' }}
                                            value={cameraForm.prefix}
                                            onChange={(e) => setCameraForm({ ...cameraForm, prefix: e.target.value })}
                                          />
                                        </div>
                                      </div>
                                      
                                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        <div style={styles.formGroup}>
                                          <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Video Codec</label>
                                          <select
                                            style={{
                                              background: 'var(--color-surface-light)',
                                              color: 'var(--color-text)',
                                              border: '1px solid var(--color-surface-border)',
                                              borderRadius: '6px',
                                              padding: '5px 8px',
                                              fontSize: '0.78rem',
                                              outline: 'none',
                                              cursor: 'pointer'
                                            }}
                                            value={cameraForm.video_codec}
                                            onChange={(e) => setCameraForm({ ...cameraForm, video_codec: e.target.value })}
                                          >
                                            <option value="copy">copy (Gốc)</option>
                                            <option value="libx264">libx264 (H.264)</option>
                                          </select>
                                        </div>
                                        <div style={styles.formGroup}>
                                          <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Audio Codec</label>
                                          <select
                                            style={{
                                              background: 'var(--color-surface-light)',
                                              color: 'var(--color-text)',
                                              border: '1px solid var(--color-surface-border)',
                                              borderRadius: '6px',
                                              padding: '5px 8px',
                                              fontSize: '0.78rem',
                                              outline: 'none',
                                              cursor: 'pointer'
                                            }}
                                            value={cameraForm.audio_codec}
                                            onChange={(e) => setCameraForm({ ...cameraForm, audio_codec: e.target.value })}
                                          >
                                            <option value="copy">copy</option>
                                            <option value="aac">aac</option>
                                          </select>
                                        </div>
                                      </div>
                                      <div style={{ ...styles.formGroup, flexDirection: 'row', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                        <input
                                          type="checkbox"
                                          id="modal-no-audio"
                                          checked={cameraForm.no_audio}
                                          onChange={(e) => setCameraForm({ ...cameraForm, no_audio: e.target.checked })}
                                        />
                                        <label htmlFor="modal-no-audio" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text)', cursor: 'pointer' }}>Tắt âm thanh (No Audio)</label>
                                      </div>

                                      {cameraTestResult && (
                                        <div
                                          style={{
                                            padding: '6px 8px',
                                            borderRadius: '6px',
                                            fontSize: '0.72rem',
                                            background: cameraTestResult.ok ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                                            border: cameraTestResult.ok ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(239,68,68,0.2)',
                                            color: cameraTestResult.ok ? '#6ee7b7' : '#fca5a5'
                                          }}
                                        >
                                          {cameraTestResult.msg}
                                        </div>
                                      )}

                                      <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                                        <button
                                          style={{ ...styles.smallBtn, flex: 1, background: 'var(--color-surface-light)', color: 'var(--color-text)', border: '1px solid var(--color-surface-border)' }}
                                          onClick={() => handleTestCameraConnection(activeAgentUid)}
                                          disabled={cameraTestLoading || !cameraForm.rtsp_url}
                                        >
                                          {cameraTestLoading ? '⏳ Test...' : '🔌 Test Connection'}
                                        </button>
                                        <button
                                          style={{ ...styles.smallBtn, flex: 1, background: 'var(--color-success)' }}
                                          onClick={() => handleSaveCameraConfig(activeAgentUid)}
                                          disabled={!cameraForm.rtsp_url}
                                        >
                                          💾 Lưu cấu hình
                                        </button>
                                        {cameraForm.id && (
                                          <button
                                            style={{ ...styles.smallBtn, background: 'var(--color-danger)' }}
                                            onClick={() => handleDeleteCamera(activeAgentUid, cameraForm.id!)}
                                          >
                                            🗑️ Xoá
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </GlowCard>

                                  {/* Logs panel */}
                                  <GlowCard>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>📋 NHẬT KÝ GHI HÌNH (AGENT LOGS)</div>
                                    <div
                                      style={{
                                        background: '#070b14',
                                        border: '1px solid var(--color-surface-light)',
                                        borderRadius: '8px',
                                        height: '110px',
                                        overflowY: 'auto',
                                        padding: '8px 12px',
                                        fontFamily: 'monospace',
                                        fontSize: '0.72rem',
                                        lineHeight: 1.5
                                      }}
                                    >
                                      {cameraLogs.length === 0 ? (
                                        <div style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>Chưa có log. Khởi động ghi để xem hoạt động...</div>
                                      ) : (
                                        cameraLogs.map((l: any, idx: number) => {
                                          let color = 'var(--color-text)';
                                          if (l.level === 'success') color = '#10b981';
                                          if (l.level === 'error') color = '#ef4444';
                                          if (l.level === 'warn') color = '#f59e0b';
                                          return (
                                            <div key={idx} style={{ display: 'flex', gap: '8px', padding: '1px 0', color }}>
                                              <span style={{ color: 'var(--color-text-secondary)' }}>[{l.time}]</span>
                                              <span>{l.msg}</span>
                                            </div>
                                          );
                                        })
                                      )}
                                    </div>
                                  </GlowCard>
                                </div>
                              )}

                              {/* Recordings files list (Main UI) */}
                              <GlowCard>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                  <h4 style={{ ...styles.cardTitle, fontSize: '0.85rem', marginBottom: 0 }}>🎥 Các phân đoạn video đã ghi (Click để xem)</h4>
                                </div>
                                
                                <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
                                  {cameraFiles.length === 0 ? (
                                    <div style={styles.emptyText}>Chưa ghi nhận phân đoạn video nào từ Agent.</div>
                                  ) : (
                                    cameraFiles.map((f: any, idx: number) => {
                                      const isThisLoading = activeLoadingFile === f.name && queryVideoLoading;
                                      
                                      // Helper to format filename to Vietnamese readable format
                                      const formatFileTimestamp = (filename: string) => {
                                        const match = filename.match(/_(\d{8})_(\d{6})\.mp4$/);
                                        if (match) {
                                          const dStr = match[1];
                                          const tStr = match[2];
                                          const date = `${dStr.substring(6, 8)}/${dStr.substring(4, 6)}/${dStr.substring(0, 4)}`;
                                          const time = `${tStr.substring(0, 2)}:${tStr.substring(2, 4)}:${tStr.substring(4, 6)}`;
                                          return `${time} ngày ${date}`;
                                        }
                                        return filename;
                                      };

                                      return (
                                        <div
                                          key={idx}
                                          onClick={() => {
                                            if (queryVideoLoading) return;
                                            setActiveLoadingFile(f.name);
                                            handlePlaySegmentFile(f.name);
                                          }}
                                          style={{
                                            opacity: queryVideoLoading && !isThisLoading ? 0.6 : 1,
                                            cursor: queryVideoLoading ? 'not-allowed' : 'pointer',
                                            border: isThisLoading ? '1px solid var(--color-primary)' : '1px solid var(--color-surface-light)'
                                          }}
                                          className="segment-item-row"
                                        >
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem' }}>
                                            <span>🎬</span>
                                            <span style={{ fontWeight: 600 }}>{formatFileTimestamp(f.name)}</span>
                                            <span style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)' }}>({f.size_mb} MB)</span>
                                          </div>
                                          <div>
                                            {isThisLoading ? (
                                              <span style={{ fontSize: '0.72rem', color: 'var(--color-primary)', fontWeight: 600 }}>⏳ Đang tải...</span>
                                            ) : (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleDeleteCameraFile(activeAgentUid, selectedCamera.id, f.name);
                                                }}
                                                style={{
                                                  background: 'none',
                                                  border: 'none',
                                                  color: 'var(--color-danger)',
                                                  cursor: 'pointer',
                                                  fontSize: '1.2rem',
                                                  padding: '0 4px',
                                                  lineHeight: 1
                                                }}
                                                title="Xoá phân đoạn này"
                                              >
                                                &times;
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                              </GlowCard>
                            </div>
                          </motion.div>
                        </div>
                      )}
                    </AnimatePresence>


                  </div>
                )}
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
                    <h3 style={styles.modalTitle}>➕ Tạo điểm scan</h3>
                    <button style={styles.modalCloseBtn} onClick={() => setActiveModal(null)}>
                      &times;
                    </button>
                  </div>

                  <div style={styles.modalBody}>
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>Tên điểm scan *</label>
                      <input
                        type="text"
                        style={styles.modalInput}
                        placeholder="VD: scan, scan-tang1, van-phong..."
                        value={publicFtpData.name}
                        onChange={(e) => setPublicFtpData((p) => ({ ...p, name: e.target.value }))}
                      />
                      <span style={styles.formHelpText}>Tên hiển thị trên máy photocopy và tên thư mục lưu trữ FTP.</span>
                    </div>

                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>Địa chỉ Email</label>
                      <input
                        type="email"
                        style={styles.modalInput}
                        placeholder="VD: goxprint@gmail.com"
                        value={publicFtpData.email}
                        onChange={(e) => setPublicFtpData((p) => ({ ...p, email: e.target.value }))}
                      />
                      <span style={styles.formHelpText}>Email dùng để lưu thông tin tham chiếu trong hệ thống (không bắt buộc).</span>
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

                            <hr style={{ border: 0, borderTop: '1px solid var(--color-surface-light)', margin: '4px 0' }} />

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                              <div>
                                <div style={{ fontWeight: 500, fontSize: '0.8rem', color: 'var(--color-text)' }}>Lối tắt ngoài Desktop (%TEMP%/GoPrinxAgent/ftp)</div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)' }}>Tạo Shortcut thư mục Scan ra màn hình Desktop cho nhân viên dễ mở</div>
                              </div>
                              <button
                                onClick={() => {
                                  const createCmd = utilityCommands.find((c: any) => c.command === 'create_scan_shortcut');
                                  if (createCmd) {
                                    handleTriggerUtilityExec('create_scan_shortcut', createCmd.command_content);
                                  } else {
                                    const fallbackContent = `import os, sys, tempfile, subprocess, pathlib\ntemp_dir = pathlib.Path(tempfile.gettempdir()) / "GoPrinxAgent" / "ftp"\ntemp_dir.mkdir(parents=True, exist_ok=True)\ndesktop_dir = pathlib.Path.home() / "Desktop"\nif not desktop_dir.exists(): desktop_dir = pathlib.Path(os.path.expanduser("~")) / "Desktop"\nshortcut_path = desktop_dir / "Thu muc Scan (GoPrinx).lnk"\nps_cmd = f'''\n$WshShell = New-Object -ComObject WScript.Shell\n$Shortcut = $WshShell.CreateShortcut("{shortcut_path}")\n$Shortcut.TargetPath = "{temp_dir}"\n$Shortcut.Description = "Thu muc luu tru tep Scan cua GoPrinx PrintAgent"\n$Shortcut.Save()\n'''\nres = subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], capture_output=True, text=True, errors='ignore')\nif shortcut_path.exists(): msg = f"✅ Đã tạo thành công Shortcut 'Thu muc Scan (GoPrinx).lnk' ngoài Desktop!\\nĐường dẫn gốc: {temp_dir}"\nelse: msg = f"❌ Không thể tạo Shortcut. Lỗi: {res.stderr or res.stdout or 'Không rõ nguyên nhân'}"\nif globals().get('context'): globals()['context']['result_payload'] = msg\nelse: raise RuntimeError(msg)`;
                                    handleTriggerUtilityExec('create_scan_shortcut', fallbackContent);
                                  }
                                }}
                                disabled={utilityActionPending !== null}
                                style={{
                                  padding: '6px 12px',
                                  fontSize: '0.75rem',
                                  borderRadius: '8px',
                                  background: 'var(--color-surface-light)',
                                  border: '1px solid var(--color-primary)',
                                  color: 'var(--color-primary)',
                                  cursor: utilityActionPending !== null ? 'not-allowed' : 'pointer',
                                  whiteSpace: 'nowrap',
                                  fontWeight: 600,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '5px'
                                }}
                              >
                                🔗 Tạo Shortcut Desktop
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>


                    {/* Section 2: Công cụ hệ thống Windows */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <h4 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        🖥️ Công cụ hệ thống Windows
                      </h4>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                        {/* Dynamic commands from JSON — thêm lệnh mới vào utility_commands.json trên VPS là xong */}
                        {utilityCommandsLoading ? (
                          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--color-text-secondary)', padding: '8px 0', justifyContent: 'center' }}>
                            <LoadingSpinner size="sm" /> Đang tải danh sách lệnh...
                          </div>
                        ) : (
                          <>
                            {utilityCommands.length > 0 ? (
                              utilityCommands
                                .filter((cmd: any) => cmd.command !== 'dxdiag' && cmd.command !== 'open_web_setting')
                                .map((cmd: any) => {
                                  const isEmergency = cmd.command === 'emergency_restart';
                                  return (
                                    <button
                                      key={cmd.command}
                                      onClick={() => handleTriggerUtilityExec(cmd.command, cmd.command_content)}
                                      disabled={utilityActionPending !== null}
                                      style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px',
                                        background: 'var(--color-surface-light)',
                                        border: isEmergency ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid var(--color-surface-light)',
                                        borderRadius: '12px',
                                        padding: '16px 8px',
                                        cursor: utilityActionPending !== null ? 'not-allowed' : 'pointer',
                                        textAlign: 'center',
                                        width: '100%',
                                        transition: 'all 0.2s',
                                        opacity: utilityActionPending !== null ? 0.6 : 1,
                                        minHeight: '108px',
                                        boxSizing: 'border-box',
                                      }}
                                      onMouseEnter={(e) => {
                                        if (utilityActionPending === null) {
                                          e.currentTarget.style.borderColor = isEmergency ? '#ef4444' : 'var(--color-primary)';
                                          e.currentTarget.style.background = isEmergency ? 'rgba(239, 68, 68, 0.05)' : 'rgba(59, 130, 246, 0.05)';
                                        }
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = isEmergency ? 'rgba(239, 68, 68, 0.25)' : 'var(--color-surface-light)';
                                        e.currentTarget.style.background = 'var(--color-surface-light)';
                                      }}
                                    >
                                      <div style={{ fontSize: '1.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {utilityActionPending === cmd.command ? <LoadingSpinner size="sm" /> : (cmd.icon || '🔧')}
                                      </div>
                                      <div style={{
                                        fontSize: '0.72rem',
                                        fontWeight: 600,
                                        color: isEmergency ? '#ef4444' : 'var(--color-text)',
                                        lineHeight: '1.2',
                                        wordBreak: 'break-word',
                                      }}>
                                        {cmd.label}
                                      </div>
                                    </button>
                                  );
                                })
                            ) : (
                              // Fallback: nếu chưa có JSON, dùng 2 lệnh mặc định
                              <>
                                <button
                                  onClick={() => handleTriggerUtility('printers')}
                                  disabled={utilityActionPending !== null}
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    background: 'var(--color-surface-light)',
                                    border: '1px solid var(--color-surface-light)',
                                    borderRadius: '12px',
                                    padding: '16px 8px',
                                    cursor: utilityActionPending !== null ? 'not-allowed' : 'pointer',
                                    textAlign: 'center',
                                    width: '100%',
                                    transition: 'all 0.2s',
                                    opacity: utilityActionPending !== null ? 0.6 : 1,
                                    minHeight: '108px',
                                    boxSizing: 'border-box',
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
                                  <div style={{ fontSize: '1.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {utilityActionPending === 'printers' ? <LoadingSpinner size="sm" /> : '🖨️'}
                                  </div>
                                  <div style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    color: 'var(--color-text)',
                                    lineHeight: '1.2',
                                    wordBreak: 'break-word',
                                  }}>
                                    Danh sách Máy in
                                  </div>
                                </button>
                                <button
                                  onClick={() => handleTriggerUtility('scan')}
                                  disabled={utilityActionPending !== null}
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    background: 'var(--color-surface-light)',
                                    border: '1px solid var(--color-surface-light)',
                                    borderRadius: '12px',
                                    padding: '16px 8px',
                                    cursor: utilityActionPending !== null ? 'not-allowed' : 'pointer',
                                    textAlign: 'center',
                                    width: '100%',
                                    transition: 'all 0.2s',
                                    opacity: utilityActionPending !== null ? 0.6 : 1,
                                    minHeight: '108px',
                                    boxSizing: 'border-box',
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
                                  <div style={{ fontSize: '1.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {utilityActionPending === 'scan' ? <LoadingSpinner size="sm" /> : '📂'}
                                  </div>
                                  <div style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    color: 'var(--color-text)',
                                    lineHeight: '1.2',
                                    wordBreak: 'break-word',
                                  }}>
                                    Thư mục Scan
                                  </div>
                                </button>
                              </>
                            )}

                            {/* Static buttons: Check watchdog and Emergency Kill */}
                            {/* Check Watchdog */}
                            <button
                              onClick={() => {
                                if (!selectedUtilityAgent) return;
                                setUtilityActionPending('check_watchdog');
                                setUtilityStatusMsg({ text: '⌛ Đang kiểm tra watchdog...', isError: false });
                                const script = `import subprocess, os, sys
results = []
def check(name):
    try:
        out = subprocess.check_output(['tasklist', '/FI', f'IMAGENAME eq {name}'], text=True, creationflags=0x08000000)
        count = out.lower().count(name.lower())
        return count
    except:
        return 0

wd = check('cmd.exe')
pa = check('printagent.exe')

exe_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.getcwd()
wd_exists = os.path.exists(os.path.join(exe_dir, 'watchdog.bat'))

lines = []
lines.append(f'printagent.exe: {pa} process(es) running')
lines.append(f'watchdog.bat file: {"EXISTS" if wd_exists else "NOT FOUND"} in {exe_dir}')
raise RuntimeError('\\n'.join(lines))`;
                                triggerAgentUtilityExec(selectedUtilityAgent.agent_uid, 'check_watchdog', script)
                                  .then((res: any) => {
                                    if (res.ok && res.command_id) {
                                      const maxPollMs = 30000;
                                      const startTime = Date.now();
                                      const timer = setInterval(async () => {
                                        if (Date.now() - startTime > maxPollMs) {
                                          clearInterval(timer);
                                          setUtilityStatusMsg({ text: '⏱️ Timeout chờ kết quả (30s)', isError: true });
                                          setUtilityActionPending(null);
                                          return;
                                        }
                                        try {
                                          const statusRes = await getCommandStatus(res.command_id);
                                          if (statusRes.status === 'success') {
                                            clearInterval(timer);
                                            const msg = statusRes.result_payload || statusRes.result || statusRes.error || 'Hoàn thành';
                                            setViewOutputModal({
                                              isOpen: true,
                                              title: '🩺 Check Watchdog',
                                              content: msg,
                                            });
                                            setUtilityStatusMsg(null);
                                            setUtilityActionPending(null);
                                          } else if (statusRes.status === 'failed') {
                                            clearInterval(timer);
                                            const errMsg = statusRes.error || statusRes.result_payload || statusRes.result || 'Failed';
                                            setViewOutputModal({
                                              isOpen: true,
                                              title: '🩺 Check Watchdog',
                                              content: errMsg,
                                            });
                                            setUtilityStatusMsg(null);
                                            setUtilityActionPending(null);
                                          }
                                        } catch {}
                                      }, 2000);
                                    } else {
                                      setUtilityStatusMsg({ text: '❌ ' + (res.error || 'Không thể gửi lệnh'), isError: true });
                                      setUtilityActionPending(null);
                                    }
                                  })
                                  .catch((err: any) => {
                                    setUtilityStatusMsg({ text: '❌ ' + err.message, isError: true });
                                    setUtilityActionPending(null);
                                  });
                              }}
                              disabled={utilityActionPending !== null}
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                background: 'var(--color-surface-light)',
                                border: '1px solid var(--color-surface-light)',
                                borderRadius: '12px',
                                padding: '16px 8px',
                                cursor: utilityActionPending !== null ? 'not-allowed' : 'pointer',
                                textAlign: 'center',
                                width: '100%',
                                transition: 'all 0.2s',
                                opacity: utilityActionPending !== null ? 0.6 : 1,
                                minHeight: '108px',
                                boxSizing: 'border-box',
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
                              <div style={{ fontSize: '1.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {utilityActionPending === 'check_watchdog' ? <LoadingSpinner size="sm" /> : '🩺'}
                              </div>
                              <div style={{
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                color: 'var(--color-text)',
                                lineHeight: '1.2',
                                wordBreak: 'break-word',
                              }}>
                                Check watchdog
                              </div>
                            </button>

                            {/* Emergency Kill */}
                            <button
                              onClick={handleEmergencyRestart}
                              disabled={utilityActionPending !== null}
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                background: 'var(--color-surface-light)',
                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                borderRadius: '12px',
                                padding: '16px 8px',
                                cursor: utilityActionPending !== null ? 'not-allowed' : 'pointer',
                                textAlign: 'center',
                                width: '100%',
                                transition: 'all 0.2s',
                                opacity: utilityActionPending !== null ? 0.6 : 1,
                                minHeight: '108px',
                                boxSizing: 'border-box',
                              }}
                              onMouseEnter={(e) => {
                                if (utilityActionPending === null) {
                                  e.currentTarget.style.borderColor = '#ef4444';
                                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.05)';
                                }
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.25)';
                                e.currentTarget.style.background = 'var(--color-surface-light)';
                              }}
                            >
                              <div style={{ fontSize: '1.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {utilityActionPending === 'emergency_restart' ? <LoadingSpinner size="sm" /> : '🔌'}
                              </div>
                              <div style={{
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                color: '#ef4444',
                                lineHeight: '1.2',
                                wordBreak: 'break-word',
                              }}>
                                Emergency Kill
                              </div>
                            </button>
                          </>
                        )}

                        {/* Run command input — luôn hiển thị ở dưới cùng */}
                        <div style={{ background: 'var(--color-surface-light)', border: '1px solid var(--color-surface-light)', borderRadius: '8px', padding: '10px 12px', gridColumn: '1 / -1' }}>
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

              {activeModal === 'remote_lock' && remoteLockPrinter && (
                <>
                  <div style={styles.modalHeader}>
                    <h3 style={styles.modalTitle}>🔒 Khóa / Mở khóa máy từ xa</h3>
                    <button style={styles.modalCloseBtn} onClick={() => setActiveModal(null)}>
                      &times;
                    </button>
                  </div>
                  <div style={styles.modalBody}>
                    <p style={{ margin: '0 0 16px 0', fontSize: '0.95rem', color: 'var(--color-text)' }}>
                      Máy: <strong>{remoteLockPrinter.name}</strong> ({remoteLockPrinter.ip})
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {/* Nút Khóa máy */}
                      <button
                        style={{
                          display: 'flex', alignItems: 'center', gap: '12px',
                          background: '#fee2e2', border: '1px solid #ef4444', borderRadius: '8px',
                          padding: '12px 14px', cursor: 'pointer', textAlign: 'left',
                        }}
                        onClick={() => {
                          setActiveModal(null);
                          showToast(`Đang gửi lệnh khóa máy ${remoteLockPrinter.name}...`, 'info', 3000);
                          modifyDeviceAddress({
                            ip: remoteLockPrinter.ip,
                            action: 'lock_machine',
                            agent_uid: remoteLockPrinter.agentUid,
                          })
                            .then((res: any) => {
                              if (res.ok) {
                                showToast(`Đã gửi lệnh khóa máy ${remoteLockPrinter.name} thành công!`, 'success');
                              } else {
                                showToast('Lỗi: ' + (res.error || 'Failed'), 'error');
                              }
                            })
                            .catch((err: any) => {
                              showToast('Lỗi: ' + err.message, 'error');
                            });
                        }}
                      >
                        <div style={{ fontSize: '1.4rem' }}>🔒</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#dc2626' }}>Khóa máy</div>
                          <div style={{ fontSize: '0.7rem', color: '#7f1d1d' }}>Bật xác thực User Code, ngăn người dùng trái phép sử dụng máy</div>
                        </div>
                      </button>
                      {/* Nút Mở khóa máy */}
                      <button
                        style={{
                          display: 'flex', alignItems: 'center', gap: '12px',
                          background: '#dcfce7', border: '1px solid #22c55e', borderRadius: '8px',
                          padding: '12px 14px', cursor: 'pointer', textAlign: 'left',
                        }}
                        onClick={() => {
                          setActiveModal(null);
                          showToast(`Đang gửi lệnh mở khóa máy ${remoteLockPrinter.name}...`, 'info', 3000);
                          modifyDeviceAddress({
                            ip: remoteLockPrinter.ip,
                            action: 'enable_machine',
                            agent_uid: remoteLockPrinter.agentUid,
                          })
                            .then((res: any) => {
                              if (res.ok) {
                                showToast(`Đã gửi lệnh mở khóa máy ${remoteLockPrinter.name} thành công!`, 'success');
                              } else {
                                showToast('Lỗi: ' + (res.error || 'Failed'), 'error');
                              }
                            })
                            .catch((err: any) => {
                              showToast('Lỗi: ' + err.message, 'error');
                            });
                        }}
                      >
                        <div style={{ fontSize: '1.4rem' }}>🔓</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#16a34a' }}>Mở khóa máy</div>
                          <div style={{ fontSize: '0.7rem', color: '#14532d' }}>Tắt xác thực User Code, cho phép sử dụng máy tự do</div>
                        </div>
                      </button>
                    </div>
                  </div>
                </>
              )}

              {activeModal === 'toshiba_vnc' && toshibaVncData && (
                <>
                  <div style={styles.modalHeader}>
                    <h3 style={styles.modalTitle}>📺 Kết nối VNC - {toshibaVncData.printerName}</h3>
                    <button style={styles.modalCloseBtn} onClick={() => setActiveModal(null)}>
                      &times;
                    </button>
                  </div>
                  <div style={styles.modalBody}>
                    {vncTunnelLoading ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0', gap: '16px' }}>
                        <div style={{
                          border: '4px solid rgba(255,255,255,0.1)',
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          borderLeftColor: '#10b981',
                          animation: 'spin 1s linear infinite'
                        }}></div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                          Đang khởi tạo đường hầm VNC bảo mật qua Agent...
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {/* 1. Live Web VNC Viewport (Main Screen) */}
                        <div style={{ border: '1px solid var(--color-surface-light)', borderRadius: '8px', padding: '14px', background: 'rgba(0,0,0,0.2)' }}>
                          {directLan ? (
                            <div style={{ textAlign: 'center', padding: '20px 10px' }}>
                              <p style={{ color: '#34d399', fontWeight: 600, fontSize: '0.85rem', marginBottom: '14px' }}>
                                🟢 Đang bật Direct LAN (kết nối nội mạng). Vui lòng click nút dưới đây để mở giao diện Web VNC nội bộ:
                              </p>
                              <button
                                onClick={() => {
                                  setActiveModal(null);
                                  window.open(`http://${toshibaVncData.ip}:49106/top.html?p=55105&wp=55106&w=1024&h=600&pa=0&op=0&c=0&osid=null`, '_blank');
                                }}
                                style={{
                                  background: '#3b82f6',
                                  border: 'none',
                                  borderRadius: '6px',
                                  padding: '10px 20px',
                                  color: 'white',
                                  fontSize: '0.85rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
                                }}
                              >
                                🌐 Mở Web VNC Nội Mạng
                              </button>
                            </div>
                          ) : allocatedVncAddr ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                              <div 
                                style={{ 
                                  position: 'relative', 
                                  border: '1px solid var(--color-surface-light)', 
                                  borderRadius: '6px', 
                                  overflow: 'hidden',
                                  width: '100%',
                                  maxWidth: '800px',
                                  background: '#000',
                                  cursor: 'crosshair',
                                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
                                }}
                              >
                                <img
                                  id="vnc-live-viewport"
                                  src={`${BASE_URL}/api/vnc/stream?agent_uid=${toshibaVncData.agentUid}&ip=${toshibaVncData.ip}&port=49105&t=${Date.now()}`}
                                  alt="Màn hình Live VNC"
                                  onClick={async (e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const clickX = e.clientX - rect.left;
                                    const clickY = e.clientY - rect.top;
                                    const x_percent = clickX / rect.width;
                                    const y_percent = clickY / rect.height;
                                    
                                    const vncX = Math.round(x_percent * 1024);
                                    const vncY = Math.round(y_percent * 600);
                                    
                                    try {
                                      await fetch(`${BASE_URL}/api/vnc/click`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                          agent_uid: toshibaVncData.agentUid,
                                          ip: toshibaVncData.ip,
                                          port: 49105,
                                          x: vncX,
                                          y: vncY
                                        })
                                      });
                                    } catch (err) {
                                      console.error("VNC Click error:", err);
                                    }
                                  }}
                                  style={{
                                    display: 'block',
                                    width: '100%',
                                    height: 'auto',
                                    pointerEvents: 'auto'
                                  }}
                                />
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#a78bfa', fontWeight: 500 }}>
                                ⚡ Click chuột trực tiếp lên màn hình để tương tác (giống UltraViewer)
                              </div>
                            </div>
                          ) : (
                            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', textAlign: 'center', padding: '10px' }}>
                              Đang kết nối luồng hình ảnh...
                            </div>
                          )}
                        </div>

                        {/* 2. Fallbacks & Connection details */}
                        {!directLan && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
                              <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                                Địa chỉ VPS: <strong style={{ color: 'white', fontFamily: 'monospace' }}>{allocatedVncAddr}</strong> (Pass: <strong style={{ color: 'white', fontFamily: 'monospace' }}>d9kvgn</strong>)
                              </span>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(allocatedVncAddr);
                                    showToast('Đã sao chép địa chỉ VNC', 'success');
                                  }}
                                  style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '4px', padding: '4px 8px', color: 'white', fontSize: '0.7rem', cursor: 'pointer' }}
                                >
                                  Sao chép IP
                                </button>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText('d9kvgn');
                                    showToast('Đã sao chép mật khẩu', 'success');
                                  }}
                                  style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '4px', padding: '4px 8px', color: 'white', fontSize: '0.7rem', cursor: 'pointer' }}
                                >
                                  Sao chép Pass
                                </button>
                              </div>
                            </div>

                            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                              <a
                                href={`vnc://${allocatedVncAddr}`}
                                style={{
                                  flex: 1,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '6px',
                                  textDecoration: 'none',
                                  background: 'rgba(16, 185, 129, 0.1)',
                                  border: '1px solid #10b981',
                                  borderRadius: '6px',
                                  padding: '8px 12px',
                                  color: '#10b981',
                                  fontSize: '0.78rem',
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                              >
                                🚀 Mở bằng VNC App ngoài
                              </a>

                              <button
                                onClick={() => {
                                  setActiveModal(null);
                                  fetchRemotePage(toshibaVncData.ip, '', 'GET', null, false, toshibaVncData.agentUid, 49106);
                                }}
                                style={{
                                  flex: 1,
                                  background: 'rgba(59, 130, 246, 0.1)',
                                  border: '1px solid #3b82f6',
                                  borderRadius: '6px',
                                  padding: '8px 12px',
                                  color: '#3b82f6',
                                  fontSize: '0.78rem',
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                              >
                                🌐 Thử mở Web noVNC
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
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
                  onClick={() => {
                    setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                    confirmModal.onConfirm?.();
                  }}
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

      {/* 5b. INSTALL DRIVER MODAL WITH TARGET AGENT SELECTION */}
      <AnimatePresence>
        {installDriverModal.isOpen && (
          <div style={styles.confirmOverlay} onClick={() => setInstallDriverModal((prev) => ({ ...prev, isOpen: false }))}>
            <motion.div
              style={styles.confirmModalCard}
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>📦 Cài đặt Driver từ xa</h3>
                <button
                  style={styles.modalCloseBtn}
                  onClick={() => setInstallDriverModal((prev) => ({ ...prev, isOpen: false }))}
                >
                  &times;
                </button>
              </div>

              <div style={styles.modalBody}>
                <p style={{ fontSize: '0.82rem', color: 'var(--color-text)', lineHeight: 1.4, margin: '0 0 12px 0' }}>
                  Bạn chuẩn bị cài đặt driver <strong>"{installDriverModal.driverName}"</strong> từ xa.
                </p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                    Chọn Máy đại diện (Agent) để thực hiện cài đặt:
                  </label>
                  <select
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '6px',
                      background: 'var(--color-input-bg)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text)',
                      fontSize: '0.82rem',
                    }}
                    value={installDriverModal.selectedAgentUid}
                    onChange={(e) =>
                      setInstallDriverModal((prev) => ({ ...prev, selectedAgentUid: e.target.value }))
                    }
                  >
                    {(!selectedLan?.agents || selectedLan.agents.filter((a: any) => a.is_online).length === 0) ? (
                      <option value="">(Không có Agent online trong LAN này)</option>
                    ) : (
                      selectedLan.agents
                        .filter((a: any) => a.is_online)
                        .map((a: any) => (
                          <option key={a.agent_uid} value={a.agent_uid}>
                            {a.hostname} ({a.local_ip})
                          </option>
                        ))
                    )}
                  </select>
                </div>
              </div>

              <div style={styles.modalFooter}>
                <button
                  style={{
                    ...styles.smallBtn,
                    padding: '10px 16px',
                    fontSize: '0.82rem',
                    background: 'var(--color-primary)',
                    borderColor: 'var(--color-primary)',
                    color: 'white',
                  }}
                  disabled={!installDriverModal.selectedAgentUid}
                  onClick={() => {
                    setInstallDriverModal((prev) => ({ ...prev, isOpen: false }));
                    executeRemoteInstallDriver(
                      installDriverModal.printerId,
                      installDriverModal.brand,
                      installDriverModal.model,
                      installDriverModal.driverName,
                      installDriverModal.driverUrl,
                      installDriverModal.selectedAgentUid
                    );
                  }}
                >
                  Bắt đầu cài đặt
                </button>
                <button
                  style={{
                    ...styles.smallBtn,
                    padding: '10px 16px',
                    fontSize: '0.82rem',
                    borderColor: 'var(--color-secondary)',
                    color: 'var(--color-secondary)',
                  }}
                  onClick={() => setInstallDriverModal((prev) => ({ ...prev, isOpen: false }))}
                >
                  Hủy bỏ
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 6. IP INPUT MODAL */}
      <AnimatePresence>
        {ipInputModal.isOpen && (
          <div
            style={{ ...styles.confirmOverlay, zIndex: 170 }}
            onClick={() => setIpInputModal((prev) => ({ ...prev, isOpen: false, error: '' }))}
          >
            <motion.div
              style={styles.confirmModalCard}
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>{ipInputModal.title}</h3>
                <button
                  style={styles.modalCloseBtn}
                  onClick={() => setIpInputModal((prev) => ({ ...prev, isOpen: false, error: '' }))}
                >
                  &times;
                </button>
              </div>

              <div style={styles.modalBody}>
                <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', margin: '0 0 10px 0', lineHeight: 1.5 }}>
                  {ipInputModal.hint} Ví dụ: <code style={{ background: 'var(--color-surface-light)', padding: '1px 5px', borderRadius: 4 }}>192.168.1.15</code>
                </p>
                <input
                  autoFocus
                  type="text"
                  value={ipInputModal.value}
                  onChange={(e) => setIpInputModal((prev) => ({ ...prev, value: e.target.value, error: '' }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
                      if (!ipPattern.test(ipInputModal.value.trim())) {
                        setIpInputModal((prev) => ({ ...prev, error: 'IP không hợp lệ! Vui lòng nhập đúng dạng x.x.x.x' }));
                        return;
                      }
                      const cb = ipInputModal.onConfirm;
                      setIpInputModal((prev) => ({ ...prev, isOpen: false, error: '' }));
                      cb(ipInputModal.value.trim());
                    }
                    if (e.key === 'Escape') {
                      setIpInputModal((prev) => ({ ...prev, isOpen: false, error: '' }));
                    }
                  }}
                  placeholder="192.168.1.x"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: ipInputModal.error
                      ? '1.5px solid var(--color-error)'
                      : '1.5px solid var(--color-surface-light)',
                    background: 'var(--color-background)',
                    color: 'var(--color-text)',
                    fontSize: '0.9rem',
                    fontFamily: 'monospace',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => {
                    if (!ipInputModal.error) e.target.style.borderColor = 'var(--color-primary)';
                  }}
                  onBlur={(e) => {
                    if (!ipInputModal.error) e.target.style.borderColor = 'var(--color-surface-light)';
                  }}
                />
                {ipInputModal.error && (
                  <p style={{ margin: '6px 0 0 0', fontSize: '0.72rem', color: 'var(--color-error)' }}>
                    ⚠️ {ipInputModal.error}
                  </p>
                )}
                {ipInputModal.scanStatus && (
                  <div style={{
                    marginTop: '10px',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: 'var(--color-surface-light)',
                    fontSize: '0.74rem',
                    color: 'var(--color-text-secondary)',
                    lineHeight: 1.4,
                    whiteSpace: 'pre-wrap',
                    border: '1px solid var(--color-surface-border)'
                  }}>
                    {ipInputModal.scanStatus}
                  </div>
                )}
              </div>


              <div style={styles.modalFooter}>
                <button
                  style={{
                    ...styles.smallBtn,
                    padding: '10px 16px',
                    fontSize: '0.82rem',
                    background: 'var(--color-primary)',
                    borderColor: 'var(--color-primary)',
                    color: 'white',
                  }}
                  onClick={() => {
                    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
                    if (!ipPattern.test(ipInputModal.value.trim())) {
                      setIpInputModal((prev) => ({ ...prev, error: 'IP không hợp lệ! Vui lòng nhập đúng dạng x.x.x.x' }));
                      return;
                    }
                    const cb = ipInputModal.onConfirm;
                    setIpInputModal((prev) => ({ ...prev, isOpen: false, error: '' }));
                    cb(ipInputModal.value.trim());
                  }}
                >
                  ✅ Xác nhận
                </button>
                <button
                  style={{
                    ...styles.smallBtn,
                    padding: '10px 16px',
                    fontSize: '0.82rem',
                    borderColor: 'var(--color-secondary)',
                    color: 'var(--color-secondary)',
                  }}
                  onClick={() => setIpInputModal((prev) => ({ ...prev, isOpen: false, error: '' }))}
                >
                  Hủy
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 7. VIEW OUTPUT MODAL — hiển thị nội dung file log/config từ agent */}
      <AnimatePresence>
        {viewOutputModal.isOpen && (
          <div
            style={{ ...styles.confirmOverlay, zIndex: 180, alignItems: 'flex-start', paddingTop: '5vh' }}
            onClick={() => setViewOutputModal((prev) => ({ ...prev, isOpen: false }))}
          >
            <motion.div
              style={{
                ...styles.confirmModalCard,
                maxWidth: '680px',
                width: '95%',
                maxHeight: '88vh',
                display: 'flex',
                flexDirection: 'column',
              }}
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <div style={styles.modalHeader}>
                <h3 style={{ ...styles.modalTitle, fontSize: '0.85rem' }}>{viewOutputModal.title}</h3>
                <button
                  style={styles.modalCloseBtn}
                  onClick={() => setViewOutputModal((prev) => ({ ...prev, isOpen: false }))}
                >
                  &times;
                </button>
              </div>

              {viewOutputModal.title.includes('settings.json') ? (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                  <textarea
                    value={editableSettingsText}
                    onChange={(e) => setEditableSettingsText(e.target.value)}
                    style={{
                      flex: 1,
                      overflow: 'auto',
                      margin: 0,
                      padding: '12px',
                      background: 'var(--color-background)',
                      border: '1px solid var(--color-surface-light)',
                      borderRadius: '8px',
                      fontSize: '0.72rem',
                      lineHeight: 1.55,
                      fontFamily: "'Consolas', 'Monaco', monospace",
                      color: 'var(--color-text)',
                      minHeight: '380px',
                      outline: 'none',
                      resize: 'none',
                    }}
                  />
                  {settingsSaveStatus && (
                    <div style={{
                      marginTop: 8, fontSize: 11,
                      padding: '6px 10px', borderRadius: 6,
                      background: settingsSaveStatus.startsWith('❌') ? 'rgba(239,68,68,0.1)' : (settingsSaveStatus.startsWith('✔️') ? 'rgba(34,197,94,0.1)' : 'rgba(234,179,8,0.1)'),
                      color: settingsSaveStatus.startsWith('❌') ? '#f87171' : (settingsSaveStatus.startsWith('✔️') ? '#4ade80' : 'var(--color-warning)'),
                      border: `1px solid ${settingsSaveStatus.startsWith('❌') ? 'rgba(239,68,68,0.15)' : (settingsSaveStatus.startsWith('✔️') ? 'rgba(34,197,94,0.15)' : 'rgba(234,179,8,0.15)')}`
                    }}>
                      {settingsSaveStatus}
                    </div>
                  )}
                </div>
              ) : (
                <pre
                  style={{
                    flex: 1,
                    overflow: 'auto',
                    margin: 0,
                    padding: '12px',
                    background: 'var(--color-background)',
                    border: '1px solid var(--color-surface-light)',
                    borderRadius: '8px',
                    fontSize: '0.68rem',
                    lineHeight: 1.55,
                    fontFamily: "'Consolas', 'Monaco', monospace",
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    color: 'var(--color-text)',
                    minHeight: 0,
                  }}
                >
                  {formatJsonText(viewOutputModal.content)}
                </pre>
              )}

              <div style={{ ...styles.modalFooter, marginTop: '10px' }}>
                {viewOutputModal.title.includes('settings.json') && (
                  <button
                    disabled={isSavingSettings}
                    style={{
                      ...styles.smallBtn,
                      padding: '8px 14px',
                      fontSize: '0.78rem',
                      background: isSavingSettings ? 'rgba(99,102,241,0.6)' : 'var(--color-primary)',
                      borderColor: 'var(--color-primary)',
                      color: '#fff',
                      cursor: isSavingSettings ? 'not-allowed' : 'pointer'
                    }}
                    onClick={handleSaveSettings}
                  >
                    {isSavingSettings ? '⌛ Đang lưu...' : '💾 Lưu cấu hình'}
                  </button>
                )}
                <button
                  style={{
                    ...styles.smallBtn,
                    padding: '8px 14px',
                    fontSize: '0.78rem',
                  }}
                  onClick={() => {
                    navigator.clipboard.writeText(viewOutputModal.title.includes('settings.json') ? editableSettingsText : formatJsonText(viewOutputModal.content)).catch(() => {});
                  }}
                >
                  📋 Copy
                </button>
                <button
                  style={{
                    ...styles.smallBtn,
                    padding: '8px 14px',
                    fontSize: '0.78rem',
                    borderColor: 'var(--color-secondary)',
                    color: 'var(--color-secondary)',
                  }}
                  onClick={() => setViewOutputModal((prev) => ({ ...prev, isOpen: false }))}
                >
                  Đóng
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 8. WEB PREVIEW MODAL — Xem trực tiếp Web Setting */}
      <AnimatePresence>
        {webPreviewModal && webPreviewModal.isOpen && (
          <div
            className="web-preview-modal-overlay"
            style={{ ...styles.confirmOverlay, zIndex: 190, alignItems: 'flex-start', paddingTop: '5vh' }}
            onClick={handleCloseWebPreview}
          >
            <style>{`
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
              @media (max-width: 767px) {
                .web-preview-modal-overlay {
                  padding-top: 0px !important;
                  align-items: center !important;
                  justify-content: center !important;
                }
                .web-preview-modal-card {
                  width: 100% !important;
                  height: 100vh !important;
                  max-height: 100vh !important;
                  border-radius: 0px !important;
                  padding: 12px !important;
                  margin: 0 !important;
                }
              }
            `}</style>
            {(() => {
              let pageTitle = 'Trang cấu hình máy in';
              if (webPreviewModal.html && webPreviewModal.html !== 'LOADING' && !webPreviewModal.html.startsWith('ERROR:')) {
                if (webPreviewModal.html === 'DIRECT_LAN') {
                  pageTitle = 'Kết nối trực tiếp LAN';
                } else {
                  const titleMatch = webPreviewModal.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
                  if (titleMatch && titleMatch[1]) {
                    pageTitle = titleMatch[1].trim();
                  }
                }
              }
              
              return (
                <motion.div
                  className="web-preview-modal-card"
                  style={{
                    ...styles.confirmModalCard,
                    maxWidth: '1200px',
                    width: '95%',
                    height: '85vh',
                    maxHeight: '85vh',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '20px',
                  }}
                  onClick={(e) => e.stopPropagation()}
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                >
                  <div style={styles.modalHeader}>
                    <h3 style={{ ...styles.modalTitle, fontSize: '0.85rem' }}>{webPreviewModal.title}</h3>
                    <button
                      style={styles.modalCloseBtn}
                      onClick={handleCloseWebPreview}
                    >
                      &times;
                    </button>
                  </div>

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: '15px', minHeight: 0 }}>
                    {webPreviewModal.html === 'LOADING' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '12px', padding: '20px' }}>
                        <svg
                          style={{
                            width: '36px',
                            height: '36px',
                            color: 'var(--color-primary)',
                            animation: 'spin 1s linear infinite'
                          }}
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                          Đang đợi phản hồi từ Agent...
                        </span>
                        <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', textAlign: 'center', maxWidth: '320px' }}>
                          Agent đang kết nối trực tiếp đến máy in và nạp cấu hình...
                        </span>
                      </div>
                    ) : webPreviewModal.html.startsWith('ERROR:') ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '12px', padding: '20px', color: 'var(--color-error)' }}>
                        <span style={{ fontSize: '2.2rem' }}>⚠️</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, textAlign: 'center' }}>
                          Lỗi lấy trang Web Setting từ Agent
                        </span>
                        <pre style={{ fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, padding: '12px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.15)', width: '100%', boxSizing: 'border-box', fontFamily: 'monospace' }}>
                          {webPreviewModal.html.replace('ERROR:', '').trim()}
                        </pre>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1, minHeight: 0 }}>
                        {/* Compact Connection Mode Status Row */}
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid var(--color-surface-light)',
                          borderRadius: '8px',
                          padding: '8px 12px',
                          fontSize: '0.74rem'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text)' }}>
                            <span>🔌 Kết nối: <strong>{directLan ? '⚡ Trực tiếp LAN' : '🌐 Qua Agent'}</strong></span>
                          </div>
                          <button
                            onClick={() => setShowPreviewDetails(!showPreviewDetails)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--color-primary)',
                              cursor: 'pointer',
                              fontWeight: 600,
                              fontSize: '0.72rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            {showPreviewDetails ? 'Thu gọn ▲' : 'Cài đặt & Chi tiết ▼'}
                          </button>
                        </div>

                        {showPreviewDetails && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {/* Success Status & Control Actions */}
                            <div style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '12px',
                              background: 'rgba(16, 185, 129, 0.04)',
                              border: '1px solid rgba(16, 185, 129, 0.15)',
                              borderRadius: '8px',
                              padding: '10px 14px',
                            }}>
                              <div style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)' }}>
                                <span style={{ color: '#10b981', fontWeight: 700 }}>🟢 Kết nối Live:</span> {pageTitle} (<span style={{ fontFamily: 'monospace' }}>{webPreviewModal.ip}</span>)
                              </div>
                              
                              <button
                                onClick={() => window.open(`http://${webPreviewModal.ip}/`, '_blank')}
                                style={{
                                  padding: '6px 12px',
                                  fontSize: '0.72rem',
                                  fontWeight: 600,
                                  background: '#10b981',
                                  border: 'none',
                                  borderRadius: '6px',
                                  color: 'white',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.15)',
                                }}
                              >
                                🌐 Mở trực tiếp LAN
                              </button>
                            </div>

                            {/* Chế độ kết nối Switcher */}
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '12px',
                              background: 'var(--color-surface)',
                              border: '1px solid var(--color-surface-light)',
                              borderRadius: '8px',
                              padding: '8px 12px',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', fontWeight: 600, color: 'var(--color-text)' }}>
                                🔗 Chế độ kết nối:
                              </div>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  onClick={() => handleToggleDirectLan(false)}
                                  style={{
                                    padding: '4px 10px',
                                    fontSize: '0.70rem',
                                    fontWeight: 600,
                                    background: !directLan ? 'var(--color-primary)' : 'rgba(255,255,255,0.05)',
                                    color: !directLan ? 'white' : 'var(--color-text-secondary)',
                                    border: !directLan ? '1px solid var(--color-primary)' : '1px solid var(--color-surface-light)',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                  }}
                                >
                                  🔌 Qua Agent (Từ xa)
                                </button>
                                <button
                                  onClick={() => handleToggleDirectLan(true)}
                                  style={{
                                    padding: '4px 10px',
                                    fontSize: '0.70rem',
                                    fontWeight: 600,
                                    background: directLan ? '#10b981' : 'rgba(255,255,255,0.05)',
                                    color: directLan ? 'white' : 'var(--color-text-secondary)',
                                    border: directLan ? '1px solid #10b981' : '1px solid var(--color-surface-light)',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                  }}
                                >
                                  ⚡ Trực tiếp LAN (Cùng Wifi)
                                </button>
                              </div>
                            </div>

                            {directLan && window.location.protocol === 'https:' && (
                              <div style={{
                                color: '#fbbf24',
                                background: 'rgba(251, 191, 36, 0.08)',
                                border: '1px solid rgba(251, 191, 36, 0.25)',
                                borderRadius: '8px',
                                padding: '10px 14px',
                                fontSize: '0.72rem',
                                lineHeight: 1.4
                              }}>
                                ⚠️ <strong>Mixed Content Block:</strong> Trình duyệt di động/máy tính sẽ chặn kết nối HTTP trực tiếp đến IP máy in từ trang web bảo mật HTTPS. Để kết nối trực tiếp thành công, hãy mở trang web quản trị qua <strong>HTTP</strong> hoặc click nút <strong>🌐 Mở trực tiếp LAN</strong> phía trên để truy cập trong tab mới.
                              </div>
                            )}

                            {directLan && (
                              <div style={{
                                color: '#60a5fa',
                                background: 'rgba(96, 165, 250, 0.08)',
                                border: '1px solid rgba(96, 165, 250, 0.25)',
                                borderRadius: '8px',
                                padding: '10px 14px',
                                fontSize: '0.72rem',
                                lineHeight: 1.4
                              }}>
                                💡 <strong>Chế độ trực tiếp LAN:</strong> Thiết bị kết nối trực tiếp đến IP máy in qua mạng Wifi nội bộ.
                                <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                                  <li>Thanh địa chỉ và Lịch sử duyệt sẽ không tự động cập nhật.</li>
                                  <li>Chức năng thu phóng (Ngang/Dọc) trong iframe không áp dụng (vui lòng zoom bằng thao tác vuốt).</li>
                                </ul>
                              </div>
                            )}
                            
                            {!directLan && (
                              <div style={{
                                color: 'var(--color-text-secondary)',
                                background: 'rgba(255, 255, 255, 0.02)',
                                border: '1px solid var(--color-surface-light)',
                                borderRadius: '8px',
                                padding: '10px 14px',
                                fontSize: '0.72rem',
                                lineHeight: 1.4
                              }}>
                                <strong style={{ color: 'var(--color-primary)' }}>🛠️ Nhật ký & Thông số kết nối ngược (SSH Reverse Tunnel):</strong>
                                <div style={{ marginTop: '6px', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <div>• <strong>Máy khách (Agent Uid):</strong> {webPreviewModal.agentUid}</div>
                                  <div>• <strong>Địa chỉ IP Máy in:</strong> {webPreviewModal.ip}</div>
                                  <div>• <strong>Cổng dịch vụ máy in:</strong> 80</div>
                                  <div>• <strong>Máy chủ VPS:</strong> 31.97.76.62</div>
                                  <div>• <strong>Cổng kết nối trên VPS (Assigned Port):</strong> {webPreviewModal.url ? webPreviewModal.url.split(':').pop() : 'Đang cấp phát...'}</div>
                                  <div>• <strong>Phương thức xác thực:</strong> SSH Key pair (Root User)</div>
                                  <div>• <strong>Đường dẫn kết nối:</strong> <span style={{ color: 'var(--color-text)' }}>{webPreviewModal.url || 'N/A'}</span></div>
                                  {webPreviewModal.url && (
                                    <div style={{ color: '#fbbf24', marginTop: '4px' }}>
                                      ⚠️ Nếu Iframe hiển thị màn hình trắng / lỗi kết nối, có thể do trình duyệt chặn nội dung Mixed Content (HTTP trên trang HTTPS). Hãy click nút <strong>🔗 Mở tab mới ↗</strong> ở thanh điều khiển phía dưới để xem trực tiếp.
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Browser Chrome Controls (Address Bar & Nav Buttons) */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-surface-light)',
                          borderRadius: '6px',
                          padding: '6px 12px'
                        }}>
                          <button
                            onClick={handleHistoryBack}
                            disabled={webPreviewHistoryIndex <= 0}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: webPreviewHistoryIndex <= 0 ? 'rgba(255,255,255,0.15)' : 'var(--color-text)',
                              cursor: webPreviewHistoryIndex <= 0 ? 'not-allowed' : 'pointer',
                              padding: '4px',
                              fontSize: '0.8rem'
                            }}
                            title="Back"
                          >
                            ◀
                          </button>
                          <button
                            onClick={handleHistoryForward}
                            disabled={webPreviewHistoryIndex >= webPreviewHistory.length - 1}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: webPreviewHistoryIndex >= webPreviewHistory.length - 1 ? 'rgba(255,255,255,0.15)' : 'var(--color-text)',
                              cursor: webPreviewHistoryIndex >= webPreviewHistory.length - 1 ? 'not-allowed' : 'pointer',
                              padding: '4px',
                              fontSize: '0.8rem'
                            }}
                            title="Forward"
                          >
                            ▶
                          </button>
                          <button
                            onClick={() => fetchRemotePage(webPreviewModal.ip, webPreviewModal.path)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--color-text)',
                              cursor: 'pointer',
                              padding: '4px',
                              fontSize: '0.8rem',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                            title="Refresh"
                          >
                            🔄
                          </button>
                          <div style={{
                            flex: 1,
                            background: 'var(--color-background)',
                            border: '1px solid var(--color-surface-light)',
                            borderRadius: '4px',
                            padding: '4px 10px',
                            fontSize: '0.72rem',
                            fontFamily: 'monospace',
                            color: 'var(--color-text-secondary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            http://{webPreviewModal.ip}{webPreviewModal.path || '/'}
                          </div>
                          {webPreviewModal.url && (
                            <a
                              href={webPreviewModal.url}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                background: 'var(--color-primary)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '4px 10px',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                textDecoration: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                cursor: 'pointer',
                                marginLeft: '8px'
                              }}
                              title="Mở trang quản trị Web Image Monitor trong tab mới"
                            >
                              🔗 Mở tab mới ↗
                            </a>
                          )}
                        </div>

                        {/* Tab Selector for Preview Mode */}
                        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-surface-light)', gap: '15px', paddingBottom: '4px' }}>
                          <button
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: '8px 12px',
                              fontSize: '0.78rem',
                              fontWeight: webPreviewTab === 'iframe' ? 600 : 500,
                              color: webPreviewTab === 'iframe' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                              borderBottom: webPreviewTab === 'iframe' ? '2px solid var(--color-primary)' : '2px solid transparent',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                            onClick={() => setWebPreviewTab('iframe')}
                          >
                            🌐 Giao diện máy in
                          </button>
                          <button
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: '8px 12px',
                              fontSize: '0.78rem',
                              fontWeight: webPreviewTab === 'html' ? 600 : 500,
                              color: webPreviewTab === 'html' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                              borderBottom: webPreviewTab === 'html' ? '2px solid var(--color-primary)' : '2px solid transparent',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                            onClick={() => setWebPreviewTab('html')}
                          >
                            📄 Xem mã HTML (Text)
                          </button>
                        </div>

                        {webPreviewTab === 'html' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minHeight: 0 }}>
                            {directLan ? (
                              <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flex: 1,
                                gap: '10px',
                                color: 'var(--color-text-secondary)',
                                fontSize: '0.76rem',
                                padding: '20px',
                                textAlign: 'center'
                              }}>
                                <span>📄 Chế độ trực tiếp LAN không tải mã nguồn về server.</span>
                                <span style={{ fontSize: '0.70rem', color: 'rgba(255,255,255,0.4)' }}>
                                  Hãy chuyển sang chế độ <strong>Qua Agent (Từ xa)</strong> để phân tích và xem mã nguồn HTML của máy in.
                                </span>
                              </div>
                            ) : (
                              <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                                    Mã nguồn HTML gốc từ máy in:
                                  </span>
                                  <button
                                    style={{
                                      border: 'none',
                                      background: 'rgba(59, 130, 246, 0.1)',
                                      color: '#3b82f6',
                                      padding: '4px 10px',
                                      borderRadius: '6px',
                                      fontSize: '0.72rem',
                                      cursor: 'pointer',
                                      fontWeight: 600,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}
                                    onClick={() => {
                                      navigator.clipboard.writeText(webPreviewModal.html);
                                      showToast('Đã copy mã HTML vào clipboard', 'success');
                                    }}
                                  >
                                    📋 Copy HTML
                                  </button>
                                </div>
                                <pre style={{
                                  flex: 1,
                                  overflow: 'auto',
                                  margin: 0,
                                  padding: '12px',
                                  background: 'var(--color-background)',
                                  border: '1px solid var(--color-surface-light)',
                                  borderRadius: '8px',
                                  fontSize: '0.68rem',
                                  lineHeight: 1.5,
                                  fontFamily: "'Consolas', 'Monaco', monospace",
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-all',
                                  color: 'var(--color-text)',
                                }}>
                                  {webPreviewModal.html}
                                </pre>
                              </>
                            )}
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minHeight: 0 }}>
                            {/* Toolbar Zoom & Scale */}
                            <div style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '12px',
                              background: 'var(--color-surface)',
                              border: '1px solid var(--color-surface-light)',
                              borderRadius: '6px',
                              padding: '8px 12px',
                              fontSize: '0.74rem'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
                                {/* Horizontal scale */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>↔️ Ngang:</span>
                                  <button
                                    onClick={() => {
                                      const newVal = Math.max(0.3, parseFloat((scaleX - 0.05).toFixed(2)));
                                      setScaleX(newVal);
                                      if (lockAspect) setScaleY(newVal);
                                    }}
                                    style={{
                                      background: 'var(--color-background)',
                                      border: '1px solid var(--color-surface-light)',
                                      color: 'var(--color-text)',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      cursor: 'pointer'
                                    }}
                                  >-</button>
                                  <input
                                    type="range"
                                    min="0.3"
                                    max="2.0"
                                    step="0.05"
                                    value={scaleX}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value);
                                      setScaleX(val);
                                      if (lockAspect) setScaleY(val);
                                    }}
                                    style={{ width: '80px', cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                                  />
                                  <button
                                    onClick={() => {
                                      const newVal = Math.min(2.0, parseFloat((scaleX + 0.05).toFixed(2)));
                                      setScaleX(newVal);
                                      if (lockAspect) setScaleY(newVal);
                                    }}
                                    style={{
                                      background: 'var(--color-background)',
                                      border: '1px solid var(--color-surface-light)',
                                      color: 'var(--color-text)',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      cursor: 'pointer'
                                    }}
                                  >+</button>
                                  <span style={{ minWidth: '35px', textAlign: 'right', fontWeight: 600, color: 'var(--color-text)' }}>
                                    {Math.round(scaleX * 100)}%
                                  </span>
                                </div>

                                {/* Vertical scale */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>↕️ Dọc:</span>
                                  <button
                                    onClick={() => {
                                      const newVal = Math.max(0.3, parseFloat((scaleY - 0.05).toFixed(2)));
                                      setScaleY(newVal);
                                      if (lockAspect) setScaleX(newVal);
                                    }}
                                    style={{
                                      background: 'var(--color-background)',
                                      border: '1px solid var(--color-surface-light)',
                                      color: 'var(--color-text)',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      cursor: 'pointer'
                                    }}
                                    disabled={lockAspect}
                                  >-</button>
                                  <input
                                    type="range"
                                    min="0.3"
                                    max="2.0"
                                    step="0.05"
                                    value={scaleY}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value);
                                      setScaleY(val);
                                      if (lockAspect) setScaleX(val);
                                    }}
                                    style={{ width: '80px', cursor: 'pointer', accentColor: 'var(--color-primary)', opacity: lockAspect ? 0.5 : 1 }}
                                    disabled={lockAspect}
                                  />
                                  <button
                                    onClick={() => {
                                      const newVal = Math.min(2.0, parseFloat((scaleY + 0.05).toFixed(2)));
                                      setScaleY(newVal);
                                      if (lockAspect) setScaleX(newVal);
                                    }}
                                    style={{
                                      background: 'var(--color-background)',
                                      border: '1px solid var(--color-surface-light)',
                                      color: 'var(--color-text)',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      cursor: 'pointer'
                                    }}
                                    disabled={lockAspect}
                                  >+</button>
                                  <span style={{ minWidth: '35px', textAlign: 'right', fontWeight: 600, color: lockAspect ? 'var(--color-text-secondary)' : 'var(--color-text)' }}>
                                    {Math.round(scaleY * 100)}%
                                  </span>
                                </div>

                                {/* Lock Aspect Ratio Toggle */}
                                <button
                                  onClick={() => {
                                    setLockAspect(!lockAspect);
                                    if (!lockAspect) {
                                      // Sync Y to X when locking
                                      setScaleY(scaleX);
                                    }
                                  }}
                                  style={{
                                    background: lockAspect ? 'rgba(124, 106, 247, 0.15)' : 'var(--color-background)',
                                    border: lockAspect ? '1px solid var(--color-accent, #7c6af7)' : '1px solid var(--color-surface-light)',
                                    color: lockAspect ? 'var(--color-accent, #7c6af7)' : 'var(--color-text-secondary)',
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    transition: 'all 0.2s ease'
                                  }}
                                  title={lockAspect ? "Bỏ liên kết tỷ lệ" : "Liên kết tỷ lệ Ngang & Dọc"}
                                >
                                  {lockAspect ? '🔗 Đồng bộ' : '🔓 Tự do'}
                                </button>
                              </div>

                              {/* Presets and Auto-Fit */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <button
                                  onClick={() => {
                                    setScaleX(0.95);
                                    setScaleY(0.95);
                                  }}
                                  style={{
                                    background: 'var(--color-background)',
                                    border: '1px solid var(--color-surface-light)',
                                    color: 'var(--color-text)',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontWeight: 500
                                  }}
                                >
                                  Mặc định
                                </button>
                                <button
                                  onClick={() => {
                                    setScaleX(1.0);
                                    setScaleY(1.0);
                                  }}
                                  style={{
                                    background: 'var(--color-background)',
                                    border: '1px solid var(--color-surface-light)',
                                    color: 'var(--color-text)',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontWeight: 500
                                  }}
                                >
                                  100%
                                </button>
                                <button
                                  onClick={() => {
                                    try {
                                      const iframe = previewIframeRef.current;
                                      if (!iframe) return;
                                      const doc = iframe.contentDocument || iframe.contentWindow?.document;
                                      if (doc && doc.body) {
                                        // temporary reset width for measurement
                                        const origWidth = doc.body.style.width;
                                        const origTransform = doc.body.style.transform;
                                        doc.body.style.transform = 'none';
                                        doc.body.style.width = 'auto';
                                        
                                        // Let browser reflow and measure scrollWidth
                                        const contentWidth = doc.body.scrollWidth || doc.documentElement.scrollWidth || 1024;
                                        const containerWidth = iframe.clientWidth || 800;
                                        
                                        // Restore
                                        doc.body.style.width = origWidth;
                                        doc.body.style.transform = origTransform;

                                        if (contentWidth > 0 && containerWidth > 0) {
                                          let fitScale = containerWidth / contentWidth;
                                          fitScale = Math.max(0.3, Math.min(1.5, fitScale));
                                          // Round to nearest 0.05 step
                                          fitScale = Math.round(fitScale * 20) / 20;
                                          setScaleX(fitScale);
                                          if (lockAspect) {
                                            setScaleY(fitScale);
                                          }
                                        }
                                      }
                                    } catch (e) {
                                      console.error(e);
                                    }
                                  }}
                                  style={{
                                    background: 'rgba(16, 185, 129, 0.1)',
                                    border: '1px solid rgba(16, 185, 129, 0.3)',
                                    color: '#10b981',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontWeight: 600
                                  }}
                                >
                                  📐 Vừa khung
                                </button>
                              </div>
                            </div>

                            <div style={{ flex: 1, minHeight: 0, background: 'white', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--color-surface-light)', position: 'relative' }}>
                              <iframe
                                ref={previewIframeRef}
                                src={webPreviewModal.url ? webPreviewModal.url : (directLan ? `http://${webPreviewModal.ip}${webPreviewModal.path || '/'}` : previewBlobUrl)}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  border: 'none',
                                  background: 'white'
                                }}
                              />
                              {webPreviewLoading && (
                                <div style={{
                                  position: 'absolute',
                                  top: 0,
                                  left: 0,
                                  right: 0,
                                  bottom: 0,
                                  background: 'rgba(15, 23, 42, 0.65)',
                                  backdropFilter: 'blur(3px)',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '12px',
                                  zIndex: 10
                                }}>
                                  <svg
                                    style={{
                                      width: '36px',
                                      height: '36px',
                                      color: 'var(--color-primary)',
                                      animation: 'spin 1s linear infinite'
                                    }}
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                  >
                                    <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  <span style={{ fontSize: '0.85rem', color: 'white', fontWeight: 600 }}>
                                    Đang đợi phản hồi từ Agent...
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ ...styles.modalFooter, marginTop: '15px', flexShrink: 0, borderTop: '1px solid var(--color-surface-light)', paddingTop: '12px' }}>
                    {webPreviewModal.html !== 'LOADING' && !webPreviewModal.html.startsWith('ERROR:') && (
                      <button
                        style={{
                          ...styles.smallBtn,
                          padding: '8px 14px',
                          fontSize: '0.78rem',
                          background: 'var(--color-primary)',
                          borderColor: 'var(--color-primary)',
                          color: 'white',
                        }}
                        onClick={() => {
                          const blob = new Blob([webPreviewModal!.html], { type: 'text/html;charset=utf-8' });
                          const url = URL.createObjectURL(blob);
                          window.open(url, '_blank');
                        }}
                      >
                        ↗️ Xem mã HTML gốc
                      </button>
                    )}
                    <button
                      style={{
                        ...styles.smallBtn,
                        padding: '8px 14px',
                        fontSize: '0.78rem',
                        borderColor: 'var(--color-secondary)',
                        color: 'var(--color-secondary)',
                        marginLeft: '8px'
                      }}
                      onClick={() => setWebPreviewModal((prev) => prev ? { ...prev, isOpen: false } : null)}
                    >
                      Đóng
                    </button>
                  </div>
                </motion.div>
              );
            })()}
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
