// @ts-nocheck
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { styles } from '../AgentPageStyles';
import { GlowCard } from '../../../components/ui/GlowCard';
import { AnimatedList } from '../../../components/ui/AnimatedList';
import { safePathToken } from '../utils/agentUtils';
import { CopierItem } from './CopierItem';
import { triggerAgentUtilityExec, getCommandStatus } from '../../../api/mockAgentApi';

export function AgentsTab(props: any) {
  const {
    AgentPage,
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
    emailFileCounts = {},
    executeRemoteInstallDriver,
    expandedDriverMenus,
    expandedDrivers,
    expandedPrinters,
    fetchCameraFiles,
    fetchCameraStatus,
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
    handleTriggerUtilityExec,
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
    setEmailFileCounts = () => {},
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
      {/* AgentsTab */}

              <motion.div
                key="agents-tab"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                style={styles.tabContent}
              >
                <AnimatedList>
                  {!selectedLan || (selectedLan.agents || []).filter((a: any) => a.is_agent_active).length === 0 ? (
                    <div style={styles.emptyText}>⚠️ Không tìm thấy Agent (máy tính) nào đang kết nối khớp với IP Public này.</div>
                  ) : (
                    (selectedLan.agents || []).filter((a: any) => a.is_agent_active).map((agent: any) => {
                      const isOnline = agent.is_agent_active;
                      return (
                        <GlowCard key={agent.agent_uid}>
                          <div style={styles.cardHeader}>
                            <span style={styles.cardTitle}>💻 {agent.hostname}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {agent.app_version && (
                                <span
                                  style={{
                                    fontSize: '0.72rem',
                                    fontFamily: 'monospace',
                                    fontWeight: 600,
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    background: 'rgba(0, 212, 255, 0.08)',
                                    border: '1px solid rgba(0, 212, 255, 0.25)',
                                    color: 'var(--color-primary)',
                                  }}
                                >
                                  v{agent.app_version}
                                </span>
                              )}
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
                          </div>

                          <div style={styles.cardDetails}>
                            <div style={styles.detailRow}>
                              <span style={styles.detailLabel}>Phiên bản:</span>
                              <span style={{ ...styles.detailValue, fontFamily: 'monospace', fontWeight: 600, color: agent.app_version ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>
                                {agent.app_version ? `v${agent.app_version}` : '—'}
                              </span>
                            </div>
                            <div style={styles.detailRow}>
                              <span style={styles.detailLabel}>UID:</span>
                              <span style={{ ...styles.detailValue, fontFamily: 'monospace', fontSize: '0.75rem' }}>{agent.agent_uid}</span>
                            </div>
                            <div style={styles.detailRow}>
                              <span style={styles.detailLabel}>IP cục bộ:</span>
                              <span style={{ ...styles.detailValue, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {agent.local_ip}
                                <button
                                  title="Làm mới IP cục bộ"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                      const res = await triggerAgentUtilityExec(agent.agent_uid, 'get_agent_ip', '');
                                      if (res.ok && res.command_id) {
                                        if (props.showToast) {
                                          props.showToast('Lấy IP cục bộ...', 'info');
                                        }
                                        const commandId = res.command_id;
                                        const startTime = Date.now();
                                        const timer = setInterval(async () => {
                                          try {
                                            if (Date.now() - startTime > 12000) {
                                              clearInterval(timer);
                                              return;
                                            }
                                            const statusRes = await getCommandStatus(commandId);
                                            if (statusRes.status === 'success') {
                                              clearInterval(timer);
                                              if (props.fetchLanSitesData) {
                                                await props.fetchLanSitesData(true);
                                              }
                                              if (props.showToast) {
                                                props.showToast('Lấy IP cục bộ', 'success');
                                              }
                                            } else if (statusRes.status === 'failed') {
                                              clearInterval(timer);
                                              if (props.showToast) {
                                                props.showToast('Lấy IP thất bại', 'error');
                                              }
                                            }
                                          } catch (pollErr) {
                                            console.error(pollErr);
                                            clearInterval(timer);
                                          }
                                        }, 1000);
                                      } else {
                                        if (props.showToast) {
                                          props.showToast('Lấy IP thất bại', 'error');
                                        }
                                      }
                                    } catch (err: any) {
                                      if (props.showToast) {
                                        props.showToast('Lấy IP thất bại', 'error');
                                      }
                                    }
                                  }}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '0.85rem',
                                    padding: '2px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--color-primary)',
                                    opacity: 0.8,
                                    transition: 'opacity 0.2s',
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                  onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
                                >
                                  🔄
                                </button>
                              </span>
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
                                  const totalCount = agentEmails.reduce((sum: number, em: any) => sum + (emailFileCounts?.[em.email] ?? 0), 0);

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
                                            const count = emailFileCounts?.[em.email] ?? 0;
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
            
    </>
  );
}
