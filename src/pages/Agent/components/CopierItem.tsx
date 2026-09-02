// @ts-nocheck
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { styles } from '../AgentStyles';
import { GlowCard } from '../../../components/ui/GlowCard';
import { ScanDestinations } from './ScanDestinations';
import { fetchApi, triggerAgentUtilityExec } from '../../../api/mockAgentApi';

export interface CopierItemProps {
  handleRefetchAddressBook: (pTarget: any) => void;
  onClearCache?: () => void;
  expandedDrivers: Record<string, boolean>;
  setExpandedDrivers?: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  expandedDriverMenus: Record<string, boolean>;
  setExpandedDriverMenus?: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  handleRemoteInstallDriver?: (printerId: string, brand: string, model: string, drName: string, drUrl: string, suggestedDrivers?: any[]) => void;
  setPublicFtpData: React.Dispatch<React.SetStateAction<any>>;

  p: any;
  selectedLan: any;
  activeAgentUid: string;
  selectedAgentUid: string;
  copierCredentials: Record<string, any>;
  setCopierCredentials: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  saveAuthLoading: Record<string, boolean>;
  handleSaveAuth: (p: any) => void;
  isExpanded: boolean;
  handleCopierClick: (id: string) => void;
  onlineAgents: any[];
  showToast: (msg: string, type: 'info' | 'success' | 'error' | 'pending', dur?: number) => void;
  fetchRemotePage: (ip: string, path: string, method: string, body: any, force: boolean, agentUid: string, port: number) => void;
  setRemoteLockPrinter: React.Dispatch<React.SetStateAction<any>>;
  setActiveModal: React.Dispatch<React.SetStateAction<any>>;
  hasAddressList: boolean;
  sync: any;
  commandStatus: Record<string, any>;
  getDestinationStatus: (entry: any) => any;
  handleOpenStorageFiles: (lanUid: string, destVal: string) => void;
  handleEditIP: (pId: string, entry: any) => void;
  handleDeleteDest: (pId: string, entry: any) => void;
}

export function CopierItem({
  p,
  selectedLan,
  activeAgentUid,
  selectedAgentUid,
  copierCredentials,
  setCopierCredentials,
  saveAuthLoading,
  handleSaveAuth,
  isExpanded,
  handleCopierClick,
  onlineAgents,
  showToast,
  fetchRemotePage,
  setRemoteLockPrinter,
  setActiveModal,
  hasAddressList,
  sync,
  commandStatus,
  getDestinationStatus,
  handleOpenStorageFiles,
  handleEditIP,
  handleDeleteDest,

  handleRefetchAddressBook,
  onClearCache,
  expandedDrivers,
  setExpandedDrivers,
  expandedDriverMenus,
  setExpandedDriverMenus,
  handleRemoteInstallDriver,
  setPublicFtpData,
}: CopierItemProps) {
  const [showSelectAgentModal, setShowSelectAgentModal] = React.useState(false);
  const [showAuthModal, setShowAuthModal] = React.useState(false);
  const [selectedAgentForSync, setSelectedAgentForSync] = React.useState<string>('');

  React.useEffect(() => {
    const defaultUid = p?.agent_uid || activeAgentUid || selectedAgentUid || (onlineAgents && onlineAgents[0]?.agent_uid) || '';
    setSelectedAgentForSync(defaultUid);
  }, [p, activeAgentUid, selectedAgentUid, onlineAgents]);

  const isPending = commandStatus[p.id]?.isPending || false;
  const statusMsg = commandStatus[p.id]?.message || '';

  const macKey = p.mac_address || '';
  const ipKey = p.ip || '';
  const idKey = String(p.id !== undefined && p.id !== null ? p.id : '');

  const cmdStatusObj = 
    (macKey && commandStatus?.[macKey]) ||
    (ipKey && commandStatus?.[ipKey]) ||
    (idKey && commandStatus?.[idKey]);

  const hasValidList = (obj: any) => obj && (Array.isArray(obj.address_list) || (obj.address_book_data && Array.isArray(obj.address_book_data.address_list)));
  const getObjTime = (obj: any) => {
    if (!obj) return 0;
    const ts = obj.timestamp || obj.updated_at || obj.last_seen || 0;
    const t = new Date(ts).getTime();
    return isNaN(t) ? 0 : t;
  };

  const dbSyncObj = hasValidList(sync) ? sync : null;
  const cmdSyncObj = hasValidList(cmdStatusObj?.address_book_sync) ? cmdStatusObj.address_book_sync : (hasValidList(cmdStatusObj) ? cmdStatusObj : null);

  const activeSyncObj = (() => {
    if (dbSyncObj && cmdSyncObj) {
      return getObjTime(cmdSyncObj) >= getObjTime(dbSyncObj) ? cmdSyncObj : dbSyncObj;
    }
    return cmdSyncObj || dbSyncObj || {};
  })();
  const pType = String(p.printer_type || p.type || p.name || p.printer_name || '').toLowerCase();
  const brandName = pType.includes('ricoh') ? 'Ricoh' : (pType.includes('toshiba') ? 'Toshiba' : (pType.includes('fujifilm') ? 'Fuji Xerox' : 'Generic'));
  const modelName = p.name || p.printer_name || 'Photocopy';

  const effectiveDrivers = (p.suggested_drivers && Array.isArray(p.suggested_drivers)) ? p.suggested_drivers : [];

  const pKey = String(p.id !== undefined && p.id !== null ? p.id : (p.mac_id || p.mac_address || p.ip || 'copier'));
  const hasDrivers = true;
  const driversExpanded = Boolean(expandedDrivers[pKey] || (p.id !== undefined && expandedDrivers[p.id]) || (p.mac_id && expandedDrivers[p.mac_id]) || (p.mac_address && expandedDrivers[p.mac_address]) || (p.ip && expandedDrivers[p.ip]));
  const rawAddressList = (() => {
    if (Array.isArray(activeSyncObj?.address_list) && activeSyncObj.address_list.length > 0) return activeSyncObj.address_list;
    if (activeSyncObj?.address_book_data && Array.isArray(activeSyncObj.address_book_data.address_list)) return activeSyncObj.address_book_data.address_list;
    if (Array.isArray(sync?.address_list) && sync.address_list.length > 0) return sync.address_list;
    if (sync?.address_book_data && Array.isArray(sync.address_book_data.address_list)) return sync.address_book_data.address_list;

    const candidates = [
      activeSyncObj?.result,
      activeSyncObj?.result_payload,
      activeSyncObj?.raw,
    ];

    for (const cand of candidates) {
      if (!cand) continue;
      if (Array.isArray(cand)) return cand;
      if (typeof cand === 'object' && Array.isArray(cand.address_list)) return cand.address_list;
      if (typeof cand === 'string') {
        let cleanCand = cand.trim();
        if (cleanCand.includes('__ADDRESS_BOOK_JSON_START__')) {
          try {
            cleanCand = cleanCand.split('__ADDRESS_BOOK_JSON_START__')[1].split('__ADDRESS_BOOK_JSON_END__')[0].trim();
            cleanCand = cleanCand.replace(/^(\n|\r|\\n|\\r)+|(\n|\r|\\n|\\r)+$/g, '').trim();
          } catch {}
        }
        try {
          const parsed = JSON.parse(cleanCand);
          if (parsed && Array.isArray(parsed.address_list)) return parsed.address_list;
          if (Array.isArray(parsed)) return parsed;
        } catch {}
      }
    }
    return [];
  })();

  const realAddressList = rawAddressList.filter((entry: any) => {
    if (!entry || typeof entry !== 'object') return false;
    if (entry.type === 'Summary') return false;
    const name = (entry.name || '').trim();
    if (name === 'Summary' || name === 'Total' || name.startsWith('Users:')) return false;
    return Boolean(name || entry.entry_id || (entry.registration_no && entry.registration_no !== '-') || entry.email_address || entry.email || entry.folder || entry.physical_path);
  });

  const effectiveSync = {
    ...activeSyncObj,
    address_list: rawAddressList,
    status: rawAddressList.length > 0 ? 'success' : (activeSyncObj?.status || 'none'),
    timestamp: commandStatus?.[p.id]?.timestamp || activeSyncObj?.timestamp || new Date().toISOString(),
  };

  const effectiveHasAddressList = realAddressList.length > 0 || hasAddressList;
  const syncCount = realAddressList.length;
  const syncTime = effectiveSync.timestamp ? new Date(effectiveSync.timestamp).toLocaleTimeString('vi-VN') : '';
  const handleChangeFtp = React.useCallback(async (printer: any, entry: any) => {
    const prType = String(printer.printer_type || printer.type || printer.printer_name || printer.name || "").toLowerCase();
    const isRicoh = prType.includes('ricoh');
    const isToshiba = prType.includes('toshiba');
    if (!isRicoh && !isToshiba) {
      showToast('Thiết bị không hỗ trợ thay đổi FTP', 'error');
      return;
    }

    const cmdName = isToshiba ? 'toshiba_change_ftp' : 'ricoh_change_ftp';
    const agent = selectedLan?.agents?.find((a: any) => a.is_agent_active) || selectedLan?.agents?.[0];
    const currentIp = agent?.local_ip || agent?.ip || "";
    if (!currentIp) {
      showToast('Không tìm thấy IP của Agent để cập nhật', 'error');
      return;
    }

    const currentFolder = entry.folder || entry.physical_path || entry.folder_path || '';
    const ftpMatch = currentFolder.match(/ftp:\/\/([^:/]+)/);
    const smbMatch = currentFolder.match(/^\\\\([^\\]+)/);
    const ricohMatch = currentFolder.match(/^([^:/]+):/);
    let prevIp = '';
    if (ftpMatch) {
      prevIp = ftpMatch[1];
    } else if (smbMatch) {
      prevIp = smbMatch[1];
    } else if (ricohMatch) {
      prevIp = ricohMatch[1];
    }

    if (!prevIp) {
      prevIp = currentIp;
    }

    const targetId = entry.registration_no || entry.id || "";
    const targetName = entry.name || entry.username || entry.display_name || "";
    const printerIp = printer.ip || printer.printer_ip || "";

    showToast('Cập nhật FTP...', 'info');

    let authUser = printer.auth_user || printer.username || "";
    let authPass = printer.auth_password || printer.password || "";

    try {
      const resCreds = await fetchApi(`/api/devices/credentials-map?t=${Date.now()}`);
      if (resCreds && resCreds.ok && resCreds.credentials) {
        const macKey = (printer.mac_id || printer.mac_address || '').toUpperCase().replace(/[^0-9A-F:]/g, '');
        const normMacKey = macKey.replace(/[:-]/g, '');
        const ipKey = printerIp;
        const matched = (macKey && resCreds.credentials[macKey]) || (normMacKey && resCreds.credentials[normMacKey]) || (ipKey && resCreds.credentials[ipKey]);
        if (matched) {
          authUser = matched.user || matched.auth_user || authUser;
          authPass = matched.password || matched.auth_password || authPass;
        }
      }
    } catch (e) {}

    if (!authUser) {
      showToast('Chưa có tài khoản Web Admin máy in', 'error');
      return;
    }

    try {
      const res = await triggerAgentUtilityExec(selectedAgentUid, cmdName, "", {
        printer_ip: printerIp,
        auth_user: authUser,
        auth_password: authPass,
        target_id: targetId,
        target_name: targetName,
        old_ip: prevIp,
        new_ip: currentIp
      });

      if (res && res.ok) {
        showToast('Cập nhật FTP', 'success');
      } else {
        showToast('Cập nhật FTP thất bại', 'error');
      }
    } catch (err: any) {
      showToast('Cập nhật FTP thất bại', 'error');
    }
  }, [selectedAgentUid, selectedLan, showToast]);

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
                                <span style={styles.copierTitle}>
                                  🖨️ {(p.printer_name && p.printer_name.trim()) || p.name || p.ip || "Thiết bị Photocopy"}
                                </span>
                                <div style={styles.copierSubtitle}>
                                  IP: {p.ip} · MAC: {p.mac_id || '—'}
                                  {p.agent_uid && (
                                    <span style={{ marginLeft: '12px', color: '#38bdf8', fontSize: '0.78rem', fontWeight: 600 }}>
                                      📡 Agent: <strong>{p.agent_uid}</strong>
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span
                                style={{
                                  ...styles.statusBadge,
                                  color: !p.probed ? '#ffa502' : (p.is_online ? 'var(--color-status-online)' : 'var(--color-status-offline)'),
                                  borderColor: !p.probed ? '#ffa502' : (p.is_online ? 'var(--color-status-online)' : 'var(--color-status-offline)'),
                                  background: !p.probed ? 'rgba(255, 165, 2, 0.08)' : (p.is_online ? 'rgba(0, 255, 136, 0.08)' : 'rgba(255, 68, 102, 0.08)'),
                                }}
                              >
                                {!p.probed ? '⏳ ĐANG XÁC ĐỊNH...' : (p.is_online ? 'ONLINE' : 'OFFLINE')}
                              </span>
                            </div>
  
                            {/* Connection Credentials Button */}
                            <div style={styles.sectionBlock}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={styles.sectionBlockTitle}>🔐 Tài khoản Web máy in:</span>
                                <button
                                  style={{ ...styles.smallBtn, padding: '6px 12px', fontSize: '0.78rem', fontWeight: 600, borderColor: '#3b82f6', color: '#3b82f6', background: 'rgba(59, 130, 246, 0.08)', cursor: 'pointer' }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowAuthModal(true);
                                  }}
                                >
                                  🔑 Nhập & Lưu Auth
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
                                                        {/* Sync Status & Address Book Panel */}
                            <div
                              style={{
                                ...styles.syncStatusBox,
                                flexDirection: 'column',
                                alignItems: 'stretch',
                                gap: '10px',
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
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <span style={styles.syncStatusTitle}>Trạng thái đồng bộ danh bạ:</span>
                                     {isPending ? (
                                       <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>{statusMsg}</span>
                                     ) : effectiveHasAddressList ? (
                                       <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                                         ✔ Đồng bộ OK ({syncCount} mục) {syncTime ? ` • ${syncTime}` : ''}
                                       </span>
                                     ) : sync.status === 'error' ? (
                                       <span style={{ color: 'var(--color-error)' }}>
                                         ❌ Lỗi: {sync.error} {syncTime ? `(${syncTime})` : ''}
                                       </span>
                                     ) : (
                                       <span style={{ color: 'var(--color-text-secondary)' }}>Chưa có thông tin danh bạ</span>
                                     )}
                                   </div>

                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <button
                                    style={{ ...styles.smallBtn, padding: '6px 10px', fontSize: '0.75rem', height: 'auto' }}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      onClearCache?.();
                                      setShowSelectAgentModal(true);
                                    }}
                                    disabled={isPending || onlineAgents.length === 0}
                                  >
                                    🔄 {effectiveSync.status === 'success' ? 'Cập nhật' : 'Đồng bộ'}
                                  </button>
                                </div>
                              </div>

                              {/* Embedded Scan Destinations list */}
                              {effectiveHasAddressList && (
                                <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '10px' }}>
                                  <ScanDestinations
                                    hasAddressList={effectiveHasAddressList}
                                    sync={effectiveSync}
                                    p={p}
                                    commandStatus={commandStatus}
                                    getDestinationStatus={getDestinationStatus}
                                    selectedLan={selectedLan}
                                    handleOpenStorageFiles={handleOpenStorageFiles}
                                    handleEditIP={handleEditIP}
                                    handleDeleteDest={handleDeleteDest}
                                    handleChangeFtp={handleChangeFtp}
                                   />
                                 </div>
                               )}
                             </div>
  
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
                                  const targetAgent = selectedAgentUid || p.agent_uid || activeAgentUid || (selectedLan?.agents?.[0]?.agent_uid) || '';
                                  if (!targetAgent) {
                                    showToast('Không tìm thấy Agent nào trong dải mạng LAN này', 'error');
                                    return;
                                  }
                                  fetchRemotePage(targetAgent, p.ip, '/');
                                }}
                                disabled={!selectedLan || !selectedLan.agents || selectedLan.agents.length === 0}
                                title="Xem trực tiếp trang quản trị Web Setting (Port 80)"
                              >
                                🌐 Web setting
                              </button>
  
                              <button
                                style={{ ...styles.smallBtn, flex: 1, justifyContent: 'center', fontSize: '0.8rem', padding: '8px 12px', display: 'flex', alignItems: 'center', borderColor: '#60a5fa', color: '#60a5fa' }}
                                onClick={() => {
                                  if (setExpandedDrivers) {
                                    setExpandedDrivers((prev: any) => ({
                                      ...prev,
                                      [pKey]: !driversExpanded,
                                      [p.id]: !driversExpanded,
                                      [p.ip]: !driversExpanded
                                    }));
                                  }
                                  if (effectiveDrivers && effectiveDrivers.length > 0 && setExpandedDriverMenus) {
                                    setExpandedDriverMenus((prev: any) => {
                                      const nextState = { ...prev };
                                      effectiveDrivers.forEach((_: any, idx: number) => {
                                        nextState[`${pKey}-${idx}`] = true;
                                        nextState[`${p.id}-${idx}`] = true;
                                      });
                                      return nextState;
                                    });
                                  }
                                  if (handleRemoteInstallDriver) {
                                    const firstDrv = effectiveDrivers[0]?.drivers?.[0];
                                    handleRemoteInstallDriver(
                                      p.mac_id || p.mac_address || p.ip || p.id,
                                      effectiveDrivers[0]?.brand || p.printer_type || 'Ricoh',
                                      effectiveDrivers[0]?.model || p.name || p.printer_name || 'Photocopy',
                                      firstDrv?.name || '',
                                      firstDrv?.url || '',
                                      effectiveDrivers || [],
                                      p.ip || '',
                                      p.mac_id || p.mac_address || ''
                                    );
                                  }
                                }}
                                title="Xem và cài đặt Driver máy in tự động cho các máy tính trong mạng LAN"
                              >
                                💻 Cài driver
                              </button>
  
                              {pType.includes('ricoh') && (p.name || p.printer_name || '').toLowerCase().includes('6503') && (
                                <button
                                  style={{ ...styles.smallBtn, flex: 1, justifyContent: 'center', fontSize: '0.8rem', padding: '8px 12px', display: 'flex', alignItems: 'center', borderColor: '#34d399', color: '#34d399', opacity: 0.5, cursor: 'not-allowed' }}
                                  onClick={() => showToast('Tính năng này đang được khóa', 'info')}
                                  disabled={true}
                                  title="Tính năng đang khóa"
                                >
                                  🔒 Remote Panel
                                </button>
                              )}
  
                              {pType.includes('toshiba') && (
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
  
                          </GlowCard>

                          {/* Agent Selection Modal for Address Book Refetch */}
                          <AnimatePresence>
                            {showSelectAgentModal && (
                              <div
                                style={{
                                  position: 'fixed',
                                  top: 0,
                                  left: 0,
                                  right: 0,
                                  bottom: 0,
                                  background: 'rgba(0, 0, 0, 0.75)',
                                  zIndex: 99999,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  padding: '16px',
                                  backdropFilter: 'blur(4px)'
                                }}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                              >
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                  style={{
                                    background: '#121827',
                                    border: '1px solid rgba(255, 255, 255, 0.15)',
                                    borderRadius: '16px',
                                    padding: '24px',
                                    maxWidth: '480px',
                                    width: '100%',
                                    boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <div>
                                      <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
                                        📖 Chọn Agent thực thi Cập nhật danh bạ
                                      </h3>
                                      <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                                        Máy photo: <strong style={{ color: '#60a5fa' }}>{p.printer_name || p.name || p.ip}</strong> ({p.ip})
                                      </div>
                                    </div>
                                    <button
                                      style={{ background: 'transparent', border: 'none', color: '#999', fontSize: '1.4rem', cursor: 'pointer', padding: '4px 8px' }}
                                      onClick={() => setShowSelectAgentModal(false)}
                                    >
                                      &times;
                                    </button>
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '280px', overflowY: 'auto', marginBottom: '20px', paddingRight: '4px' }}>
                                    {onlineAgents.length === 0 ? (
                                      <div style={{ padding: '16px', textAlign: 'center', color: '#ef4444', fontSize: '0.85rem' }}>
                                        ⚠️ Không có Agent nào đang Online để thực thi lệnh.
                                      </div>
                                    ) : (
                                      onlineAgents.map((ag: any) => {
                                        const currentUid = selectedAgentForSync || (onlineAgents[0]?.agent_uid || '');
                                        const isSelected = currentUid === ag.agent_uid;
                                        const isDefault = ag.agent_uid === p.agent_uid;
                                        return (
                                          <div
                                            key={ag.agent_uid || ag.id}
                                            onClick={() => setSelectedAgentForSync(ag.agent_uid)}
                                            style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'space-between',
                                              padding: '12px 14px',
                                              borderRadius: '10px',
                                              border: isSelected ? '2px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.08)',
                                              background: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                                              cursor: 'pointer',
                                              transition: 'all 0.2s'
                                            }}
                                          >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                              <div style={{
                                                width: '18px',
                                                height: '18px',
                                                borderRadius: '50%',
                                                border: isSelected ? '5px solid #3b82f6' : '2px solid #666',
                                                background: '#fff',
                                                boxSizing: 'border-box'
                                              }} />
                                              <div>
                                                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#fff' }}>
                                                  🖥️ {ag.hostname || ag.agent_uid}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#aaa', marginTop: '2px' }}>
                                                  IP: {ag.local_ip || '127.0.0.1'} · Port: {ag.web_port || 9173}
                                                </div>
                                              </div>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                              <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', fontWeight: 600 }}>
                                                Online
                                              </span>
                                              {isDefault && (
                                                <span style={{ fontSize: '0.65rem', color: '#60a5fa', fontWeight: 600 }}>
                                                  (Gợi ý mặc định)
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>

                                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                    <button
                                      style={{
                                        padding: '8px 16px',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(255, 255, 255, 0.15)',
                                        background: 'transparent',
                                        color: '#ccc',
                                        fontSize: '0.82rem',
                                        cursor: 'pointer'
                                      }}
                                      onClick={() => setShowSelectAgentModal(false)}
                                    >
                                      Hủy
                                    </button>
                                    <button
                                      style={{
                                        padding: '8px 18px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: '#3b82f6',
                                        color: '#fff',
                                        fontSize: '0.82rem',
                                        fontWeight: 600,
                                        cursor: onlineAgents.length === 0 ? 'not-allowed' : 'pointer',
                                        opacity: onlineAgents.length === 0 ? 0.5 : 1
                                      }}
                                      disabled={onlineAgents.length === 0}
                                      onClick={() => {
                                        setShowSelectAgentModal(false);
                                        handleRefetchAddressBook(p, selectedAgentForSync);
                                      }}
                                    >
                                      🚀 Thực thi Cập nhật
                                    </button>
                                  </div>
                                </motion.div>
                              </div>
                            )}

                             {showAuthModal && (
                               <div
                                 style={{
                                   position: 'fixed',
                                   top: 0,
                                   left: 0,
                                   right: 0,
                                   bottom: 0,
                                   backgroundColor: 'rgba(0, 0, 0, 0.75)',
                                   backdropFilter: 'blur(4px)',
                                   zIndex: 9999,
                                   display: 'flex',
                                   alignItems: 'center',
                                   justifyContent: 'center',
                                   padding: '16px'
                                 }}
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   setShowAuthModal(false);
                                 }}
                               >
                                 <motion.div
                                   initial={{ opacity: 0, scale: 0.95 }}
                                   animate={{ opacity: 1, scale: 1 }}
                                   exit={{ opacity: 0, scale: 0.95 }}
                                   style={{
                                     background: '#1e293b',
                                     border: '1px solid rgba(255, 255, 255, 0.15)',
                                     borderRadius: '16px',
                                     width: '100%',
                                     maxWidth: '420px',
                                     padding: '20px',
                                     boxSizing: 'border-box',
                                     display: 'flex',
                                     flexDirection: 'column',
                                     gap: '16px',
                                     boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                                     color: '#f8fafc'
                                   }}
                                   onClick={(e) => e.stopPropagation()}
                                 >
                                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                     <div>
                                       <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#38bdf8' }}>
                                         🔐 Tài khoản Web Admin Máy In
                                       </h3>
                                       <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px', fontFamily: 'monospace' }}>
                                         IP: {p.ip} · MAC: {p.mac_id || p.mac_address || '—'}
                                       </div>
                                     </div>
                                     <button
                                       style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1 }}
                                       onClick={() => setShowAuthModal(false)}
                                     >
                                       ×
                                     </button>
                                   </div>

                                   <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                       <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#cbd5e1' }}>
                                         Tên đăng nhập Web Admin:
                                       </label>
                                       <input
                                         type="text"
                                         style={{
                                           fontSize: '0.85rem',
                                           padding: '10px 12px',
                                           background: '#0f172a',
                                           color: '#f8fafc',
                                           border: '1px solid #334155',
                                           borderRadius: '8px',
                                           width: '100%',
                                           boxSizing: 'border-box'
                                         }}
                                         placeholder="admin"
                                         autoComplete="new-password"
                                         name={`printer_user_${p.id}`}
                                         value={copierCredentials[p.id]?.user || ''}
                                         onChange={(e) =>
                                           setCopierCredentials((prev) => ({
                                             ...prev,
                                             [p.id]: { ...prev[p.id], user: e.target.value },
                                           }))
                                         }
                                       />
                                     </div>

                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                       <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#cbd5e1' }}>
                                         Mật khẩu Web Admin:
                                       </label>
                                       <input
                                         type="password"
                                         style={{
                                           fontSize: '0.85rem',
                                           padding: '10px 12px',
                                           background: '#0f172a',
                                           color: '#f8fafc',
                                           border: '1px solid #334155',
                                           borderRadius: '8px',
                                           width: '100%',
                                           boxSizing: 'border-box'
                                         }}
                                         placeholder="mật khẩu"
                                         autoComplete="new-password"
                                         name={`printer_pass_${p.id}`}
                                         value={copierCredentials[p.id]?.pass || ''}
                                         onChange={(e) =>
                                           setCopierCredentials((prev) => ({
                                             ...prev,
                                             [p.id]: { ...prev[p.id], pass: e.target.value },
                                           }))
                                         }
                                       />
                                     </div>
                                   </div>

                                   <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                                     <button
                                       style={{
                                         padding: '8px 16px',
                                         borderRadius: '8px',
                                         border: '1px solid rgba(255, 255, 255, 0.15)',
                                         background: 'transparent',
                                         color: '#ccc',
                                         fontSize: '0.82rem',
                                         cursor: 'pointer'
                                       }}
                                       onClick={() => setShowAuthModal(false)}
                                     >
                                       Hủy
                                     </button>
                                     <button
                                       style={{
                                         padding: '8px 18px',
                                         borderRadius: '8px',
                                         border: 'none',
                                         background: '#3b82f6',
                                         color: '#fff',
                                         fontSize: '0.82rem',
                                         fontWeight: 600,
                                         cursor: saveAuthLoading[p.id] ? 'not-allowed' : 'pointer',
                                         opacity: saveAuthLoading[p.id] ? 0.6 : 1
                                       }}
                                       disabled={saveAuthLoading[p.id]}
                                       onClick={() => {
                                         handleSaveAuth(p);
                                         setShowAuthModal(false);
                                       }}
                                     >
                                       {saveAuthLoading[p.id] ? 'Đang lưu...' : '💾 Lưu Auth'}
                                     </button>
                                   </div>
                                 </motion.div>
                               </div>
                             )}
                          </AnimatePresence>
                        </div>
  );
}
