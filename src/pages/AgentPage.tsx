// @ts-nocheck
import { CopiersTab } from './Agent/components/CopiersTab';
import { AgentsTab } from './Agent/components/AgentsTab';

import { styles } from './Agent/AgentPageStyles';
import { AgentModals } from './Agent/components/AgentModals';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAgentPageController } from './Agent/hooks/useAgentPageController';
import { motion, AnimatePresence } from 'framer-motion';
import { GlowCard } from '../components/ui/GlowCard';
import { AnimatedList } from '../components/ui/AnimatedList';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import {
  fetchApi,
  getLanSites,
  saveCopierCredentials,
  triggerFetchAddressBook,
  getCommandStatus,
  addEmailDestination,
  addPrivateLanEmail,
  deleteScanPoint,
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

  const masterAgent = (agents || []).find(a => a.is_master && a.is_agent_active) || (agents || []).find(a => a.is_agent_active) || (agents || [])[0];
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
  const propsToPass = useAgentPageController();
  const {
    toasts = [],
    setToasts,
    showToast,
    pollCommandStatus,
    lanSitesLoading,
    lanSites = [],
    setLanSites,
    selectedPublicIp,
    setSelectedPublicIp,
    targetInternalIp,
    setTargetInternalIp,
    selectedLanUid,
    setSelectedLanUid,
    activeTab,
    setActiveTab,
    selectedLan,
    triggerLanScan,
    filteredPrinters,
    cameras,
    fetchLanSitesData,
    myClientIp
  } = propsToPass as any;

  const [inputIpDraft, setInputIpDraft] = useState(() => selectedPublicIp || '');
  const inputIpRef = useRef<HTMLInputElement>(null);
  const fixedHeaderRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState<number>(230);
  const [isDirectIpMode, setIsDirectIpMode] = useState(() => Boolean(targetInternalIp));
  const [internalIpDraft, setInternalIpDraft] = useState(() => targetInternalIp || '');
  const inputInternalIpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = fixedHeaderRef.current;
    if (!el) return;

    const updateHeight = () => {
      if (fixedHeaderRef.current) {
        setHeaderHeight(fixedHeaderRef.current.offsetHeight);
      }
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(el);

    window.addEventListener('resize', updateHeight);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, [isDirectIpMode]);

  useEffect(() => {
    setInputIpDraft(selectedPublicIp || '');
  }, [selectedPublicIp]);

  useEffect(() => {
    setInternalIpDraft(targetInternalIp || '');
    if (targetInternalIp) {
      setIsDirectIpMode(true);
    }
  }, [targetInternalIp]);

  const handleApplyInternalIp = async (ipVal: string) => {
    const cleanIp = (ipVal || '').trim();
    if (setTargetInternalIp) setTargetInternalIp(cleanIp);
    if (cleanIp) {
      localStorage.setItem('goxprint_target_internal_ip', cleanIp);
      if (showToast) showToast(`🔍 Đang lọc hiển thị máy photo IP: ${cleanIp}`, 'info', 3000);
    } else {
      localStorage.removeItem('goxprint_target_internal_ip');
    }
    if (fetchLanSitesData) {
      await fetchLanSitesData(true);
    }
  };

  const handleExecuteDirectPrinterProbe = async (ipVal: string) => {
    const cleanIp = (ipVal || '').trim();
    if (!cleanIp) {
      if (showToast) showToast('Vui lòng nhập địa chỉ IP nội bộ máy in (VD: 192.168.1.155)', 'warning');
      return;
    }

    // 1. Instantly set target internal IP filter
    if (setTargetInternalIp) setTargetInternalIp(cleanIp);
    localStorage.setItem('goxprint_target_internal_ip', cleanIp);

    // 2. INSTANTLY CLEAN DATA: Wipe out any non-matching old cached printers from state
    if (setLanSites && selectedLan) {
      setLanSites((prevSites: any[]) =>
        prevSites.map((site: any) => {
          if (site.lan_uid === selectedLan.lan_uid || site.public_ip === selectedLan.public_ip) {
            return {
              ...site,
              printers: (site.printers || []).filter(
                (p: any) => (p.ip || '').trim() === cleanIp || (p.printer_ip || '').trim() === cleanIp
              ),
            };
          }
          return site;
        })
      );
    }

    const activeAgents = (selectedLan?.agents || []).filter((a: any) => a.is_agent_active);
    if (activeAgents.length === 0) {
      if (showToast) showToast(`⚠️ Đã làm sạch dữ liệu cũ & cài đặt IP ${cleanIp}, nhưng không có Agent nào đang online trong mạng LAN này để gửi lệnh probing trực tiếp!`, 'warning', 5000);
      if (fetchLanSitesData) await fetchLanSitesData(true);
      setActiveTab('copiers');
      return;
    }

    const targetAgent = activeAgents[0];
    const agentUid = targetAgent.agent_uid;

    if (showToast) showToast(`⚡ Đã làm sạch dữ liệu cũ. Đang gửi lệnh probe trực tiếp IP ${cleanIp} tới Agent (${agentUid})...`, 'info', 6000);

    const probeScript = `import sys, os, socket, subprocess, re, json

target_ip = "${cleanIp}".strip()
print(f"=== PROBING SINGLE PRINTER DIRECTLY: {target_ip} ===")

if not target_ip or target_ip == "__TARGET_IP__":
    print("Error: Target IP not specified")
    sys.exit(1)

def check_tcp(ip, port, timeout=1.5):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout)
        res = s.connect_ex((ip, port))
        s.close()
        return res == 0
    except Exception:
        return False

open_ports = []
for p in [80, 443, 9100, 161, 515, 631]:
    if check_tcp(target_ip, p):
        open_ports.append(p)

print(f"Target IP {target_ip} open ports: {open_ports}")

mac_address = ""
try:
    arp_out = subprocess.getoutput(f"arp -a {target_ip}")
    mac_match = re.search(r"([0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2})", arp_out)
    if mac_match:
        mac_address = mac_match.group(1).upper().replace('-', ':')
except Exception as e:
    print(f"ARP lookup error: {e}")

print(f"MAC Address: {mac_address or 'Unknown'}")

printer_name = f"Printer ({target_ip})"
printer_type = "generic"

try:
    import urllib.request
    url = f"http://{target_ip}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=3) as resp:
        html = resp.read().decode('utf-8', errors='ignore').lower()
        if "ricoh" in html:
            printer_type = "ricoh"
            printer_name = f"Ricoh Photocopy ({target_ip})"
        elif "toshiba" in html:
            printer_type = "toshiba"
            printer_name = f"Toshiba Photocopy ({target_ip})"
        elif "fuji" in html or "xerox" in html:
            printer_type = "fujifilm"
            printer_name = f"Fuji Xerox ({target_ip})"
        elif "canon" in html:
            printer_type = "canon"
            printer_name = f"Canon Printer ({target_ip})"
        elif "epson" in html:
            printer_type = "epson"
            printer_name = f"Epson Printer ({target_ip})"
        elif "hp" in html or "hewlett" in html:
            printer_type = "hp"
            printer_name = f"HP Printer ({target_ip})"
except Exception as http_err:
    print(f"HTTP probe note: {http_err}")

printer_info = {
    "ip": target_ip,
    "mac_address": mac_address,
    "mac_id": mac_address,
    "printer_name": printer_name,
    "printer_type": printer_type,
    "open_ports": open_ports,
    "is_online": len(open_ports) > 0 or bool(mac_address)
}

print("__PRINTER_INFO_JSON_START__")
print(json.dumps(printer_info))
print("__PRINTER_INFO_JSON_END__")
`;

    try {
      const res = await triggerAgentUtilityExec(
        agentUid,
        'probe_single_printer',
        probeScript,
        {
          target_ip: cleanIp,
          printer_ip: cleanIp
        }
      );

      if (!res || !res.ok || !res.command_id) {
        if (showToast) showToast(`❌ Không thể gửi lệnh probe: ${res?.error || 'Lỗi không xác định'}`, 'error');
        return;
      }

      if (pollCommandStatus) {
        pollCommandStatus(
          res.command_id,
          `probe_single_${cleanIp}`,
          async (pollData: any) => {
            if (showToast) showToast(`✓ Probe trực tiếp IP ${cleanIp} hoàn tất!`, 'success', 4000);
            try {
              const rawRes = pollData?.result || pollData?.result_payload || pollData?.output || '';
              if (rawRes && typeof rawRes === 'string') {
                let jsonStr = '';
                if (rawRes.includes('__PRINTER_INFO_JSON_START__')) {
                  const match = rawRes.match(/__PRINTER_INFO_JSON_START__([\s\S]*?)__PRINTER_INFO_JSON_END__/);
                  if (match) jsonStr = match[1].trim();
                }
                if (jsonStr) {
                  const pInfo = JSON.parse(jsonStr);
                  if (pInfo && pInfo.ip) {
                    await fetchApi('/api/new-devices', {
                      method: 'POST',
                      body: JSON.stringify({
                        lan_uid: selectedLan?.lan_uid || 'default',
                        devices: [pInfo]
                      })
                    });
                  }
                }
              }
            } catch (e) {
              console.error("Lỗi parse printer info từ probe result:", e);
            }
            if (fetchLanSitesData) await fetchLanSitesData(true);
          },
          (errPayload: any) => {
            const errMsg = typeof errPayload === 'object' ? (errPayload?.error || errPayload?.message) : errPayload;
            if (showToast) showToast(`[-] Lỗi khi probe trực tiếp IP ${cleanIp}: ${errMsg}`, 'error');
          },
          `⏳ Agent (${agentUid}) đang kiểm tra & probe trực tiếp IP ${cleanIp}...`
        );
      }
    } catch (err: any) {
      if (showToast) showToast(`❌ Lỗi kết nối gửi lệnh probe: ${err.message}`, 'error');
    }

    setActiveTab('copiers');
  };

  const handleApplyPublicIp = async (ipVal: string) => {
    const cleanIp = (ipVal || '').trim();
    setSelectedPublicIp(cleanIp);
    localStorage.removeItem('goxprint_selected_lan_uid');
    if (setSelectedLanUid) setSelectedLanUid('');
    if (cleanIp) {
      localStorage.setItem('goxprint_selected_public_ip', cleanIp);
      localStorage.setItem('gox_connect_public_ip', cleanIp);
    } else {
      localStorage.removeItem('goxprint_selected_public_ip');
      localStorage.removeItem('gox_connect_public_ip');
    }
    if (fetchLanSitesData) {
      await fetchLanSitesData(true);
    }
  };

  const dynamicPlaceholder = myClientIp
    ? `IP Public máy này: ${myClientIp}`
    : 'Nhập IP Public kết nối (VD: 116.98.0.59)...';

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
          {toasts.map((t) => {
            const isSuccess = t.type === 'success';
            const isError = t.type === 'error';
            const isWarning = t.type === 'warning';
            const color = isSuccess
              ? 'var(--color-success, #10b981)'
              : isError
              ? 'var(--color-error, #ef4444)'
              : isWarning
              ? 'var(--color-warning, #f59e0b)'
              : 'var(--color-text-secondary, #94a3b8)';
            const borderColor = isSuccess
              ? 'rgba(16, 185, 129, 0.4)'
              : isError
              ? 'rgba(239, 68, 68, 0.4)'
              : isWarning
              ? 'rgba(245, 158, 11, 0.4)'
              : 'rgba(255, 255, 255, 0.15)';
            const icon = isSuccess ? '✔' : isError ? '✖' : isWarning ? '⚠' : '⏳';

            return (
              <motion.div
                key={t.id}
                style={{
                  ...styles.toast,
                  cursor: 'pointer',
                  border: `1px solid ${borderColor}`,
                  color,
                }}
                initial={{ opacity: 0, x: 15, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 15, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                onClick={() => {
                  if (setToasts) {
                    setToasts((prev: any[]) => prev.filter((item: any) => item.id !== t.id));
                  }
                }}
              >
                <span style={{ fontSize: '0.75rem', lineHeight: 1 }}>{icon}</span>
                <span>{t.message}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* FIXED HEADER BLOCK */}
      <div ref={fixedHeaderRef} style={styles.fixedHeader}>
        <div style={styles.header}>
          <h1 style={styles.title}>🛠️ Quản lý Mạng LAN</h1>
        </div>

        {/* Public IP LAN Input filter with Enter & Plane button */}
        <div style={styles.filterBar}>
          <label style={styles.filterLabel}>🌐 IP Public LAN:</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, maxWidth: '420px' }}>
            <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
              <input
                ref={inputIpRef}
                type="text"
                value={inputIpDraft}
                onChange={(e) => setInputIpDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleApplyPublicIp(inputIpDraft);
                  }
                }}
                placeholder={dynamicPlaceholder}
                style={{
                  width: '100%',
                  padding: !isDirectIpMode
                    ? ((selectedPublicIp || inputIpDraft) ? '8px 74px 8px 12px' : '8px 42px 8px 12px')
                    : ((selectedPublicIp || inputIpDraft) ? '8px 40px 8px 12px' : '8px 12px 8px 12px'),
                  fontSize: '0.88rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: 'rgba(0, 0, 0, 0.4)',
                  color: '#fff',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'padding 0.2s',
                }}
              />
              {(selectedPublicIp || inputIpDraft) && (
                <button
                  onClick={() => {
                    setInputIpDraft('');
                    handleApplyPublicIp('');
                    inputIpRef.current?.focus();
                  }}
                  title="Xóa IP Public"
                  style={{
                    position: 'absolute',
                    right: !isDirectIpMode ? '40px' : '8px',
                    background: 'transparent',
                    color: '#ef4444',
                    border: 'none',
                    boxShadow: 'none',
                    width: '24px',
                    height: '24px',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    lineHeight: 1,
                    transition: 'all 0.2s',
                  }}
                >
                  ✕
                </button>
              )}
              {!isDirectIpMode && (
                <button
                  onClick={async () => {
                    const targetIp = (inputIpDraft || '').trim();
                    if (targetIp) {
                      await handleApplyPublicIp(targetIp);
                    }
                    if (selectedLan) {
                      triggerLanScan(selectedLan, true);
                    } else {
                      if (!targetIp && showToast) {
                        showToast('Chưa có mạng LAN nào được kết nối. Vui lòng nhập IP Public!', 'warning', 3500);
                      }
                      if (fetchLanSitesData) {
                        fetchLanSitesData(true);
                      }
                    }
                  }}
                  title="Gửi & Kết nối IP Public (Enter)"
                  style={{
                    position: 'absolute',
                    right: '4px',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)'
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 2L11 13" />
                    <path d="M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Checkbox option to enter internal IP directly */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
            <input
              type="checkbox"
              id="enable-direct-ip-checkbox"
              checked={isDirectIpMode}
              onChange={(e) => {
                const checked = e.target.checked;
                setIsDirectIpMode(checked);
                localStorage.setItem('goxprint_direct_ip_mode', String(checked));
                if (!checked) {
                  setInternalIpDraft('');
                  handleApplyInternalIp('');
                }
              }}
              style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--color-primary)' }}
            />
            <label
              htmlFor="enable-direct-ip-checkbox"
              style={{ fontSize: '0.8rem', color: 'var(--color-text)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
            >
              Lựa chọn nhập trực tiếp IP nội bộ máy photo
            </label>
          </div>

          {/* Conditional Internal IP input with Plane button */}
          {isDirectIpMode && (
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, maxWidth: '420px' }}>
                <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                  <input
                    ref={inputInternalIpRef}
                    type="text"
                    value={internalIpDraft}
                    onChange={(e) => setInternalIpDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleExecuteDirectPrinterProbe(internalIpDraft);
                      }
                    }}
                    placeholder="Nhập IP nội bộ photo (VD: 192.168.1.155)..."
                    style={{
                      width: '100%',
                      padding: (targetInternalIp || internalIpDraft) ? '8px 74px 8px 12px' : '8px 42px 8px 12px',
                      fontSize: '0.88rem',
                      borderRadius: '8px',
                      border: '1px solid rgba(59, 130, 246, 0.5)',
                      background: 'rgba(0, 0, 0, 0.4)',
                      color: '#fff',
                      outline: 'none',
                      boxSizing: 'border-box',
                      transition: 'padding 0.2s',
                    }}
                  />
                  {(targetInternalIp || internalIpDraft) && (
                    <button
                      onClick={() => {
                        setInternalIpDraft('');
                        handleApplyInternalIp('');
                        inputInternalIpRef.current?.focus();
                      }}
                      title="Xóa IP nội bộ"
                      style={{
                        position: 'absolute',
                        right: '40px',
                        background: 'transparent',
                        color: '#ef4444',
                        border: 'none',
                        boxShadow: 'none',
                        width: '24px',
                        height: '24px',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        lineHeight: 1,
                        transition: 'all 0.2s',
                      }}
                    >
                      ✕
                    </button>
                  )}
                  <button
                    onClick={() => {
                      handleExecuteDirectPrinterProbe(internalIpDraft);
                    }}
                    title="Gửi lệnh Probe trực tiếp IP nội bộ máy in này (Enter)"
                    style={{
                      position: 'absolute',
                      right: '4px',
                      background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '0.88rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 2px 6px rgba(59, 130, 246, 0.3)'
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 2L11 13" />
                      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
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
            💻 Máy tính ({selectedLan?.agents?.filter((a: any) => a.is_agent_active).length ?? 0})
          </button>
          <button
            style={{
              ...styles.tabBtn,
              color: activeTab === 'copiers' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              borderBottom: activeTab === 'copiers' ? '2px solid var(--color-primary)' : '2px solid transparent',
            }}
            onClick={() => {
              setActiveTab('copiers');
            }}
          >
            🖨️ Photocopy ({filteredPrinters.length})
          </button>
        </div>
      </div>

      {/* Content Area with Top Margin to avoid overlapping the fixed header */}
      <div style={{ ...styles.scrollableContent, marginTop: `${headerHeight + 12}px` }}>
        {lanSitesLoading && (
          <div style={styles.loadingWrapper}>
            <LoadingSpinner size="md" />
          </div>
        )}

          {!lanSitesLoading && selectedLan && (
            <AnimatePresence mode="wait">
              {activeTab === 'agents' && <AgentsTab {...propsToPass} />}
              {activeTab === 'copiers' && <CopiersTab {...propsToPass} />}
            </AnimatePresence>
          )}
        </div>

            <AgentModals {...propsToPass} />
    </motion.div>
  );
}


export default AgentPage;
