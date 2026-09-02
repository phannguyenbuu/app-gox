// @ts-nocheck
import { useState, useCallback, useRef } from 'react';
import { useAgentLanPrinters } from './useAgentLanPrinters';
import { useAgentUtilityCommands } from './useAgentUtilityCommands';
import { useAgentWebPreview } from './useAgentWebPreview';
import { useAgentStorageViewer } from './useAgentStorageViewer';

export const useAgentCoreLogic = (deps: any = {}) => {
  const [toasts, setToasts] = useState<any[]>([]);

  const formatShortMessage = (msg: string) => {
    const words = String(msg || '').trim().split(/\s+/);
    return words.length > 15 ? words.slice(0, 15).join(' ') + '…' : String(msg || '').trim();
  };

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', duration = 3000) => {
    const id = Date.now().toString() + Math.random().toString().slice(2, 6);
    const shortMsg = formatShortMessage(message);
    setToasts((prev) => [...prev, { id, message: shortMsg, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const replaceToast = useCallback((id: string, message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', duration = 5000) => {
    const shortMsg = formatShortMessage(message);
    setToasts((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = { id, message: shortMsg, type };
        return next;
      }
      return [...prev, { id, message: shortMsg, type }];
    });
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const [activeTab, setActiveTab] = useState<'agents' | 'copiers' | 'cameras'>('copiers');

  const [commandStatus, setCommandStatus] = useState<Record<string, { message: string; isPending: boolean }>>({});

  const [activeModal, setActiveModal] = useState<string | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: ''
  });

  const [deleteScanPointModal, setDeleteScanPointModal] = useState<{
    isOpen: boolean;
    printerId: string;
    entry: any;
    agentUid: string;
  }>({
    isOpen: false,
    printerId: '',
    entry: null,
    agentUid: ''
  });

  const [viewOutputModal, setViewOutputModal] = useState<{
    isOpen: boolean;
    title: string;
    content: string;
    rawPayload: any;
  }>({
    isOpen: false,
    title: '',
    content: '',
    rawPayload: null
  });

  const [ipInputModal, setIpInputModal] = useState<{
    isOpen: boolean;
    title: string;
    hint: string;
    value: string;
    changeAllTo: string;
    scanStatus: string;
    error: string;
    onConfirm?: (targetIp: string, changeAllTo?: string) => void;
  }>({
    isOpen: false,
    title: '',
    hint: '',
    value: '',
    changeAllTo: '',
    scanStatus: '',
    error: ''
  });

  const [publicFtpData, setPublicFtpData] = useState<any>({
    printerId: '',
    name: '',
    email: '',
    agentUid: ''
  });
  const [publicFtpLoading, setPublicFtpLoading] = useState(false);

  const [privateFtpData, setPrivateFtpData] = useState<any>({
    lanUid: '',
    agentUid: '',
    email: ''
  });
  const [privateFtpLoading, setPrivateFtpLoading] = useState(false);

  const [ftpDetailData, setFtpDetailData] = useState<any>(null);

  // Dùng ref để break circular dependency:
  // lanPrinters cần pollCommandStatus từ utility, nhưng utility được khai báo sau lanPrinters
  // Ref giữ stable reference — không vi phạm Rules of Hooks
  const pollCommandStatusRef = useRef<((...args: any[]) => any) | null>(null);

  const lanPrinters = useAgentLanPrinters({
    showToast,
    pollCommandStatus: (...args: any[]) => pollCommandStatusRef.current?.(...args),
    utilityCommands: [],
    activeTab
  });

  const utility = useAgentUtilityCommands({
    showToast,
    setViewOutputModal,
    setIpInputModal,
    setCommandStatus,
    fetchLanSitesData: lanPrinters.fetchLanSitesData,
    setLanSites: lanPrinters.setLanSites
  });

  // Cập nhật ref sau khi utility đã được khởi tạo
  pollCommandStatusRef.current = utility.pollCommandStatus;

  const webPreview = useAgentWebPreview({
    showToast,
    pollCommandStatus: utility.pollCommandStatus
  });

  const storageViewer = useAgentStorageViewer({
    showToast,
    pollCommandStatus: utility.pollCommandStatus,
    setViewOutputModal
  });

  return {
    toasts,
    setToasts,
    showToast,
    replaceToast,
    activeTab,
    setActiveTab,
    commandStatus,
    setCommandStatus,
    activeModal,
    setActiveModal,
    confirmModal,
    setConfirmModal,
    deleteScanPointModal,
    setDeleteScanPointModal,
    viewOutputModal,
    setViewOutputModal,
    ipInputModal,
    setIpInputModal,
    publicFtpData,
    setPublicFtpData,
    publicFtpLoading,
    setPublicFtpLoading,
    privateFtpData,
    setPrivateFtpData,
    privateFtpLoading,
    setPrivateFtpLoading,
    getDestinationStatus: () => ({ label: '✔ ACTIVE', type: 'success', title: '' }),
    getDestinationStatusHtml: () => ({ label: '✔ ACTIVE', type: 'success', title: '' }),

    ...lanPrinters,

    ...utility,

    ...webPreview,

    ...storageViewer
  };
};
