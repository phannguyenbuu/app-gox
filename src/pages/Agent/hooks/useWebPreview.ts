// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
const BASE_URL = import.meta.env.VITE_API_URL || 'https://agentapi.quanlymay.com';

export function useWebPreview({ showToast, fetchRemotePage, resolveRelativePath }: any) {
    const [webPreviewModal, setWebPreviewModal] = useState<{ isOpen: boolean; title: string; html: string; ip: string; path: string; agentUid: string; url?: string } | null>(null);
  
    const [webPreviewLoading, setWebPreviewLoading] = useState<boolean>(false);
  
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
  

  return {
    webPreviewModal, setWebPreviewModal,
    webPreviewLoading, setWebPreviewLoading,
    webPreviewTab, setWebPreviewTab,
    showPreviewDetails, setShowPreviewDetails,
    webPreviewHistory, setWebPreviewHistory,
    webPreviewHistoryIndex, setWebPreviewHistoryIndex,
    previewBlobUrl, setPreviewBlobUrl,
    scaleX, setScaleX,
    scaleY, setScaleY,
    lockAspect, setLockAspect,
    handleHistoryBack,
    handleHistoryForward,
    handleCloseWebPreview,
    handlePrintIframe,
    handleDownloadIframe,
    handlePreviewTabChange,
    handleIframeMessage
  };
}
