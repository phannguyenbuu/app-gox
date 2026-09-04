// @ts-nocheck
import { useState, useCallback, useEffect } from 'react';
import { getAgentUtilityCommands, getCommandStatus, getJobs, purgeLanPrinters, triggerAgentUtility, triggerAgentUtilityExec } from '../../../api/mockAgentApi';

const VIEW_COMMANDS = new Set([
  'get_agent_ip',
  'get_public_ip',
  'view_settings_json',
  'view_printers_json',
  'view_scan_points_json',
  'view_agent_loader_debug',
  'view_stout',
  'view_sterror',
  'dxdiag',
  'printers',
  'clean_temp',
  'scan',
  'ricoh_list_scan',
  'toshiba_list_scan'
]);

const VIEW_COMMAND_TITLES: Record<string, string> = {
  get_agent_ip: 'Địa chỉ IP Local của Agent',
  get_public_ip: 'Địa chỉ IP Public (Internet)',
  view_settings_json: 'Nội dung tệp settings.json',
  view_printers_json: 'Nội dung tệp printers.json',
  view_scan_points_json: 'Nội dung tệp scan_points.json',
  view_agent_loader_debug: 'Nội dung tệp agent_loader_debug.txt',
  view_stout: 'Nội dung tệp stout.txt (1000 dòng cuối)',
  view_sterror: 'Nội dung tệp sterror.txt (1000 dòng cuối)',
  dxdiag: 'Kết quả kiểm tra cấu hình hệ thống (DxDiag)',
  printers: 'Danh sách máy in hệ thống',
  clean_temp: 'Kết quả dọn dẹp thư mục tạm & Driver',
  scan: 'Nội dung thư mục Scan gốc (%TEMP%/GoPrinxAgent/ftp)',
  ricoh_list_scan: 'Danh bạ Scan trên máy photo Ricoh',
  toshiba_list_scan: 'Danh bạ Scan trên máy photo Toshiba'
};

export const useAgentUtilityCommands = (deps: any = {}) => {
  const { showToast, setViewOutputModal, setIpInputModal } = deps;

  const [utilityCommands, setUtilityCommands] = useState<any[]>([]);
  const [utilityCommandsLoading, setUtilityCommandsLoading] = useState(false);
  const [utilitySettingsLoading, setUtilitySettingsLoading] = useState(false);
  const [utilityStatusMsg, setUtilityStatusMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [utilityActionPending, setUtilityActionPending] = useState<string | null>(null);

  const [selectedUtilityAgent, setSelectedUtilityAgent] = useState<any>(null);

  useEffect(() => {
    let isMounted = true;
    const targetUid = selectedUtilityAgent?.agent_uid || 'default';
    setUtilityCommandsLoading(true);
    getAgentUtilityCommands(targetUid)
      .then((res: any) => {
        if (!isMounted) return;
        const cmds = Array.isArray(res) ? res : (res?.commands || res?.rows || []);
        setUtilityCommands(cmds);
      })
      .catch((err: any) => {
        console.error('Failed to load utility commands:', err);
      })
      .finally(() => {
        if (isMounted) setUtilityCommandsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [selectedUtilityAgent]);

  const [editableSettingsText, setEditableSettingsText] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSaveStatus, setSettingsSaveStatus] = useState('');
  const [customRunCommand, setCustomRunCommand] = useState('ping 8.8.8.8');

  const pollCommandStatus = useCallback(
    (
      commandId: number,
      key: string,
      onSuccess: (data: any) => void,
      onFailed?: (errorMsg: string) => void,
      initialPendingMsg?: string
    ) => {
      deps.setCommandStatus?.((prev: any) => ({
        ...prev,
        [key]: { message: initialPendingMsg || 'Đang thực thi lệnh...', isPending: true },
      }));

      const pollInterval = 1500;
      const timeoutMs = 60000;
      const startTime = Date.now();

      const timer = setInterval(async () => {
        const elapsed = Date.now() - startTime;
        if (elapsed > timeoutMs) {
          clearInterval(timer);
          deps.setCommandStatus?.((prev: any) => ({
            ...prev,
            [key]: { message: 'Lỗi: Quá thời gian chờ (Timeout 60s)', isPending: false },
          }));
          if (onFailed) onFailed('Quá thời gian chờ (Timeout 60s)');
          return;
        }

        try {
          const res = await getCommandStatus(commandId);

          if (res.ok && res.status === 'success') {
            clearInterval(timer);
            const extraMsg = res.result ? ` (${res.result})` : '';
            deps.setCommandStatus?.((prev: any) => ({
              ...prev,
              [key]: { message: `Đã hoàn tất thành công!${extraMsg}`, isPending: false },
            }));
            onSuccess(res);
          } else if (res.ok && res.status === 'failed') {
            clearInterval(timer);
            const errDetail = res.error || res.error_message || res.result || 'Thực thi thất bại';
            deps.setCommandStatus?.((prev: any) => ({
              ...prev,
              [key]: { message: `Lỗi: ${errDetail}`, isPending: false },
            }));
            if (onFailed) onFailed(errDetail);
          } else {
            const runningMsg = res.received_at
              ? `Agent đã nhận lệnh (${Math.round(elapsed / 1000)}s)...`
              : `Đang gửi lệnh tới Agent (${Math.round(elapsed / 1000)}s)...`;
            deps.setCommandStatus?.((prev: any) => ({
              ...prev,
              [key]: { message: runningMsg, isPending: true },
            }));
          }
        } catch (err: any) {
          clearInterval(timer);
          deps.setCommandStatus?.((prev: any) => ({
            ...prev,
            [key]: { message: `Lỗi kết nối: ${err.message || 'Lỗi polling'}`, isPending: false },
          }));
          if (onFailed) onFailed(err.message || 'Lệnh thực hiện thất bại từ Agent');
        }
      }, pollInterval);
    },
    [deps]
  );

  const isDuplicatePending = async (agentUid: string, commandType: string, paramsMatch?: Record<string, any>): Promise<boolean> => {
    try {
      const data = await getJobs(agentUid, 10);
      const jobs = data.jobs || data.commands || [];
      const pendingJobs = jobs.filter((j: any) => j.status === 'pending' && j.command_type === commandType);

      if (!paramsMatch) return pendingJobs.length > 0;

      return pendingJobs.some((j: any) => {
        const p = j.command_params || {};
        return Object.keys(paramsMatch).every(k => String(p[k]) === String(paramsMatch[k]));
      });
    } catch {
      return false;
    }
  };

  const loadUtilitySettings = useCallback(async (agentUid: string) => {
    setUtilitySettingsLoading(true);
    setSettingsSaveStatus('');
    try {
      const res = await triggerAgentUtilityExec(agentUid, 'view_settings_json', '');
      if (!res.ok || !res.command_id) throw new Error(res.error || 'Không thể gửi lệnh xem settings.json');

      pollCommandStatus(
        res.command_id,
        'view_settings',
        (statusRes: any) => {
          const rawText = (typeof statusRes.result_payload === 'object' && statusRes.result_payload)
            ? JSON.stringify(statusRes.result_payload, null, 2)
            : (statusRes.result_payload || statusRes.result || '');
          setEditableSettingsText(rawText);
          setUtilitySettingsLoading(false);
        },
        (errMs: any) => {
          setSettingsSaveStatus(`❌ Không thể nạp settings.json: ${errMs}`);
          setUtilitySettingsLoading(false);
        },
        '⌛ Đang nạp settings.json từ Agent...'
      );
    } catch (e: any) {
      setSettingsSaveStatus(`❌ Lỗi nạp cấu hình: ${e.message}`);
      setUtilitySettingsLoading(false);
    }
  }, [pollCommandStatus]);

  const handleSaveSettings = async (selectedAgentUid: string) => {
    if (!selectedAgentUid || !editableSettingsText) return;
    try {
      JSON.parse(editableSettingsText);
    } catch (e: any) {
      setSettingsSaveStatus(`❌ Lỗi định dạng JSON: ${e.message}`);
      return;
    }
    setIsSavingSettings(true);
    setSettingsSaveStatus('⌛ Đang gửi cấu hình mới tới Agent...');
    const base64Content = btoa(unescape(encodeURIComponent(editableSettingsText)));
    try {
      const saveCmdObj = (utilityCommands || []).find((c: any) => c.command === 'save_settings_json');
      const scriptContent = saveCmdObj?.command_content || '';
      const res = await triggerAgentUtilityExec(selectedAgentUid, 'save_settings_json', scriptContent, {
        base64_content: base64Content
      });
      if (!res.ok || !res.command_id) {
        throw new Error(res.error || 'Không thể tạo lệnh tiện ích');
      }
      const commandId = res.command_id;
      pollCommandStatus(
        commandId,
        'save_settings',
        () => {
          setSettingsSaveStatus('✅ Đã lưu và nạp lại cấu hình settings.json thành công!');
          setIsSavingSettings(false);
          if (showToast) showToast('Lưu cấu hình', 'success');
        },
        (errMs: any) => {
          setSettingsSaveStatus(`❌ Lỗi lưu cấu hình: ${errMs}`);
          setIsSavingSettings(false);
        },
        '⌛ Agent đang ghi đè tệp settings.json...'
      );
    } catch (e: any) {
      setSettingsSaveStatus(`❌ Lỗi gửi lệnh: ${e.message}`);
      setIsSavingSettings(false);
    }
  };

  const handleTriggerUtility = useCallback(async (
    agentOrAction: any,
    actionOrBackend?: string,
    backendActionOrPayload?: any,
    payload: any = {}
  ) => {
    let targetAgent = selectedUtilityAgent;
    let action = '';
    let backendAction = '';
    let extraPayload = {};

    if (typeof agentOrAction === 'string') {
      action = agentOrAction;
      backendAction = actionOrBackend || action;
      extraPayload = backendActionOrPayload || {};
    } else {
      targetAgent = agentOrAction || selectedUtilityAgent;
      action = actionOrBackend || '';
      backendAction = backendActionOrPayload || action;
      extraPayload = payload || {};
    }

    if (!targetAgent) return;
    setUtilityActionPending(action);
    setUtilityStatusMsg({ text: '⌛ Đang gửi lệnh tới Agent...', isError: false });

    try {
      const res = await triggerAgentUtility(targetAgent.agent_uid, backendAction, extraPayload);
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
            setUtilityStatusMsg({ text: 'Yêu cầu quá thời gian chờ (60s)', isError: true });
            setUtilityActionPending(null);
            return;
          }

          const statusRes = await getCommandStatus(commandId);
          if (statusRes.status === 'success') {
            clearInterval(timer);
            setUtilityStatusMsg({ text: '⚡ Thực hiện lệnh tiện ích thành công!', isError: false });
            setUtilityActionPending(null);
          } else if (statusRes.status === 'failed' || !statusRes.ok) {
            clearInterval(timer);
            setUtilityStatusMsg({ text: `❌ Thất bại: ${statusRes.error || 'Lệnh thất bại từ Agent'}`, isError: true });
            setUtilityActionPending(null);
          } else {
            const elapsedSec = Math.round(elapsed / 1000);
            if (statusRes.received_at) {
              setUtilityStatusMsg({ text: `⚡ Agent đã nhận lệnh - đang mở tiện ích... (${elapsedSec}s)`, isError: false });
            } else {
              setUtilityStatusMsg({ text: `⌛ Đang chuyển lệnh tới Agent... (${elapsedSec}s)`, isError: false });
            }
          }
        } catch (pollErr: any) {
          console.error('Error polling utility status:', pollErr);
        }
      }, pollInterval);

    } catch (err: any) {
      console.error(`Failed to trigger ${action}:`, err);
      setUtilityStatusMsg({
        text: `Lỗi kết nối hoặc gửi lệnh: ${err.message}`,
        isError: true
      });
      setUtilityActionPending(null);
    }
  }, [selectedUtilityAgent]);

  const handleTriggerUtilityExec = useCallback(async (
    agentOrCommand: any,
    commandOrContent?: string,
    contentOrExtra?: any
  ) => {
    let targetAgent = selectedUtilityAgent;
    let command = '';
    let commandContent = '';

    if (typeof agentOrCommand === 'string') {
      command = agentOrCommand;
      commandContent = commandOrContent || '';
    } else {
      targetAgent = agentOrCommand || selectedUtilityAgent;
      command = commandOrContent || '';
      commandContent = contentOrExtra || '';
    }

    if (!targetAgent) return;

    const isDup = await isDuplicatePending(targetAgent.agent_uid, 'trigger_utility', {
      action: 'exec_utility',
      command: command
    });
    if (isDup) {
      if (showToast) showToast('Lệnh đang chờ xử lý...', 'info');
      return;
    }

    const cmdObj = utilityCommands.find((c: any) => c.command === command);
    const isOutputModal = cmdObj?.output_modal !== false || VIEW_COMMANDS.has(command);
    const displayTitle = cmdObj?.label || VIEW_COMMAND_TITLES[command] || command;

    if (command === 'change_agent_ip' || command === 'check_scan_ip_match') {
      const isChangeIp = command === 'change_agent_ip';
      const currentIp = targetAgent?.local_ip || targetAgent?.ip || targetAgent?.agent_ip || targetAgent?.localIp || '';

      if (setIpInputModal) {
        setIpInputModal({
          isOpen: true,
          title: isChangeIp ? '🌐 Đổi địa chỉ IP tĩnh' : '🔍 Kiểm tra IP khớp Copier',
          hint: isChangeIp
            ? 'Nhập địa chỉ IPv4 tĩnh muốn gán cho máy Agent.'
            : 'Nhập địa chỉ IP muốn kiểm tra xem copier nào có FTP Scan entry khớp.',
          value: currentIp,
          changeAllTo: '',
          scanStatus: '',
          error: '',
          onConfirm: (targetIp: string, changeAllTo?: string) => {
            const finalContent = commandContent.replace('__TARGET_IP__', targetIp);
            setUtilityActionPending(command);
            setUtilityStatusMsg({ text: '⌛ Đang gửi lệnh tới Agent...', isError: false });
            triggerAgentUtilityExec(targetAgent!.agent_uid, command, finalContent, {
              target_ip: targetIp,
              ip: targetIp,
              printer_ip: targetIp,
              change_all_to: changeAllTo || ''
            })
              .then((res: any) => {
                if (!res.ok || !res.command_id) throw new Error(res.error || 'Không thể tạo lệnh tiện ích');
                const commandId = res.command_id;
                const maxPollMs = 60000;
                const startTime = Date.now();
                const timer = setInterval(async () => {
                  try {
                    const elapsed = Date.now() - startTime;
                    if (elapsed > maxPollMs) {
                      clearInterval(timer);
                      setUtilityStatusMsg({ text: 'Yêu cầu quá thời gian chờ (60s)', isError: true });
                      setUtilityActionPending(null);
                      return;
                    }
                    const statusRes = await getCommandStatus(commandId);
                    if (statusRes.status === 'success') {
                      clearInterval(timer);
                      if (isOutputModal && setViewOutputModal) {
                        const outVal = (typeof statusRes.result_payload === 'object' && statusRes.result_payload) ? JSON.stringify(statusRes.result_payload, null, 2) : (statusRes.result_payload || statusRes.output || statusRes.error_message || statusRes.error || statusRes.result || '(không có nội dung)');
                        setViewOutputModal({
                          isOpen: true,
                          title: displayTitle,
                          content: outVal,
                          rawPayload: statusRes.result_payload || statusRes.output || statusRes.error_message || statusRes.result || ''
                        });
                      } else {
                        setUtilityStatusMsg({ text: '⚡ Thực hiện lệnh thành công!', isError: false });
                      }
                      setUtilityActionPending(null);
                      if (deps.fetchLanSitesData) {
                        deps.fetchLanSitesData(true);
                        setTimeout(() => deps.fetchLanSitesData && deps.fetchLanSitesData(true), 2000);
                        setTimeout(() => deps.fetchLanSitesData && deps.fetchLanSitesData(true), 5000);
                      }
                    } else if (statusRes.status === 'failed' || !statusRes.ok) {
                      clearInterval(timer);
                      if (setViewOutputModal) {
                        const outErr = statusRes.error || (typeof statusRes.result_payload === 'object' && statusRes.result_payload) ? JSON.stringify(statusRes.result_payload, null, 2) : (statusRes.result_payload || statusRes.output || statusRes.error_message || statusRes.result || '(không có nội dung)');
                        setViewOutputModal({
                          isOpen: true,
                          title: displayTitle,
                          content: outErr,
                          rawPayload: statusRes.result_payload || statusRes.output || statusRes.error_message || statusRes.result || ''
                        });
                      } else {
                        setUtilityStatusMsg({ text: `❌ Thất bại: ${statusRes.error || 'Lệnh thất bại từ Agent'}`, isError: true });
                      }
                      setUtilityActionPending(null);
                    } else {
                      const elapsedSec = Math.round(elapsed / 1000);
                      setUtilityStatusMsg({ text: `⌛ Agent đang thực hiện lệnh... (${elapsedSec}s)`, isError: false });
                    }
                  } catch (err: any) {
                    console.error('Error polling status:', err);
                  }
                }, 1000);
              })
              .catch((err: any) => {
                setUtilityStatusMsg({ text: `Lỗi gửi lệnh: ${err.message}`, isError: true });
                setUtilityActionPending(null);
              });
          }
        });
      }
      return;
    }

    setUtilityActionPending(command);
    setUtilityStatusMsg({ text: '⌛ Đang gửi lệnh thực thi tới Agent...', isError: false });

    // ── Nếu là force_subnet_scan: xóa DB cũ trước để kết quả hoàn toàn sạch ──
    if (command === 'force_subnet_scan') {
      const lanUid = targetAgent?.lan_uid || selectedUtilityAgent?.lan_uid || 'default';
      purgeLanPrinters(lanUid).catch(err =>
        console.warn('[handleTriggerUtilityExec] purgeLanPrinters error (non-fatal):', err)
      );
    }

    try {
      const res = await triggerAgentUtilityExec(targetAgent.agent_uid, command, commandContent);
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
            setUtilityStatusMsg({ text: 'Yêu cầu quá thời gian chờ (60s)', isError: true });
            setUtilityActionPending(null);
            return;
          }

          const statusRes = await getCommandStatus(commandId);
          if (statusRes.status === 'success') {
            clearInterval(timer);
            if (isOutputModal && setViewOutputModal) {
              const outVal = (typeof statusRes.result_payload === 'object' && statusRes.result_payload) ? JSON.stringify(statusRes.result_payload, null, 2) : (statusRes.result_payload || statusRes.output || statusRes.error_message || statusRes.error || statusRes.result || '(không có nội dung)');
              setViewOutputModal({
                isOpen: true,
                title: displayTitle,
                content: outVal,
                rawPayload: statusRes.result_payload || statusRes.output || statusRes.error_message || statusRes.result || ''
              });
            } else {
              setUtilityStatusMsg({ text: '⚡ Thực hiện lệnh thành công!', isError: false });
            }
            setUtilityActionPending(null);
            if (deps.fetchLanSitesData) {
              deps.fetchLanSitesData(true);
              setTimeout(() => deps.fetchLanSitesData && deps.fetchLanSitesData(true), 2000);
            }
          } else if (statusRes.status === 'failed' || !statusRes.ok) {
            clearInterval(timer);
            if (isOutputModal && setViewOutputModal) {
              const outErr = statusRes.error || (typeof statusRes.result_payload === 'object' && statusRes.result_payload) ? JSON.stringify(statusRes.result_payload, null, 2) : (statusRes.result_payload || statusRes.output || statusRes.error_message || statusRes.result || '(không có nội dung)');
              setViewOutputModal({
                isOpen: true,
                title: displayTitle,
                content: outErr,
                rawPayload: statusRes.result_payload || statusRes.output || statusRes.error_message || statusRes.result || ''
              });
            } else {
              setUtilityStatusMsg({ text: `❌ Thất bại: ${statusRes.error || statusRes.error_message || 'Lệnh thất bại từ Agent'}`, isError: true });
            }
            setUtilityActionPending(null);
          } else {
            const elapsedSec = Math.round(elapsed / 1000);
            const prog = statusRes.progress_text || `Đang xử lý... (${elapsedSec}s)`;
            setUtilityStatusMsg({ text: `⌛ ${prog}`, isError: false });
          }
        } catch (pollErr: any) {
          const errMsg = pollErr?.message || String(pollErr || '');
          if (isOutputModal && setViewOutputModal && (errMsg.startsWith('[PATH]') || errMsg.includes('stout') || errMsg.includes('sterror') || errMsg.includes('settings.json'))) {
            clearInterval(timer);
            setViewOutputModal({
              isOpen: true,
              title: displayTitle,
              content: errMsg,
              rawPayload: errMsg
            });
            setUtilityStatusMsg(null);
            setUtilityActionPending(null);
          } else if (errMsg.includes('502') || errMsg.includes('404') || errMsg.includes('xóa') || elapsed > 15000) {
            clearInterval(timer);
            setUtilityActionPending(null);
            setUtilityStatusMsg({ text: '❌ Lệnh đã dừng hoặc bị xóa', isError: true });
          } else {
            console.error('Poll error:', pollErr);
          }
        }
      }, pollInterval);

    } catch (err: any) {
      setUtilityStatusMsg({ text: `Lỗi: ${err.message}`, isError: true });
      setUtilityActionPending(null);
    }
  }, [selectedUtilityAgent, utilityCommands, showToast, setIpInputModal, setViewOutputModal]);

  return {
    VIEW_COMMANDS, VIEW_COMMAND_TITLES,
    utilityCommands, setUtilityCommands,
    utilityCommandsLoading, setUtilityCommandsLoading,
    utilitySettingsLoading, setUtilitySettingsLoading,
    utilityStatusMsg, setUtilityStatusMsg,
    utilityActionPending, setUtilityActionPending,
    selectedUtilityAgent, setSelectedUtilityAgent,
    editableSettingsText, setEditableSettingsText,
    isSavingSettings, setIsSavingSettings,
    settingsSaveStatus, setSettingsSaveStatus,
    customRunCommand, setCustomRunCommand,
    pollCommandStatus, loadUtilitySettings, handleSaveSettings,
    handleTriggerUtility, handleTriggerUtilityExec
  };
};
