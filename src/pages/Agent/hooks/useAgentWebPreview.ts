// @ts-nocheck
import { useState, useCallback, useRef } from 'react';
import { installDriverOnAgent } from '../../../api/mockAgentApi';

export const useAgentWebPreview = (deps: any = {}) => {
  const { showToast, pollCommandStatus } = deps;

  const [webPreviewModal, setWebPreviewModal] = useState<{
    isOpen: boolean;
    copier: any;
    url: string;
    tunnelUrl: string;
    directUrl: string;
    auth: { user: string; pass: string };
  }>({
    isOpen: false,
    copier: null,
    url: '',
    tunnelUrl: '',
    directUrl: '',
    auth: { user: '', pass: '' }
  });

  const [webPreviewTab, setWebPreviewTab] = useState<'tunnel' | 'direct'>('tunnel');
  const [webPreviewLoading, setWebPreviewLoading] = useState(false);
  const [webPreviewHistory, setWebPreviewHistory] = useState<string[]>([]);
  const [webPreviewHistoryIndex, setWebPreviewHistoryIndex] = useState(-1);
  const [showPreviewDetails, setShowPreviewDetails] = useState(false);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);

  const previewIframeRef = useRef<HTMLIFrameElement>(null);

  const [installDriverModal, setInstallDriverModal] = useState<{
    isOpen: boolean;
    printerId: string;
    copier: any;
    targetAgentUid: string;
    status: string;
    error: string;
  }>({
    isOpen: false,
    printerId: '',
    copier: null,
    targetAgentUid: '',
    status: '',
    error: ''
  });

  const handleCloseWebPreview = useCallback(() => {
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(null);
    }
    setWebPreviewModal((p) => ({ ...p, isOpen: false }));
  }, [previewBlobUrl]);

  const fetchRemotePage = useCallback(async (agentUid: string, printerIp: string, _targetPath = '/') => {
    if (!agentUid) {
      if (showToast) showToast('Không tìm thấy Agent UID', 'error');
      return;
    }

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

    setWebPreviewLoading(true);
    try {
      const BASE_URL = import.meta.env.VITE_API_URL || 'https://agentapi.quanlymay.com';
      const response = await fetch(`${BASE_URL}/api/agents/${agentUid}/tunnel/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printer_ip: printerIp, printer_port: 80 })
      });
      const data = await response.json();
      if (data.ok && data.url) {
        if (wildcardTab) {
          wildcardTab.location.href = data.url;
        }
      } else {
        if (wildcardTab) wildcardTab.close();
        if (showToast) showToast('Kết nối lỗi: ' + (data.error || 'Không thể khởi động đường hầm SSH ngược trên Agent'), 'error');
      }
    } catch (err: any) {
      if (wildcardTab) wildcardTab.close();
      if (showToast) showToast('Lỗi hệ thống VPS: ' + (err.message || err), 'error');
    } finally {
      setWebPreviewLoading(false);
    }
  }, [showToast]);

  const handleHistoryBack = useCallback(() => {
    if (webPreviewHistoryIndex > 0) {
      const prevPath = webPreviewHistory[webPreviewHistoryIndex - 1];
      setWebPreviewHistoryIndex(webPreviewHistoryIndex - 1);
      if (webPreviewModal.copier) {
        fetchRemotePage(webPreviewModal.copier.agent_uid, webPreviewModal.copier.ip, prevPath);
      }
    }
  }, [webPreviewHistoryIndex, webPreviewHistory, webPreviewModal, fetchRemotePage]);

  const handleHistoryForward = useCallback(() => {
    if (webPreviewHistoryIndex < webPreviewHistory.length - 1) {
      const nextPath = webPreviewHistory[webPreviewHistoryIndex + 1];
      setWebPreviewHistoryIndex(webPreviewHistoryIndex + 1);
      if (webPreviewModal.copier) {
        fetchRemotePage(webPreviewModal.copier.agent_uid, webPreviewModal.copier.ip, nextPath);
      }
    }
  }, [webPreviewHistoryIndex, webPreviewHistory, webPreviewModal, fetchRemotePage]);

  const handleRemoteInstallDriver = (printerId: string, copier: any, defaultTargetAgentUid: string) => {
    setInstallDriverModal({
      isOpen: true,
      printerId: String(printerId),
      copier,
      targetAgentUid: defaultTargetAgentUid,
      status: '',
      error: ''
    });
  };

  const executeRemoteInstallDriver = async () => {
    if (!installDriverModal.copier || !installDriverModal.targetAgentUid) return;
    const { printerId, copier, targetAgentUid } = installDriverModal;
    setInstallDriverModal((p) => ({ ...p, status: '⌛ Đang gửi lệnh cài đặt Driver tới Agent...', error: '' }));
    if (showToast) showToast('Đang tạo lệnh tải và cài đặt Driver máy in tự động...', 'info', 3000);

    try {
      const res = await installDriverOnAgent(targetAgentUid, copier.ip, copier.printer_name || copier.name || 'Printer', copier.printer_type || copier.brand || '');
      if (!res.ok || !res.command_id) throw new Error(res.error || 'Không thể tạo lệnh cài driver');

      setInstallDriverModal((p) => ({ ...p, status: '⌛ Agent đang tải gói Driver và tiến hành Silent Install...' }));
      if (pollCommandStatus) {
        pollCommandStatus(
          res.command_id,
          `install_driver_${printerId}`,
          (_pollData: any) => {
            if (showToast) showToast('✓ Đã cài đặt Driver máy in thành công lên máy Agent!', 'success', 5000);
            setInstallDriverModal((p) => ({ ...p, isOpen: false, status: '', error: '' }));
          },
          (errorMsg: any) => {
            if (showToast) showToast(`[-] Lỗi cài đặt Driver: ${errorMsg}`, 'error');
            setInstallDriverModal((p) => ({ ...p, status: '', error: errorMsg }));
          },
          '⏳ Agent đang cài đặt Driver vào hệ thống Windows...'
        );
      }
    } catch (err: any) {
      setInstallDriverModal((p) => ({ ...p, status: '', error: err.message || 'Lỗi không xác định' }));
      if (showToast) showToast(`Lỗi cài đặt Driver: ${err.message}`, 'error');
    }
  };

  return {
    webPreviewModal, setWebPreviewModal,
    webPreviewTab, setWebPreviewTab,
    webPreviewLoading, setWebPreviewLoading,
    webPreviewHistory, setWebPreviewHistory,
    webPreviewHistoryIndex, setWebPreviewHistoryIndex,
    showPreviewDetails, setShowPreviewDetails,
    previewBlobUrl, setPreviewBlobUrl,
    previewIframeRef, handleCloseWebPreview,
    fetchRemotePage, handleHistoryBack, handleHistoryForward,
    installDriverModal, setInstallDriverModal,
    handleRemoteInstallDriver, executeRemoteInstallDriver
  };
};
