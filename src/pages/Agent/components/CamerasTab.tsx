// @ts-nocheck
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { styles } from '../AgentPageStyles';
import { GlowCard } from '../../../components/ui/GlowCard';
import { AnimatedList } from '../../../components/ui/AnimatedList';
import { safePathToken } from '../utils/agentUtils';
import { CopierItem } from './CopierItem';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';

export function CamerasTab(props: any) {
  const {
    AgentPage,
    activeAgentUid,
    activeLoadingFile,
    activeModal,
    activeTab,
    allocatedVncAddr,
    cameraFiles,
    cameraForm,
    cameraLogs,
    cameraStatus,
    cameraTestLoading,
    cameraTestResult,
    cameras,
    camerasLoading,
    commandStatus,
    confirmModal,
    copierCredentials,
    customRecordDuration,
    customRunCommand,
    deleteScanPointModal,
    directLan,
    editIpModalData,
    editableSettingsText,
    emailFileCounts,
    executeRemoteInstallDriver,
    expandedDriverMenus,
    expandedDrivers,
    expandedPrinters,
    fetchCameraFiles,
    fetchCameraStatus,
    fetchCameras,
    fetchRemotePage,
    fetchRemotePageOld,
    ftpDetailData,
    getDestinationStatus = () => ({ label: '✔ ACTIVE', type: 'success', title: '' }),
    getDestinationStatusHtml = () => ({ label: '✔ ACTIVE', type: 'success', title: '' }),
    getLiveQueryTimestamp,
    handleAddPrivateFtp,
    handleAddPublicFtp,
    handleCloseWebPreview,
    handleConfirmDeleteScanPoint,
    handleCopierClick,
    handleDeleteCamera,
    handleDeleteCameraFile,
    handleDeleteDest,
    handleEditIP,
    handleFetchEntryDetail,
    handleHistoryBack,
    handleHistoryForward,
    handleOpenStorageFiles,
    handlePlaySegmentFile,
    handleQueryVideo,
    handleRecord30s,
    handleRefetchAddressBook,
    handleRemoteInstallDriver,
    handleSaveAuth,
    handleSaveCameraConfig,
    handleSaveEditIP,
    handleSaveSettings,
    handleStartToshibaVnc,
    handleTestCameraConnection,
    handleToggleDirectLan,
    handleViewScanPointsJson,
    installDriverModal,
    ipInputModal,
    isRecording30s,
    isSavingSettings,
    lanSites,
    lanSitesLoading,
    liveAddressBooks,
    lockAspect,
    onlineAgents,
    pollCommandStatus,
    previewBlobUrl,
    privateFtpData,
    privateFtpLoading,
    publicFtpData,
    publicFtpLoading,
    queriedVideoUrl,
    queryDuration,
    queryTimestamp,
    queryVideoLoading,
    recording30sCountdown,
    remoteLockPrinter,
    resolveRelativePath,
    saveAuthLoading,
    savedLocal,
    scaleX,
    scaleY,
    scanAutoOpenDir,
    scanAutoOpenFile,
    scanPointsViewerModal,
    selectedCamera,
    selectedCameraAgentUid,
    selectedLan,
    selectedLanUid,
    selectedTargetAgents,
    selectedUtilityAgent,
    setActiveLoadingFile,
    setActiveModal,
    setActiveTab,
    setAllocatedVncAddr,
    setCameraFiles,
    setCameraForm,
    setCameraLogs,
    setCameraStatus,
    setCameraTestLoading,
    setCameraTestResult,
    setCameras,
    setCamerasLoading,
    setCommandStatus,
    setConfirmModal,
    setCopierCredentials,
    setCustomRecordDuration,
    setCustomRunCommand,
    setDeleteScanPointModal,
    setDirectLan,
    setEditIpModalData,
    setEditableSettingsText,
    setEmailFileCounts,
    setExpandedDriverMenus,
    setExpandedDrivers,
    setExpandedPrinters,
    setFtpDetailData,
    setInstallDriverModal,
    setIpInputModal,
    setIsRecording30s,
    setIsSavingSettings,
    setLanSites,
    setLanSitesLoading,
    setLiveAddressBooks,
    setLockAspect,
    setPreviewBlobUrl,
    setPrivateFtpData,
    setPrivateFtpLoading,
    setPublicFtpData,
    setPublicFtpLoading,
    setQueriedVideoUrl,
    setQueryDuration,
    setQueryTimestamp,
    setQueryVideoLoading,
    setRecording30sCountdown,
    setRemoteLockPrinter,
    setSaveAuthLoading,
    setScaleX,
    setScaleY,
    setScanAutoOpenDir,
    setScanAutoOpenFile,
    setScanPointsViewerModal,
    setSelectedCamera,
    setSelectedCameraAgentUid,
    setSelectedLanUid,
    setSelectedTargetAgents,
    setSelectedUtilityAgent,
    setSettingsSaveStatus,
    setShowPreviewDetails,
    setShowSettings,
    setStorageFiles,
    setStorageLoading,
    setStorageModalData,
    setToasts,
    setToshibaVncData,
    setUtilityActionPending,
    setUtilityCommands,
    setUtilityCommandsLoading,
    setUtilitySettingsLoading,
    setUtilityStatusMsg,
    setViewOutputModal,
    setVncTunnelLoading,
    setWebPreviewHistory,
    setWebPreviewHistoryIndex,
    setWebPreviewLoading,
    setWebPreviewModal,
    setWebPreviewTab,
    settingsSaveStatus,
    showPreviewDetails,
    showSettings,
    storageFiles,
    storageLoading,
    storageModalData,
    toasts,
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

  return (
    <>
      {/* CamerasTab */}

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
            
    </>
  );
}
