// @ts-nocheck
import { useState, useCallback, useRef } from 'react';
import { installDriverOnAgent, startAgentTunnel } from '../../../api/mockAgentApi';

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
      const data = await startAgentTunnel(agentUid, printerIp, 80);
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

  const openPrintAgentXTunnel = useCallback(async (agentUid: string, agentName?: string) => {
    if (!agentUid) {
      if (showToast) showToast('Không tìm thấy Agent UID', 'error');
      return;
    }

    const createLoaderHtml = (title: string, desc: string) => `
      <html>
        <head>
          <title>${title}</title>
          <meta charset="utf-8" />
          <style>
            body {
              background: #090d16;
              color: #f8fafc;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
            }
            .badge {
              background: rgba(16, 185, 129, 0.15);
              border: 1px solid rgba(16, 185, 129, 0.4);
              color: #34d399;
              padding: 4px 14px;
              border-radius: 999px;
              font-size: 0.8rem;
              font-weight: 600;
              margin-bottom: 16px;
            }
            .spinner {
              border: 4px solid rgba(255,255,255,0.1);
              width: 42px;
              height: 42px;
              border-radius: 50%;
              border-left-color: #10b981;
              animation: spin 1s linear infinite;
              margin-bottom: 20px;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            .title {
              font-weight: 700;
              font-size: 1.25rem;
              margin-bottom: 8px;
            }
            .desc {
              color: #94a3b8;
              font-size: 0.9rem;
              text-align: center;
              max-width: 450px;
              line-height: 1.5;
            }
          </style>
        </head>
        <body>
          <div class="badge">🌐 PrintAgentX Web Tunnel</div>
          <div class="spinner"></div>
          <div class="title">${title}</div>
          <div class="desc">${desc}</div>
        </body>
      </html>
    `;

    const wildcardTab = window.open('about:blank', '_blank');
    if (wildcardTab) {
      wildcardTab.document.write(createLoaderHtml(
        'Đang kết nối PrintAgentX...',
        `Đang khởi tạo đường hầm SSH ngược tới Agent ${agentName || agentUid} (Port 9173)...`
      ));
    }

    if (showToast) showToast('Đang kết nối PrintAgentX qua Tunnel...', 'info', 3000);

    try {
      const data = await startAgentTunnel(agentUid, '127.0.0.1', 9173);
      if (data.ok && (data.url || data.url_port)) {
        const tunnelUrl = data.url || data.url_port;
        const targetUrl = `https://printagentx.com/?tunnel_url=${encodeURIComponent(tunnelUrl)}`;
        if (wildcardTab) {
          wildcardTab.location.href = targetUrl;
        } else {
          window.open(targetUrl, '_blank');
        }
        if (showToast) showToast('✓ Đã mở trang quản trị PrintAgentX thành công!', 'success', 3000);
      } else {
        if (wildcardTab) wildcardTab.close();
        if (showToast) showToast('Kết nối lỗi: ' + (data.error || 'Không thể khởi động đường hầm SSH trên Agent'), 'error');
      }
    } catch (err: any) {
      if (wildcardTab) wildcardTab.close();
      if (showToast) showToast('Lỗi hệ thống VPS: ' + (err.message || err), 'error');
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
    openPrintAgentXTunnel,
    installDriverModal, setInstallDriverModal,
    handleRemoteInstallDriver, executeRemoteInstallDriver
  };
};
