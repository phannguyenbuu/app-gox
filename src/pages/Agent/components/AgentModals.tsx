// @ts-nocheck
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { styles } from '../AgentPageStyles';
import { GlowCard } from '../../../components/ui/GlowCard';
import { AnimatedList } from '../../../components/ui/AnimatedList';
import { safePathToken } from '../utils/agentUtils';
import { CopierItem } from './CopierItem';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { fetchApi } from '../../../api/mockAgentApi';

const defaultFormatJsonText = (val: any) => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return val;
      }
    }
  }
  return String(val);
};

function ImageZoomViewer({ src, alt }: { src: string; alt?: string }) {
  const [scale, setScale] = React.useState(1);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragStart, setDragStart] = React.useState({ x: 0, y: 0 });

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.25, 5));
  const handleZoomOut = () => {
    setScale((s) => {
      const next = Math.max(s - 0.25, 1);
      if (next === 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  };
  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 0.15 : -0.15;
    setScale((prevScale) => {
      const newScale = Math.min(Math.max(prevScale + zoomFactor, 1), 5);
      if (newScale === 1) setPosition({ x: 0, y: 0 });
      return newScale;
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleDoubleClick = () => {
    if (scale > 1) {
      handleReset();
    } else {
      setScale(2.5);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        minHeight: 0,
        width: '100%',
        position: 'relative',
        background: '#090d16',
        borderRadius: '8px',
        border: '1px solid var(--color-surface-light)',
        overflow: 'hidden',
        userSelect: 'none'
      }}
      onWheel={handleWheel}
    >
      <div
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'rgba(18, 18, 26, 0.85)',
          backdropFilter: 'blur(8px)',
          border: '1px solid var(--color-surface-light)',
          borderRadius: '8px',
          padding: '4px 8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
        }}
      >
        <button
          type="button"
          onClick={handleZoomOut}
          disabled={scale <= 1}
          style={{
            background: 'none',
            border: 'none',
            color: scale <= 1 ? 'var(--color-text-secondary)' : 'var(--color-text)',
            cursor: scale <= 1 ? 'not-allowed' : 'pointer',
            fontSize: '0.85rem',
            padding: '2px 6px',
            borderRadius: '4px'
          }}
          title="Thu nhỏ (-)"
        >
          🔍-
        </button>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-primary)', minWidth: '42px', textAlign: 'center' }}>
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          onClick={handleZoomIn}
          disabled={scale >= 5}
          style={{
            background: 'none',
            border: 'none',
            color: scale >= 5 ? 'var(--color-text-secondary)' : 'var(--color-text)',
            cursor: scale >= 5 ? 'not-allowed' : 'pointer',
            fontSize: '0.85rem',
            padding: '2px 6px',
            borderRadius: '4px'
          }}
          title="Phóng to (+)"
        >
          🔍+
        </button>
        <button
          type="button"
          onClick={handleReset}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            fontSize: '0.85rem',
            padding: '2px 6px',
            borderRadius: '4px'
          }}
          title="Đặt lại (Reset)"
        >
          🔄
        </button>
      </div>

      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      >
        <img
          src={src}
          alt={alt || 'Screenshot'}
          style={{
            maxWidth: '100%',
            maxHeight: '70vh',
            borderRadius: '6px',
            objectFit: 'contain',
            boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transition: isDragging ? 'none' : 'transform 0.15s ease-out',
            transformOrigin: 'center center'
          }}
          draggable={false}
        />
      </div>
    </div>
  );
}

function WimFullscreenModal({
  webPreviewModal,
  handleCloseWebPreview,
  directLan,
  webPreviewLoading,
  previewIframeRef,
  previewBlobUrl
}: any) {
  const [scale, setScale] = React.useState(1);

  const iframeSrc = webPreviewModal.url
    ? webPreviewModal.url
    : (directLan ? `http://${webPreviewModal.ip}${webPreviewModal.path || '/'}` : previewBlobUrl);

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.25, 4));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.25, 1));
  const handleReset = () => setScale(1);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || scale > 1) {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 0.15 : -0.15;
      setScale((prevScale) => Math.min(Math.max(prevScale + zoomFactor, 1), 4));
    }
  };

  return (
    <div
      className="web-preview-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 250,
        background: '#090d16',
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Floating Control Bar */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          right: '16px',
          zIndex: 999,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(15, 23, 42, 0.92)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          borderRadius: '10px',
          padding: '6px 12px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
          userSelect: 'none'
        }}
      >
        {/* Info Label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--color-text)', fontWeight: 600, paddingRight: '4px' }}>
          <span style={{ color: '#10b981' }}>🟢</span>
          <span>{webPreviewModal.title || 'WIM'}</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>
            ({webPreviewModal.ip})
          </span>
        </div>

        <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.15)', margin: '0 2px' }} />

        {/* Zoom Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={scale <= 1}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: scale <= 1 ? 'rgba(255,255,255,0.3)' : 'white',
              cursor: scale <= 1 ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem',
              padding: '3px 8px',
              borderRadius: '6px'
            }}
            title="Thu nhỏ (-)"
          >
            🔍-
          </button>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-primary)', minWidth: '42px', textAlign: 'center' }}>
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={scale >= 4}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: scale >= 4 ? 'rgba(255,255,255,0.3)' : 'white',
              cursor: scale >= 4 ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem',
              padding: '3px 8px',
              borderRadius: '6px'
            }}
            title="Phóng to (+)"
          >
            🔍+
          </button>
          <button
            type="button"
            onClick={handleReset}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              padding: '3px 8px',
              borderRadius: '6px'
            }}
            title="Đặt lại (Reset Zoom)"
          >
            🔄
          </button>
        </div>

        <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.15)', margin: '0 2px' }} />

        {/* Force Refresh Tunnel / Page */}
        <button
          type="button"
          onClick={() => {
            if (previewIframeRef && previewIframeRef.current) {
              const currentSrc = previewIframeRef.current.src;
              const cleanUrl = currentSrc.split('#')[0].replace(/([?&])_t=\d+/, '');
              const separator = cleanUrl.includes('?') ? '&' : '?';
              previewIframeRef.current.src = cleanUrl + separator + `_t=${Date.now()}`;
            }
          }}
          style={{
            background: 'rgba(16, 185, 129, 0.2)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            color: '#34d399',
            cursor: 'pointer',
            fontSize: '0.76rem',
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
          title="Bắt buộc nạp lại trang WIM từ máy in qua Tunnel"
        >
          ⚡ Nạp lại (Tunnel)
        </button>

        {/* External Tab */}
        <button
          type="button"
          onClick={() => window.open(webPreviewModal.url || `http://${webPreviewModal.ip}/`, '_blank')}
          style={{
            background: 'rgba(59, 130, 246, 0.2)',
            border: '1px solid rgba(59, 130, 246, 0.4)',
            color: '#60a5fa',
            cursor: 'pointer',
            fontSize: '0.76rem',
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
          title="Mở sang tab trình duyệt mới"
        >
          ↗️ Tab mới
        </button>

        {/* Close Button */}
        <button
          type="button"
          onClick={handleCloseWebPreview}
          style={{
            background: '#ef4444',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            fontSize: '0.82rem',
            fontWeight: 700,
            padding: '4px 12px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            boxShadow: '0 2px 8px rgba(239,68,68,0.4)'
          }}
          title="Đóng modal WIM"
        >
          ✕ Đóng
        </button>
      </div>

      {/* Body Area */}
      <div
        style={{
          flex: 1,
          width: '100vw',
          height: '100vh',
          overflow: scale > 1 ? 'auto' : 'hidden',
          background: 'white',
          position: 'relative'
        }}
        onWheel={handleWheel}
      >
        {webPreviewModal.html === 'LOADING' ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              gap: '14px',
              background: '#090d16',
              color: 'white'
            }}
          >
            <svg
              style={{
                width: '42px',
                height: '42px',
                color: 'var(--color-primary)',
                animation: 'spin 1s linear infinite'
              }}
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>
              Đang kết nối đến WIM ({webPreviewModal.ip})...
            </span>
          </div>
        ) : webPreviewModal.html && webPreviewModal.html.startsWith('ERROR:') ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              gap: '14px',
              padding: '24px',
              background: '#090d16',
              color: 'var(--color-error)'
            }}
          >
            <span style={{ fontSize: '3rem' }}>⚠️</span>
            <span style={{ fontSize: '1rem', fontWeight: 700 }}>
              Lỗi kết nối Web Setting từ Agent
            </span>
            <pre style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, padding: '16px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)', maxWidth: '600px', width: '100%', fontFamily: 'monospace' }}>
              {webPreviewModal.html.replace('ERROR:', '').trim()}
            </pre>
          </div>
        ) : (
          <div
            style={{
              width: scale > 1 ? `${100 * scale}%` : '100%',
              height: scale > 1 ? `${100 * scale}%` : '100%',
              transform: scale > 1 ? `scale(${scale})` : 'none',
              transformOrigin: 'top left',
              transition: 'transform 0.15s ease-out',
              position: 'relative'
            }}
          >
            <iframe
              ref={previewIframeRef}
              src={iframeSrc}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                background: 'white'
              }}
            />
            {webPreviewLoading && (
              <div
                style={{
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
                }}
              >
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
                  <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span style={{ fontSize: '0.85rem', color: 'white', fontWeight: 600 }}>
                  Đang nạp dữ liệu trang...
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function AgentModals(props: any) {
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
    confirmModal = { isOpen: false },
    accessDeniedState = { isOpen: false, ip: '' },
    copierCredentials,
    customRecordDuration,
    customRunCommand,
    deleteScanPointModal = { isOpen: false },
    directLan,
    editIpModalData = { isOpen: false },
    editableSettingsText,
    emailFileCounts,
    executeRemoteInstallDriver,
    expandedDriverMenus,
    expandedDrivers,
    expandedPrinters,
    fetchCameraFiles,
    fetchCameraStatus,
    fetchRemotePage,
    fetchRemotePageOld,
    formatBytes,
    formatJsonText: propFormatJsonText,
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
    handleEmergencyRestart,
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
    handleToggleSetting,
    handleTriggerUtility,
    handleTriggerUtilityExec,
    handleViewScanPointsJson,
    installDriverModal = { isOpen: false },
    ipInputModal = { isOpen: false },
    isRecording30s,
    isSavingSettings,
    lanSites,
    lanSitesLoading,
    liveAddressBooks,
    lockAspect,
    modalContentRef,
    pollCommandStatus,
    previewBlobUrl,
    previewIframeRef,
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
    scanPointsViewerModal = { isOpen: false },
    selectedCamera,
    selectedCameraAgentUid,
    selectedLan,
    selectedLanUid,
    selectedTargetAgents,
    selectedUtilityAgent,
    setAccessDeniedState,
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
    showToast,
    storageFiles,
    storageLoading,
    storageModalData = { isOpen: false },
    toasts,
    toshibaVncData,
    utilityActionPending,
    utilityCommands,
    utilityCommandsLoading,
    utilitySettingsLoading,
    utilityStatusMsg,
    viewOutputModal = { isOpen: false },
    vncTunnelLoading,
    webPreviewHistory,
    webPreviewHistoryIndex,
    webPreviewLoading,
    webPreviewModal = { isOpen: false },
    webPreviewTab
  } = props;

  const [inputPublicIp, setInputPublicIp] = React.useState('');
  const [isConnectingIp, setIsConnectingIp] = React.useState(false);
  const [ipErrorMsg, setIpErrorMsg] = React.useState('');
  const formatJsonText = typeof propFormatJsonText === 'function' ? propFormatJsonText : defaultFormatJsonText;

  React.useEffect(() => {
    if (viewOutputModal?.isOpen) {
      setTimeout(() => {
        if (modalContentRef && modalContentRef.current) {
          modalContentRef.current.scrollTop = 0;
        }
      }, 100);
    }
  }, [viewOutputModal?.isOpen]);

  React.useEffect(() => {
    if (installDriverModal?.isOpen) {
      const isSuggestedEmpty = !installDriverModal.suggestedDrivers || installDriverModal.suggestedDrivers.length === 0;
      if (isSuggestedEmpty && typeof setInstallDriverModal === 'function') {
        const query = installDriverModal.model || installDriverModal.brand || installDriverModal.printerId || '';
        if (query) {
          fetchApi(`/api/v1/match-drivers?name=${encodeURIComponent(query)}`)
            .then((res: any) => {
              if (res && res.matches && Array.isArray(res.matches) && res.matches.length > 0) {
                const firstCat = res.matches[0];
                const firstDrv = firstCat?.drivers?.[0];
                setInstallDriverModal((prev: any) => ({
                  ...prev,
                  suggestedDrivers: res.matches,
                  brand: prev.brand || firstCat?.brand || 'ricoh',
                  model: prev.model || firstCat?.model || 'Photocopy',
                  driverName: prev.driverName || firstDrv?.name || '',
                  driverUrl: prev.driverUrl || firstDrv?.url || '',
                }));
              }
            })
            .catch(() => {});
        }
      }
    }
  }, [installDriverModal?.isOpen, installDriverModal?.printerId, installDriverModal?.model, installDriverModal?.brand]);

  React.useEffect(() => {
    if (accessDeniedState?.isOpen) {
      const savedIp = localStorage.getItem('gox_connect_public_ip') || '';
      setInputPublicIp(savedIp || accessDeniedState.ip || '');
      setIpErrorMsg('');
    }
  }, [accessDeniedState?.isOpen, accessDeniedState?.ip]);

  const handleConnectWithPublicIp = async (targetIpOverride?: any) => {
    const targetIp = (typeof targetIpOverride === 'string' ? targetIpOverride : inputPublicIp || accessDeniedState?.ip || '').trim();
    if (!targetIp) {
      setIpErrorMsg('Vui lòng nhập Public IP hợp lệ');
      return;
    }
    setIsConnectingIp(true);
    setIpErrorMsg('');
    try {
      localStorage.setItem('gox_connect_public_ip', targetIp);
      await fetchApi('/api/public-ips', {
        method: 'POST',
        body: JSON.stringify({
          ip_address: targetIp,
          description: 'Allowed from App-Gox Modal',
          enabled: true,
        }),
      }).catch((e) => console.log('Allowed IP API response:', e));

      if (setAccessDeniedState) {
        setAccessDeniedState({ isOpen: false, ip: '' });
      }
      if (props.fetchLanSitesData) {
        await props.fetchLanSitesData(true);
      }
    } catch (err: any) {
      console.error('Error connecting public IP:', err);
      // Always store override and proceed to connect
      localStorage.setItem('gox_connect_public_ip', targetIp);
      if (setAccessDeniedState) {
        setAccessDeniedState({ isOpen: false, ip: '' });
      }
      if (props.fetchLanSitesData) {
        await props.fetchLanSitesData(true);
      }
    } finally {
      setIsConnectingIp(false);
    }
  };

  return (
    <>
      {/* AgentModals */}
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
                          .filter((a) => a.is_agent_active)
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
                      
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                        {/* Dynamic commands from JSON — thêm lệnh mới vào utility_commands.json trên VPS là xong */}
                        {utilityCommandsLoading ? (
                          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--color-text-secondary)', padding: '8px 0', justifyContent: 'center' }}>
                            <LoadingSpinner size="sm" /> Đang tải danh sách lệnh...
                          </div>
                        ) : (
                          <>
                            {utilityCommands.length > 0 ? (
                              (() => {
                                const filtered = utilityCommands.filter((cmd: any) => cmd.command !== 'dxdiag' && cmd.is_visible !== false);
                                const syncIdx = filtered.findIndex((cmd: any) => cmd.command === 'sync_all_scanpoints');
                                if (syncIdx > -1) {
                                  const [syncCmd] = filtered.splice(syncIdx, 1);
                                  filtered.unshift(syncCmd);
                                }

                                const handleOpenWim = async () => {
                                  const agentUid = selectedUtilityAgent?.agent_uid;
                                  if (!agentUid) return;
                                  handleTriggerUtilityExec('open_printagentx_wim', `import webbrowser\nwebbrowser.open("http://localhost:9173")`);
                                  try {
                                    const BASE_URL = import.meta.env.VITE_API_URL || 'https://agentapi.quanlymay.com';
                                    const res = await fetch(`${BASE_URL}/api/agents/${encodeURIComponent(agentUid)}/tunnel/start`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ printer_ip: '127.0.0.1', printer_port: 9173 })
                                    });
                                    const data = await res.json();
                                    const tunnelUrl = data?.url || data?.url_port || '';

                                    if (setWebPreviewModal) {
                                      setWebPreviewModal({
                                        isOpen: true,
                                        title: `🌐 WIM PrintAgentX — Agent ${selectedUtilityAgent?.hostname || agentUid}`,
                                        ip: selectedUtilityAgent?.local_ip || '127.0.0.1',
                                        path: '/',
                                        html: 'DIRECT_LAN',
                                        url: tunnelUrl ? `https://printagentx.com/?tunnel_url=${encodeURIComponent(tunnelUrl)}` : `https://printagentx.com`,
                                        agentUid: agentUid
                                      });
                                    }
                                  } catch (err) {
                                    console.error('Failed to start agent web tunnel:', err);
                                    if (setWebPreviewModal) {
                                      setWebPreviewModal({
                                        isOpen: true,
                                        title: `🌐 WIM PrintAgentX — Agent ${selectedUtilityAgent?.hostname || agentUid}`,
                                        ip: selectedUtilityAgent?.local_ip || '127.0.0.1',
                                        path: '/',
                                        html: 'DIRECT_LAN',
                                        url: `https://printagentx.com`,
                                        agentUid: agentUid
                                      });
                                    }
                                  }
                                };

                                return filtered.map((cmd: any) => {
                                  const isEmergency = cmd.command === 'emergency_restart';
                                  let labelText = cmd.label;
                                  let iconText = cmd.icon || '🔧';
                                  let clickHandler = () => handleTriggerUtilityExec(cmd.command, cmd.command_content);

                                  if (cmd.command === 'open_web_setting') {
                                    labelText = 'Mở WIM';
                                    iconText = cmd.icon || '🌐';
                                    clickHandler = handleOpenWim;
                                  } else if (cmd.command === 'create_scan_shortcut') {
                                    labelText = 'Tạo shortcut Desktop';
                                    iconText = cmd.icon || '🔗';
                                  } else if (cmd.command === 'emergency_restart') {
                                    labelText = 'Emergency Kill';
                                    iconText = cmd.icon || '🔌';
                                    clickHandler = handleEmergencyRestart;
                                  } else if (cmd.command === 'check_watchdog') {
                                    labelText = 'Check watchdog';
                                    iconText = cmd.icon || '🩺';
                                    clickHandler = () => {
                                      if (!selectedUtilityAgent) return;
                                      setUtilityActionPending('check_watchdog');
                                      setUtilityStatusMsg({ text: '⌛ Đang kiểm tra watchdog...', isError: false });
                                      triggerAgentUtilityExec(selectedUtilityAgent.agent_uid, 'check_watchdog', cmd.command_content || '')
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
                                    };
                                  }

                                  return (
                                    <button
                                      key={cmd.command}
                                      onClick={clickHandler}
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
                                        {utilityActionPending === cmd.command ? <LoadingSpinner size="sm" /> : iconText}
                                      </div>
                                      <div style={{
                                        fontSize: '0.72rem',
                                        fontWeight: 600,
                                        color: isEmergency ? '#ef4444' : 'var(--color-text)',
                                        lineHeight: '1.2',
                                        wordBreak: 'word-break',
                                      }}>
                                        {labelText}
                                      </div>
                                    </button>
                                  );
                                })})()
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
                                    wordBreak: 'word-break',
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
                                    wordBreak: 'word-break',
                                  }}>
                                    Thư mục Scan
                                  </div>
                                </button>
                              </>
                            )}
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
                    <h3 style={styles.modalTitle}> Thay đổi IP / Cấu hình FTP</h3>
                    <button style={styles.modalCloseBtn} onClick={() => setActiveModal(null)}>
                      &times;
                    </button>
                  </div>
                  <div style={styles.modalBody}>
                    {/* Row with Agent select and Port input */}
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
                          Chọn nhanh IP từ danh sách Agent:
                        </label>
                        <select
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            background: 'var(--color-surface)',
                            color: 'var(--color-text)',
                            border: '1px solid var(--color-border)',
                            borderRadius: '6px',
                            fontSize: '0.85rem',
                            cursor: 'pointer'
                          }}
                          value=""
                          onChange={(e) => {
                            const selectedVal = e.target.value;
                            if (!selectedVal) return;
                            setEditIpModalData((prev: any) => {
                              if (!prev) return null;
                              const port = prev.newPort || '2130';
                              return {
                                ...prev,
                                newIp: `${selectedVal}:${port}`,
                                newPort: port
                              };
                            });
                          }}
                        >
                          <option value="">-- Chọn Agent --</option>
                          {(selectedLan?.agents || []).map((agent: any, idx: number) => {
                            const ip = agent.local_ip || agent.ip || '';
                            const name = agent.hostname || agent.uid || `Agent ${idx + 1}`;
                            return (
                              <option key={idx} value={ip}>
                                {name} ({ip})
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      <div style={{ width: '100px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
                          Cổng FTP:
                        </label>
                        <input
                          type="text"
                          value={editIpModalData.newPort || ''}
                          onChange={(e) => {
                            const portVal = e.target.value;
                            setEditIpModalData((prev: any) => {
                              if (!prev) return null;
                              let host = prev.newIp || '';
                              if (host.includes(':')) {
                                host = host.split(':')[0];
                              }
                              return {
                                ...prev,
                                newPort: portVal,
                                newIp: portVal ? `${host}:${portVal}` : host
                              };
                            });
                          }}
                          placeholder="2130"
                          style={styles.modalInput}
                        />
                      </div>
                    </div>

                    {/* FTP IP Input */}
                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
                        Địa chỉ FTP (IP:PORT):
                      </label>
                      <input
                        type="text"
                        value={editIpModalData.newIp}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditIpModalData((prev: any) => {
                            if (!prev) return null;
                            let port = prev.newPort || '2130';
                            if (val.includes(':')) {
                              port = val.split(':')[1].trim() || port;
                            }
                            return {
                              ...prev,
                              newIp: val,
                              newPort: port
                            };
                          });
                        }}
                        placeholder="Ví dụ: 192.168.1.100:2130"
                        style={styles.modalInput}
                      />
                    </div>

                    <div style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)', marginTop: '8px', fontStyle: 'italic' }}>
                      Đường dẫn hiện tại trên máy in: {editIpModalData.entry.folder || editIpModalData.entry.physical_path || editIpModalData.entry.folder_path}
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
                      onClick={() => {
                        const finalIp = (editIpModalData.newIp || '').trim();
                        if (!finalIp.includes(':')) {
                          showToast('Yêu cầu nhập thủ công phải đi kèm cổng FTP (Ví dụ: 192.168.1.100:2130)', 'error');
                          return;
                        }
                        handleSaveEditIP();
                      }}
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
                          showToast('Khóa máy...', 'info', 2000);
                          modifyDeviceAddressss({
                            ip: remoteLockPrinter.ip,
                            action: 'lock_machine',
                            agent_uid: remoteLockPrinter.agentUid,
                          })
                            .then((res: any) => {
                              if (res.ok) {
                                showToast('Khóa máy', 'success');
                              } else {
                                showToast('Khóa máy thất bại', 'error');
                              }
                            })
                            .catch((err: any) => {
                              showToast('Khóa máy thất bại', 'error');
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
                          showToast('Mở khóa máy...', 'info', 2000);
                          modifyDeviceAddressss({
                            ip: remoteLockPrinter.ip,
                            action: 'enable_machine',
                            agent_uid: remoteLockPrinter.agentUid,
                          })
                            .then((res: any) => {
                              if (res.ok) {
                                showToast('Mở khóa máy', 'success');
                              } else {
                                showToast('Mở khóa thất bại', 'error');
                              }
                            })
                            .catch((err: any) => {
                              showToast('Mở khóa thất bại', 'error');
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

      {/* 5.5 ACCESS DENIED MODAL */}
      <AnimatePresence>
        {accessDeniedState.isOpen && (
          <div style={styles.confirmOverlay}>
            <motion.div
              style={{
                ...styles.confirmModalCard,
                maxWidth: '460px',
                width: '90%',
                textAlign: 'center',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                background: 'rgba(24, 24, 32, 0.98)',
                padding: '28px 24px',
                borderRadius: '16px',
                boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
              }}
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <div style={{ fontSize: '2.8rem', marginBottom: '10px' }}>🌐</div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f87171', margin: '0 0 8px 0' }}>
                Cảnh báo Public IP / Cho phép kết nối
              </h3>
              <p style={{ fontSize: '0.86rem', color: '#9ca3af', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                Public IP hiện tại của trình duyệt (<strong>{accessDeniedState.ip || 'Chưa xác định'}</strong>) chưa có trong danh sách được kết nối với Agent.
              </p>

              {/* Input section */}
              <div style={{ textAlign: 'left', marginBottom: '16px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e5e7eb', display: 'block', marginBottom: '6px' }}>
                  Nhập Public IP muốn kết nối với Agent:
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={inputPublicIp}
                    onChange={(e) => setInputPublicIp(e.target.value)}
                    placeholder="Ví dụ: 116.98.0.59 hoặc *"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      fontSize: '0.9rem',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'rgba(0,0,0,0.4)',
                      color: '#fff',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                {ipErrorMsg && (
                  <div style={{ fontSize: '0.78rem', color: '#ef4444', marginTop: '6px' }}>
                    ⚠️ {ipErrorMsg}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  onClick={() => handleConnectWithPublicIp()}
                  disabled={isConnectingIp}
                  style={{
                    width: '100%',
                    padding: '11px 16px',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: isConnectingIp ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                  }}
                >
                  {isConnectingIp ? <LoadingSpinner size="sm" /> : 'Kết nối Public IP'}
                </button>

                <button
                  onClick={() => {
                    window.location.href = '/dashboard';
                  }}
                  style={{
                    width: '100%',
                    padding: '9px 16px',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    background: 'transparent',
                    color: '#9ca3af',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  Quay về Dashboard ↗
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DELETE SCAN POINT MODAL WITH TARGET AGENT DROPDOWN */}
      <AnimatePresence>
        {deleteScanPointModal.isOpen && (
          <div style={styles.confirmOverlay} onClick={() => setDeleteScanPointModal((prev) => ({ ...prev, isOpen: false }))}>
            <motion.div
              style={{ ...styles.confirmModalCard, maxWidth: '440px', width: '90%' }}
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>⚠️ Xác nhận xóa điểm scan</h3>
                <button
                  style={styles.modalCloseBtn}
                  onClick={() => setDeleteScanPointModal((prev) => ({ ...prev, isOpen: false }))}
                >
                  &times;
                </button>
              </div>

              <div style={styles.modalBody}>
                <div style={{ marginBottom: '14px', color: 'var(--color-text)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                  Tên điểm scan: <strong>"{deleteScanPointModal.entry?.name || deleteScanPointModal.entry?.name_1 || deleteScanPointModal.entry?.email_address || deleteScanPointModal.entry?.folder || deleteScanPointModal.entry?.registration_no || 'không tên'}"</strong>
                  {deleteScanPointModal.entry?.registration_no && (
                    <span style={{ display: 'block', color: 'var(--color-muted)', fontSize: '0.78rem', marginTop: '2px' }}>
                      Mã đăng ký: #{deleteScanPointModal.entry?.registration_no}
                    </span>
                  )}
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Relay Agent thực thi *</label>
                  <select
                    style={styles.modalInput}
                    value={deleteScanPointModal.agentUid}
                    onChange={(e) => setDeleteScanPointModal((p) => ({ ...p, agentUid: e.target.value }))}
                  >
                    {((selectedLan && selectedLan.agents) || [])
                      .filter((a) => a.is_agent_active)
                      .map((a) => (
                        <option key={a.agent_uid} value={a.agent_uid}>
                          {a.hostname} ({a.local_ip})
                        </option>
                      ))}
                  </select>
                  <span style={styles.formHelpText}>Chọn máy Agent trong mạng LAN sẽ gửi lệnh xóa tới máy photocopy.</span>
                </div>
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
                  onClick={handleConfirmDeleteScanPoint}
                >
                  Xác nhận xóa
                </button>
                <button
                  style={{
                    ...styles.smallBtn,
                    padding: '10px 16px',
                    fontSize: '0.82rem',
                    borderColor: 'var(--color-secondary)',
                    color: 'var(--color-secondary)',
                  }}
                  onClick={() => setDeleteScanPointModal((prev) => ({ ...prev, isOpen: false }))}
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
                {/* Driver Catalog Dropdown Selection */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                    📂 chọn phiên bản Driver cần cài đặt (khớp từ Storage catalog):
                  </label>
                  {(() => {
                    const catalogDrivers: { name: string; url: string; label: string; brand: string; model: string }[] = [];
                    if (installDriverModal.suggestedDrivers && Array.isArray(installDriverModal.suggestedDrivers) && installDriverModal.suggestedDrivers.length > 0) {
                      installDriverModal.suggestedDrivers.forEach((catItem: any) => {
                        if (catItem.drivers && Array.isArray(catItem.drivers)) {
                          catItem.drivers.forEach((drv: any) => {
                            catalogDrivers.push({
                              name: drv.name,
                              url: drv.url,
                              brand: catItem.brand || installDriverModal.brand,
                              model: catItem.model || installDriverModal.model,
                              label: `[${String(catItem.brand || installDriverModal.brand || '').toUpperCase()} ${catItem.model || installDriverModal.model}] ${drv.name}`
                            });
                          });
                        }
                      });
                    }

                    if (catalogDrivers.length === 0 && installDriverModal.driverName && installDriverModal.driverUrl) {
                      catalogDrivers.push({
                        name: installDriverModal.driverName,
                        url: installDriverModal.driverUrl,
                        brand: installDriverModal.brand || 'Ricoh',
                        model: installDriverModal.model || 'Photocopy',
                        label: `[${String(installDriverModal.brand || 'RICOH').toUpperCase()} ${installDriverModal.model || ''}] ${installDriverModal.driverName}`
                      });
                    }

                    if (catalogDrivers.length === 0) {
                      return (
                        <div style={{ padding: '10px', fontSize: '0.82rem', color: 'var(--color-error)', fontStyle: 'italic', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px' }}>
                          ⚠️ Không tìm thấy phiên bản driver nào phù hợp trong Storage catalog.
                        </div>
                      );
                    }

                    const currentSelectedUrl = installDriverModal.driverUrl || catalogDrivers[0]?.url || '';

                    return (
                      <select
                        value={currentSelectedUrl}
                        onChange={(e) => {
                          const selected = catalogDrivers.find(d => d.url === e.target.value);
                          if (selected) {
                            setInstallDriverModal((prev: any) => ({
                              ...prev,
                              driverName: selected.name,
                              driverUrl: selected.url,
                              brand: selected.brand || prev.brand,
                              model: selected.model || prev.model
                            }));
                          }
                        }}
                        style={{
                          fontSize: '0.82rem',
                          padding: '8px 10px',
                          background: 'var(--color-bg)',
                          color: 'var(--color-text)',
                          border: '1px solid var(--color-surface-light)',
                          borderRadius: '6px',
                          width: '100%',
                          cursor: 'pointer',
                          fontWeight: 600
                        }}
                      >
                        {catalogDrivers.map((drv, i) => (
                          <option key={i} value={drv.url}>
                            {drv.label}
                          </option>
                        ))}
                      </select>
                    );
                  })()}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                    💻 Chọn Máy đại diện (Agent) để thực hiện cài đặt:
                  </label>
                  {(!selectedLan?.agents || selectedLan.agents.filter((a: any) => a.is_agent_active).length === 0) ? (
                    <div style={{ padding: '10px', fontSize: '0.82rem', color: 'var(--color-text-secondary)', fontStyle: 'italic', background: 'var(--color-input-bg)', border: '1px solid var(--color-border)', borderRadius: '6px' }}>
                      Không có Agent online trong LAN này
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', background: 'var(--color-input-bg)', border: '1px solid var(--color-border)', borderRadius: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                      {selectedLan.agents
                        .filter((a: any) => a.is_agent_active)
                        .map((a: any) => {
                          const isChecked = installDriverModal.selectedAgentUids.includes(a.agent_uid);
                          return (
                            <label key={a.agent_uid} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--color-text)' }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  setInstallDriverModal((prev) => {
                                    const uids = prev.selectedAgentUids;
                                    if (e.target.checked) {
                                      return { ...prev, selectedAgentUids: [...uids, a.agent_uid] };
                                    } else {
                                      return { ...prev, selectedAgentUids: uids.filter((id: string) => id !== a.agent_uid) };
                                    }
                                  });
                                }}
                                style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary)' }}
                              />
                              <span>{a.hostname} ({a.local_ip})</span>
                            </label>
                          );
                        })}
                    </div>
                  )}
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
                  disabled={installDriverModal.selectedAgentUids.length === 0}
                  onClick={() => {
                    const currentModal = installDriverModal;
                    setInstallDriverModal((prev) => ({ ...prev, isOpen: false }));

                    const activeDrvUrl = currentModal.driverUrl || '';
                    const activeDrvName = currentModal.driverName || currentModal.model || 'Driver';
                    const activeBrand = currentModal.brand || 'Ricoh';
                    const activeModel = currentModal.model || 'Photocopy';

                    currentModal.selectedAgentUids.forEach((agentUid: string) => {
                      executeRemoteInstallDriver(
                        currentModal.printerId,
                        activeBrand,
                        activeModel,
                        activeDrvName,
                        activeDrvUrl,
                        agentUid,
                        currentModal.printerIp,
                        currentModal.macId
                      );
                    });
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
                      const changeAllVal = (ipInputModal.changeAllTo || '').trim();
                      if (changeAllVal && !ipPattern.test(changeAllVal)) {
                        setIpInputModal((prev) => ({ ...prev, error: 'IP mới không hợp lệ! Vui lòng nhập đúng dạng x.x.x.x hoặc để trống.' }));
                        return;
                      }
                      const cb = ipInputModal.onConfirm;
                      setIpInputModal((prev) => ({ ...prev, isOpen: false, error: '' }));
                      cb(ipInputModal.value.trim(), changeAllVal);
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

                {ipInputModal.title.includes('Kiểm tra') && (
                  <div style={{ marginTop: '12px' }}>
                    <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', margin: '0 0 6px 0', lineHeight: 1.5 }}>
                      Thay đổi tất cả FTP Scan trùng IP trên thành IP mới (Tùy chọn):
                    </p>
                    <input
                      type="text"
                      value={ipInputModal.changeAllTo || ''}
                      onChange={(e) => setIpInputModal((prev) => ({ ...prev, changeAllTo: e.target.value, error: '' }))}
                      placeholder="Ví dụ: 192.168.1.43"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1.5px solid var(--color-surface-light)',
                        background: 'var(--color-background)',
                        color: 'var(--color-text)',
                        fontSize: '0.9rem',
                        fontFamily: 'monospace',
                        outline: 'none',
                        boxSizing: 'border-box',
                        transition: 'border-color 0.2s',
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = 'var(--color-primary)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = 'var(--color-surface-light)';
                      }}
                    />
                  </div>
                )}

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
                    const changeAllVal = (ipInputModal.changeAllTo || '').trim();
                    if (changeAllVal && !ipPattern.test(changeAllVal)) {
                      setIpInputModal((prev) => ({ ...prev, error: 'IP mới không hợp lệ! Vui lòng nhập đúng dạng x.x.x.x hoặc để trống.' }));
                      return;
                    }
                    const cb = ipInputModal.onConfirm;
                    setIpInputModal((prev) => ({ ...prev, isOpen: false, error: '' }));
                    cb(ipInputModal.value.trim(), changeAllVal);
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
                    ref={modalContentRef}
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
              ) : viewOutputModal.content && (typeof viewOutputModal.content === 'string') && (viewOutputModal.content.trim().startsWith('data:image/') || viewOutputModal.content.trim().startsWith('iVBORw0KGgo')) ? (
                <ImageZoomViewer
                  src={viewOutputModal.content.trim().startsWith('data:image/') ? viewOutputModal.content.trim() : `data:image/png;base64,${viewOutputModal.content.trim()}`}
                  alt={viewOutputModal.title || 'Desktop Screenshot'}
                />
              ) : (
                <pre
                  ref={modalContentRef}
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

      {/* 8. WEB PREVIEW MODAL — Xem trực tiếp Web Setting (WIM Fullscreen with Floating Controls) */}
      <AnimatePresence>
        {webPreviewModal && webPreviewModal.isOpen && (
          <WimFullscreenModal
            webPreviewModal={webPreviewModal}
            handleCloseWebPreview={handleCloseWebPreview}
            directLan={directLan}
            webPreviewLoading={webPreviewLoading}
            previewIframeRef={previewIframeRef}
            previewBlobUrl={previewBlobUrl}
            setWebPreviewModal={setWebPreviewModal}
          />
        )}
      </AnimatePresence>

      {/* 📋 SCAN POINTS JSON VIEWER MODAL */}
      <AnimatePresence>
        {scanPointsViewerModal.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.85)',
              backdropFilter: 'blur(8px)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
            }}
            onClick={() => setScanPointsViewerModal(prev => ({ ...prev, isOpen: false }))}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              style={{
                background: '#121826',
                border: '1px solid rgba(0, 204, 255, 0.3)',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '680px',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(0, 204, 255, 0.05)',
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#00ccff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    📋 Tệp dữ liệu scan_points.json
                  </h3>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                    {scanPointsViewerModal.copierName} · MAC: {scanPointsViewerModal.macId || 'N/A'}
                  </div>
                </div>
                <button
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-secondary)',
                    fontSize: '1.3rem',
                    cursor: 'pointer',
                  }}
                  onClick={() => setScanPointsViewerModal(prev => ({ ...prev, isOpen: false }))}
                >
                  ✕
                </button>
              </div>

              {/* Body */}
              <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
                {scanPointsViewerModal.loading ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: '#00ccff' }}>
                    ⏳ Đang tải nội dung tệp scan_points.json...
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                        Local Agent path: <code style={{ color: '#00ccff' }}>.../GoPrinxAgent/scan_points.json</code>
                      </span>
                      <button
                        style={{
                          background: 'rgba(0, 255, 136, 0.15)',
                          border: '1px solid rgba(0, 255, 136, 0.3)',
                          color: '#00ff88',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                        onClick={() => {
                          navigator.clipboard.writeText(JSON.stringify(scanPointsViewerModal.jsonData, null, 2));
                          showToast('Đã sao chép nội dung scan_points.json!', 'success');
                        }}
                      >
                        📋 Copy JSON
                      </button>
                    </div>

                    <pre
                      style={{
                        background: '#0a0d14',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '8px',
                        padding: '14px',
                        color: '#a0aec0',
                        fontSize: '0.8rem',
                        fontFamily: 'Consolas, Monaco, monospace',
                        overflowX: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        margin: 0,
                        maxHeight: '450px',
                      }}
                    >
                      {JSON.stringify(scanPointsViewerModal.jsonData, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div
                style={{
                  padding: '12px 20px',
                  borderTop: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  background: 'rgba(0,0,0,0.2)',
                }}
              >
                <button
                  style={{
                    background: 'var(--color-surface-light)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff',
                    padding: '8px 18px',
                    borderRadius: '8px',
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                  onClick={() => setScanPointsViewerModal(prev => ({ ...prev, isOpen: false }))}
                >
                  Đóng
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

          </AnimatePresence>
    </>
  );
}
