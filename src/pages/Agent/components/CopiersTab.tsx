// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { styles } from '../AgentPageStyles';
import { AnimatedList } from '../../../components/ui/AnimatedList';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { CopierItem } from './CopierItem';

export function CopiersTab(props: any) {
  const {
    // Handlers & Logic
    setCopierCredentials,
    activeAgentUid,
    activeLoadingFile,
    activeModal,
    activeTab,
    addCameraLoading,
    addressBookModal,
    agentUid,
    agents,
    cameraAgentUid,
    cameraFileFilter,
    cameras,
    camerasLoading,
    canNavigateNext,
    canNavigatePrev,
    commandStatus,
    copierCredentials,
    deleteCameraLoading,
    deleteScanPointModal,
    destToDelete,
    editIpData,
    editIpModal,
    editIpNewIp,
    editIpSaving,
    expandedCopierId,
    expandedDriverMenus,
    expandedDrivers,
    expandedPrinters,
    fetchLanSitesData,
    fetchRemotePage,
    fileTypeFilter,
    filteredPrinters = [],
    targetInternalIp = '',
    getDestinationStatus = () => ({ label: '✔ ACTIVE', type: 'success', title: '' }),
    getTargetAgentUid,
    handleCopierClick,
    handleDeleteDest,
    handleEditIP,
    handleOpenStorageFiles,
    handleRefetchAddressBook,
    handleRemoteInstallDriver,
    handleSaveAuth,
    infoDetailModal,
    installDriverModal,
    installDriverSaving,
    installedCount,
    isAllInstalled,
    lanSites,
    lanSitesLoading,
    liveAddressBooks,
    mockAgentApi,
    newCamIp,
    newCamName,
    newCamPass,
    newCamPort,
    newCamRtsp,
    newCamUser,
    onlineAgents,
    pendingScanPoints,
    printers,
    publicFtpData,
    publicFtpModal,
    publicFtpSaving,
    record30sLoading,
    remoteLockModal,
    remoteLockPrinter,
    saveAuthLoading,
    selectedAgentUid,
    selectedCamera,
    selectedCameraAgentUid,
    selectedLan,
    selectedLanUid,
    setActiveModal,
    setExpandedDriverMenus,
    setExpandedDrivers,
    setPublicFtpData,
    setRemoteLockPrinter,
    showToast,
    storageFilesModal,
    storageFilesModalData,
    storageFilesModalLoading,
    storageFilterDate,
    submittingScanPoint,
    toshibaVncData,
    utilityActionPending,
    utilityCommands,
    utilityCommandsLoading,
    utilitySettingsLoading,
    utilityStatusMsg,
    viewOutputModal,
    vncTunnelLoading,
    webPreviewHistory,
    webPreviewHistoryIndex,
    webPreviewLoading,
    webPreviewModal,
    webPreviewTab
  } = props;

  // Track printers that user clicked "Cập nhật" — show empty immediately until fresh scan arrives
  const [pendingClear, setPendingClear] = useState<Set<string>>(new Set());

  // Auto-remove from pendingClear when liveAddressBooks gets fresh data
  const prevLiveRef = useRef<Record<string, any>>({});
  useEffect(() => {
    const prev = prevLiveRef.current;
    const arrived = Object.keys(liveAddressBooks || {}).filter(k => !prev[k] && (liveAddressBooks as any)[k]);
    if (arrived.length > 0) {
      setPendingClear(cur => {
        if (arrived.some(k => cur.has(k))) {
          const next = new Set(cur);
          arrived.forEach(k => next.delete(k));
          return next;
        }
        return cur;
      });
    }
    prevLiveRef.current = liveAddressBooks || {};
  }, [liveAddressBooks]);

  return (
    <>
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
          <div style={{
            fontSize: '0.85rem',
            color: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            padding: '6px 12px',
            borderRadius: '20px',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span>● Tất cả máy photocopy đều được quản lý tự động qua Agent</span>
          </div>
        </div>

        <AnimatedList
          key={`copiers_list_${selectedLan?.lan_uid || 'default'}_${targetInternalIp || 'all'}_${filteredPrinters.length}`}
          className="copiers-grid"
          style={styles.gridContainer}
        >
          {lanSitesLoading || utilityActionPending === 'force_subnet_scan' || Object.entries(commandStatus || {}).some(([k, c]: [string, any]) => c?.isPending && k.startsWith('scan_lan_')) ? (
            <div style={styles.loadingContainer}>
              <LoadingSpinner />
              <div style={styles.loadingText}>
                {utilityActionPending === 'force_subnet_scan' || Object.entries(commandStatus || {}).some(([k, c]: [string, any]) => c?.isPending && k.startsWith('scan_lan_'))
                  ? '⏳ Đang dò quét mạng LAN tìm máy in & photocopy...'
                  : 'Đang tải dữ liệu thiết bị...'}
              </div>
            </div>
          ) : filteredPrinters.length === 0 ? (
            <div style={styles.emptyStateContainer} key={`empty_${targetInternalIp || 'all'}`}>
              <div style={styles.emptyIcon}>🖨️</div>
              <div style={styles.emptyTitle}>
                {targetInternalIp ? `Không tìm thấy máy photo có IP: ${targetInternalIp}` : 'Chưa có danh sách máy in, hãy nhấn nút khởi tạo'}
              </div>
              <div style={styles.emptySubtitle}>
                {targetInternalIp
                  ? `Không tìm thấy thiết bị nào khớp với IP nội bộ ${targetInternalIp} trong mạng LAN này.`
                  : 'Vui lòng chọn mạng LAN khác hoặc nhấp nút khởi tạo / Dò quét mạng LAN để tìm kiếm thiết bị.'}
              </div>
            </div>
          ) : (
            filteredPrinters.map((p: any) => {
              const isExpanded = String(expandedCopierId) === String(p.id);

              const parseSyncObj = (raw: any) => {
                if (!raw) return null;
                let obj: any = raw;
                if (typeof obj === 'string') {
                  let cleanRaw = obj.trim();
                  if (cleanRaw.includes('__ADDRESS_BOOK_JSON_START__')) {
                    try {
                      cleanRaw = cleanRaw.split('__ADDRESS_BOOK_JSON_START__')[1].split('__ADDRESS_BOOK_JSON_END__')[0].trim();
                      cleanRaw = cleanRaw.replace(/^(\n|\r|\\n|\\r)+|(\n|\r|\\n|\\r)+$/g, '').trim();
                    } catch {}
                  }
                  try { obj = JSON.parse(cleanRaw); } catch { return null; }
                }
                if (typeof obj !== 'object') return null;
                let depth = 0;
                while (obj && typeof obj === 'object' && !Array.isArray(obj.address_list) && obj.address_book_sync && depth < 5) {
                  obj = obj.address_book_sync;
                  depth++;
                }
                return obj;
              };

              const pMac = (p.mac_address || p.mac_id || '').toUpperCase().replace(/-/g, ':');
              const pIdKey = p.id !== undefined && p.id !== null ? String(p.id) : '';
              const pIpKey = p.ip || '';

              // Nếu user vừa click "Cập nhật" → hiện trống ngay, không dùng data cũ
              const isClearing = pendingClear.has(pMac) || pendingClear.has(pIdKey) || pendingClear.has(pIpKey);

              const liveSync = isClearing ? null : parseSyncObj(
                (pMac && liveAddressBooks?.[pMac]) ||
                (pIdKey && liveAddressBooks?.[pIdKey]) ||
                (pIpKey && liveAddressBooks?.[pIpKey]) ||
                null
              );
              // Bỏ dbSync fallback — không dùng p.address_book_sync (VPS DB cũ) làm nguồn hiển thị
              const liveHasList = Boolean(liveSync && Array.isArray(liveSync.address_list));
              const sync = liveHasList ? liveSync : (liveSync || {});

              const realAddressList = Array.isArray(sync.address_list)
                ? sync.address_list.filter((entry: any) => {
                    if (!entry || typeof entry !== 'object') return false;
                    if (entry.type === 'Summary') return false;
                    const name = (entry.name || '').trim();
                    if (name === 'Summary' || name === 'Total' || name.startsWith('Users:')) return false;
                    return Boolean(name || entry.entry_id || (entry.registration_no && entry.registration_no !== '-') || entry.email_address || entry.email || entry.folder || entry.physical_path);
                  })
                : [];
              const hasAddressList = liveHasList;

              const copierOnlineAgents = (selectedLan?.agents || []).filter((a: any) => a.is_agent_active);
              const copierTargetAgentUid = getTargetAgentUid ? getTargetAgentUid(p.id) : (selectedAgentUid || p.agent_uid || '');

              return (
                <CopierItem
                  key={p.id}
                  p={p}
                  selectedLan={selectedLan}
                  activeAgentUid={agentUid}
                  selectedAgentUid={copierTargetAgentUid}
                  copierCredentials={copierCredentials || {}}
                  setCopierCredentials={setCopierCredentials}
                  saveAuthLoading={saveAuthLoading || {}}
                  handleSaveAuth={handleSaveAuth}
                  isExpanded={isExpanded}
                  handleCopierClick={handleCopierClick}
                  onlineAgents={copierOnlineAgents}
                  showToast={showToast || (() => {})}
                  fetchRemotePage={fetchRemotePage || (() => {})}
                  setRemoteLockPrinter={setRemoteLockPrinter}
                  setActiveModal={setActiveModal}
                  hasAddressList={hasAddressList}
                  sync={sync}
                  commandStatus={commandStatus || {}}
                  getDestinationStatus={getDestinationStatus || (() => ({}))}
                  handleOpenStorageFiles={handleOpenStorageFiles || (() => {})}
                  handleEditIP={handleEditIP || (() => {})}
                  handleDeleteDest={handleDeleteDest || (() => {})}
                  handleRefetchAddressBook={handleRefetchAddressBook || (() => {})}
                  onClearCache={() => {
                    // Đánh dấu printer là "đang xóa" → UI hiện trống ngay lập tức
                    setPendingClear(cur => {
                      const next = new Set(cur);
                      if (pMac) next.add(pMac);
                      if (pIdKey) next.add(pIdKey);
                      if (pIpKey) next.add(pIpKey);
                      return next;
                    });
                  }}
                  expandedDrivers={expandedDrivers || {}}
                  setExpandedDrivers={setExpandedDrivers}
                  expandedDriverMenus={expandedDriverMenus || {}}
                  setExpandedDriverMenus={setExpandedDriverMenus}
                  handleRemoteInstallDriver={handleRemoteInstallDriver || (() => {})}
                  setPublicFtpData={setPublicFtpData}
                />
              );
            })
          )}
        </AnimatedList>
      </motion.div>
    </>
  );
}
