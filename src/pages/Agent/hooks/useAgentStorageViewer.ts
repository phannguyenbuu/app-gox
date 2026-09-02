// @ts-nocheck
import { useState, useCallback } from 'react';
import { getScansFiles, triggerAgentUtilityExec } from '../../../api/mockAgentApi';

export const useAgentStorageViewer = (deps: any = {}) => {
  const { showToast, pollCommandStatus, setViewOutputModal } = deps;

  const [storageModalData, setStorageModalData] = useState<{
    isOpen: boolean;
    agentUid: string;
    agentName: string;
    currentPath: string;
    items: any[];
    loading: boolean;
    error: string;
  }>({
    isOpen: false,
    agentUid: '',
    agentName: '',
    currentPath: '',
    items: [],
    loading: false,
    error: ''
  });

  const [storageFiles, setStorageFiles] = useState<any[]>([]);
  const [storageLoading, setStorageLoading] = useState(false);

  const [scanPointsViewerModal, setScanPointsViewerModal] = useState<{
    isOpen: boolean;
    printer: any;
    data: any;
    rawJson: string;
  }>({
    isOpen: false,
    printer: null,
    data: null,
    rawJson: ''
  });

  const resolveRelativePath = (base: string, rel: string) => {
    if (!rel || rel === '.') return base;
    if (rel === '..') {
      const parts = base.split('/').filter(Boolean);
      parts.pop();
      return parts.join('/') || '';
    }
    return base ? `${base}/${rel}` : rel;
  };

  const handleOpenStorageFiles = useCallback(async (agentUid: string, agentName: string, subPath = '') => {
    setStorageModalData({
      isOpen: true,
      agentUid,
      agentName,
      currentPath: subPath,
      items: [],
      loading: true,
      error: ''
    });

    try {
      const res = await getScansFiles(agentUid, subPath);
      if (res.ok) {
        setStorageModalData((prev) => ({
          ...prev,
          items: res.items || res.files || [],
          loading: false
        }));
      } else {
        throw new Error(res.error || 'Không thể tải danh sách tệp');
      }
    } catch (err: any) {
      setStorageModalData((prev) => ({
        ...prev,
        loading: false,
        error: err.message || 'Lỗi kết nối tới Agent'
      }));
      if (showToast) showToast(`Không thể mở thư mục lưu trữ: ${err.message}`, 'error');
    }
  }, [showToast]);

  const handleViewScanPointsJson = useCallback(async (agentUid: string, copier: any) => {
    if (!agentUid) return;
    if (showToast) showToast('⌛ Đang tải file scan_points.json từ Agent...', 'info', 3000);

    try {
      const res = await triggerAgentUtilityExec(agentUid, 'view_scan_points_json', '');
      if (!res.ok || !res.command_id) throw new Error(res.error || 'Không thể tạo lệnh xem file scan_points.json');

      if (pollCommandStatus) {
        pollCommandStatus(
          res.command_id,
          `view_scan_points_${copier?.id || 'json'}`,
          (statusRes: any) => {
            const rawPayload = statusRes.result_payload || statusRes.result || '';
            let parsed: any = null;
            if (typeof rawPayload === 'object' && rawPayload !== null) {
              parsed = rawPayload;
            } else if (typeof rawPayload === 'string') {
              try {
                parsed = JSON.parse(rawPayload);
              } catch (e) {
                parsed = null;
              }
            }

            const rawText = parsed ? JSON.stringify(parsed, null, 2) : String(rawPayload);

            setScanPointsViewerModal({
              isOpen: true,
              printer: copier,
              data: parsed,
              rawJson: rawText
            });

            if (setViewOutputModal) {
              setViewOutputModal({
                isOpen: true,
                title: `📋 Danh bạ Scan (${copier?.printer_name || copier?.name || 'Copier'})`,
                content: rawText,
                rawPayload: rawPayload
              });
            }
          },
          (errorMsg: any) => {
            if (showToast) showToast(`Lỗi xem scan_points.json: ${errorMsg}`, 'error');
          },
          '⏳ Agent đang đọc file scan_points.json...'
        );
      }
    } catch (err: any) {
      if (showToast) showToast(`Lỗi đọc file scan_points.json: ${err.message}`, 'error');
    }
  }, [showToast, pollCommandStatus, setViewOutputModal]);

  return {
    storageModalData, setStorageModalData,
    storageFiles, setStorageFiles,
    storageLoading, setStorageLoading,
    handleOpenStorageFiles, resolveRelativePath,
    scanPointsViewerModal, setScanPointsViewerModal,
    handleViewScanPointsJson
  };
};
