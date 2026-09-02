// @ts-nocheck
import { DEFAULT_EXEC_TEMPLATES } from '../constants/execTemplates';
import { fetchApi, addEmailDestination, addPrivateLanEmail, deleteEmailDestination, deleteLanEmail, deleteScanPoint, getAgentSettings, getAgentUtilityCommands, getCommandStatus, getJobs, getLanSites, getScansFiles, installDriverOnAgent, modifyDeviceAddress, saveCopierCredentials, triggerAgentUtility, triggerAgentUtilityExec, triggerEmergencyRestart, triggerFetchAddressBook, updateAgentSettings, clearScanPoint } from '../../../api/mockAgentApi';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AgentApi } from '../../../api/AgentApi';
const BASE_URL = import.meta.env.VITE_API_URL || 'https://agentapi.quanlymay.com';


// Helpers for Destination Status
function getDestinationStatusHtml(entry: any, emails: any[], agents: any[]) {
  const emailVal = entry.email_address || entry.email || '';
  const folderVal = entry.physical_path || entry.folder || entry.folder_path || '';
  const addressValue = (emailVal || folderVal || '').trim();
  
  if (!addressValue) {
    return { label: 'UNKNOWN', type: 'error', title: '' };
  }
  
  const isEmail = entry.type === 'Email' || emailVal.includes('@');
  if (isEmail) {
    return { label: '✔ ACTIVE', type: 'success', title: '' };
  }

  const matchedEmail = (emails || []).find((e: any) => (e.email || '').toLowerCase().trim() === addressValue.toLowerCase().trim());
  const portNumber = matchedEmail ? matchedEmail.email_number : Number(entry.registration_no);

  if (!portNumber || isNaN(portNumber)) {
    return { label: '✔ ACTIVE', type: 'success', title: '' };
  }

  const masterAgent = (agents || []).find((a: any) => a.is_master && a.is_agent_active) || (agents || []).find((a: any) => a.is_agent_active) || (agents || [])[0];
  if (masterAgent) {
    const site = (masterAgent.ftp_sites || []).find((s: any) => Number(s.port) === Number(portNumber));
    if (site) {
      const expectedPath = ('C:/Scangox/' + addressValue).toLowerCase().replace(/\\/g, '/');
      const actualPath = (site.path || '').toLowerCase().replace(/\\/g, '/');
      const isCorrectPath = actualPath === expectedPath;

      if (site.running && isCorrectPath) {
        return { label: '✔ OK', type: 'success', title: '' };
      } else if (site.running && !isCorrectPath) {
        return { label: '⚠ CONFLICT', type: 'warning', title: `FTP site uses folder: ${site.path} instead of expected: C:/Scangox/${addressValue}` };
      } else if (site.error && (site.error.toLowerCase().includes('in use') || site.error.toLowerCase().includes('busy') || site.error.toLowerCase().includes('already bound') || site.error.toLowerCase().includes('already in use'))) {
        return { label: '❌ PORT BUSY', type: 'error', title: site.error };
      } else {
        return { label: '❌ FAILED', type: 'error', title: site.error || 'FTP site failed to start' };
      }
    } else {
      return { label: 'PENDING SETUP', type: 'warning', title: '' };
    }
  } else {
    return { label: 'OFFLINE', type: 'neutral', title: '' };
  }
}

function safePathToken(value: string): string {
  const text = (value || '').trim();
  if (!text) return 'unknown';
  const ascii = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._@-]/g, '-').replace(/^[\s\-_.]+|[\s\-_.]+$\//g, '');
  return ascii || 'unknown';
}

export const useAgentScanActions = (deps: any = {}) => {
  const { activeAgentUid, cameras, copierCredentials = {}, deleteScanPointModal, editIpModalData, fetchLanSitesData, getTargetAgentUid, isDuplicatePending, lanSites = [], pollCommandStatus, queryDuration, queryTimestamp, replaceToast, saveScanPointToDb, selectedCamera, selectedLan, setActiveModal, setDeleteScanPointModal, setEditIpModalData, setInstallDriverModal, setLiveAddressBooks, setQueriedVideoUrl, setQueryDuration, setQueryTimestamp, setQueryVideoLoading, setStorageFiles, setStorageLoading, setStorageModalData, showToast, utilityCommands = [] } = deps;

  const resolveCopierCredentials = async (printerObj: any): Promise<{ user: string; pass: string; mac: string }> => {
    const rawMac = String(printerObj?.mac_address || printerObj?.mac_id || printerObj?.mac || '').trim();
    const rawIp = String(printerObj?.ip || printerObj?.printer_ip || (typeof printerObj === 'string' ? printerObj : '') || printerObj?.id || '').trim();

    const mac = rawMac.toUpperCase().replace(/[^0-9A-F:]/g, '');
    const normMac = mac.replace(/[:-]/g, '');

    let user = '';
    let pass = '';

    // Truy vấn trực tiếp từ bảng PrinterAuthCredential trên VPS theo MAC hoặc IP
    try {
      const res = await fetchApi(`/api/devices/credentials-map?t=${Date.now()}`);
      if (res && res.ok && res.credentials) {
        const creds = res.credentials;
        const matched = 
          (mac && creds[mac]) ||
          (normMac && creds[normMac]) ||
          (mac && creds[mac.replace(/:/g, '-')]) ||
          (rawIp && creds[rawIp]);

        if (matched) {
          user = String(matched.user || matched.auth_user || '').trim();
          pass = String(matched.password || matched.auth_password || matched.pass || '').trim();
        }
      }
    } catch (e: any) {
      throw new Error(`❌ Lỗi kết nối VPS khi tải tài khoản máy in: ${e.message || 'Lỗi mạng'}`);
    }

    // Nếu không tìm thấy trong bảng PrinterAuthCredential trên VPS, văng lỗi để user xử lý
    if (!user) {
      const displayTarget = mac || rawIp || 'chưa xác định';
      throw new Error(`⚠️ Chưa có Tài khoản Web máy in (admin) trong bảng PrinterAuthCredential trên VPS cho thiết bị (MAC/IP: ${displayTarget}). Vui lòng nhập User/Pass và bấm "Lưu Auth" trước!`);
    }

    return { user, pass, mac: mac || rawIp };
  };
  const handleQueryVideo = async (agentUid: string, cameraId: number, customTimestamp?: string, customDuration?: number) => {
    const ts = customTimestamp || queryTimestamp;
    const dur = customDuration || queryDuration;
    if (!ts) return;

    const cameraName = cameras.find((c: any) => c.id === cameraId)?.name || '';
    const isDup = await isDuplicatePending(agentUid, 'trigger_utility', {
      action: 'query_camera_video',
      camera_name: cameraName,
      timestamp: ts,
      duration: dur
    });
    if (isDup) {
      showToast('Đang chờ video...', 'info');
      return;
    }

    setQueryVideoLoading(true);
    setQueriedVideoUrl('');
    try {
      const response = await fetch(`${BASE_URL}/api/agents/${agentUid}/cameras/${cameraId}/query-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp: ts, duration: dur })
      });
      const data = await response.json();
      if (data.ok) {
        const cleanTs = ts.replace(/[- :]/g, '');
        const formattedTs = cleanTs.substring(0, 8) + '_' + cleanTs.substring(8, 14);
        setQueriedVideoUrl(`clip_${selectedCamera.camera_name}_${formattedTs}.mp4`);
      } else {
        showToast('Truy xuất thất bại', 'error');
      }
    } catch (err: any) {
      showToast('Truy xuất thất bại', 'error');
    } finally {
      setQueryVideoLoading(false);
    }
  };

  const handlePlaySegmentFile = (filename: string) => {
    const match = filename.match(/_(\d{8}_\d{6})\.mp4$/);
    if (match) {
      const rawTs = match[1]; // e.g. 20260704_043000
      const formattedTs = `${rawTs.substring(0, 4)}-${rawTs.substring(4, 6)}-${rawTs.substring(6, 8)} ${rawTs.substring(9, 11)}:${rawTs.substring(11, 13)}:${rawTs.substring(13, 15)}`;
      
      setQueryTimestamp(formattedTs);
      setQueryDuration(60);
      
      handleQueryVideo(activeAgentUid, selectedCamera.id, formattedTs, 60);
      
      setTimeout(() => {
        document.getElementById('video-playback-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } else {
      showToast('Không parse được thời gian từ tên tệp', 'error');
    }
  };

  // ── DELETE DESTINATION ──
  const handleDeleteDest = (printerId: string, entry: any) => {
    const allPrinters = (lanSites || []).flatMap((s: any) => s.printers || []);
    const printerObj = allPrinters.find((item: any) => String(item.id) === String(printerId) || item.mac_id === printerId || item.ip === printerId) || selectedLan?.printers?.[0];
    const lanPublicIp = selectedLan?.public_ip || selectedLan?.wan_ip;
    const sameIpAgent = (selectedLan?.agents || []).find((a: any) => a.is_agent_active && ((a.public_ip && a.public_ip === lanPublicIp) || (a.wan_ip && a.wan_ip === lanPublicIp)))?.agent_uid;
    const targetAgent = getTargetAgentUid(printerId) || printerObj?.agent_uid || sameIpAgent || '';
    setDeleteScanPointModal({
      isOpen: true,
      printerId,
      entry,
      agentUid: targetAgent,
    });
  };

  const handleConfirmDeleteScanPoint = async () => {
    const { printerId, entry, agentUid } = deleteScanPointModal;
    if (!entry) return;

    setDeleteScanPointModal((p) => ({ ...p, isOpen: false }));

    const emailVal = entry.email_address || entry.email || '';
    const folderVal = entry.physical_path || entry.folder || entry.folder_path || '';
    const destVal = (emailVal || folderVal || '').trim();
    const regNo = String((entry.registration_no && entry.registration_no !== '-') ? entry.registration_no : (entry.entry_id || '')).trim();

    // Checking if it is a private LAN email
    const emailsList = selectedLan?.emails || [];
    const matchedEmail = emailsList.find((e) => e.email.toLowerCase().trim() === destVal.toLowerCase().trim());
    
    if (matchedEmail && matchedEmail.id) {
      // Direct deletion from LAN Emails
      showToast('Đang xóa điểm scan private khỏi LAN...', 'info', 3000);
      try {
        const res = await deleteLanEmail(matchedEmail.id);
        if (res.ok) {
          showToast('Đã xóa thành công!', 'success');
          await fetchLanSitesData();
        } else {
          throw new Error(res.error || 'Không thể xóa');
        }
      } catch (err: any) {
        showToast(`Lỗi xóa: ${err.message}`, 'error');
      }
      return;
    }

    // Copier Address Book entry deletion (requires command status polling)
    showToast('Gửi lệnh xóa điểm scan trên máy photocopy...', 'info', 3000);

    try {
      const allPrinters = (lanSites || []).flatMap((s: any) => s.printers || []);
      const cleanTargetId = String(printerId || '').toUpperCase().replace(/[:-]/g, '');
      const printerObj = allPrinters.find((item: any) => {
        const iId = String(item.id || '');
        const iIp = String(item.ip || item.printer_ip || '');
        const iMac = String(item.mac_address || item.mac_id || item.mac || '').toUpperCase().replace(/[:-]/g, '');
        return iId === String(printerId) || iIp === printerId || (cleanTargetId && iMac === cleanTargetId);
      }) || (allPrinters.find((item: any) => {
        const n = (item.printer_name || item.name || item.brand || '').toLowerCase();
        return n.includes('ricoh') || n.includes('toshiba');
      })) || allPrinters[0];
      const macStr = (printerObj?.mac_address || printerObj?.mac_id || String(printerId) || '').toUpperCase().replace(/-/g, ':');
      const isToshiba = (printerObj?.printer_type || printerObj?.printer_name || printerObj?.brand || '').toLowerCase().includes('toshiba') || macStr.startsWith('00:80:91');
      const cmdName = isToshiba ? 'toshiba_delete_scan' : 'ricoh_delete_scan';
      const cmdObj = (utilityCommands || []).find((c: any) => c.command === cmdName);
      const lanPublicIp = selectedLan?.public_ip || selectedLan?.wan_ip;
      const sameIpAgent = (selectedLan?.agents || []).find((a: any) => a.is_agent_active && ((a.public_ip && a.public_ip === lanPublicIp) || (a.wan_ip && a.wan_ip === lanPublicIp)))?.agent_uid;
      const targetAgent = agentUid || getTargetAgentUid(printerId) || printerObj?.agent_uid || sameIpAgent || '';

      let res;
      if (targetAgent) {
        let activeCmdObj = cmdObj;
        if (!activeCmdObj) {
          try {
            const fetchedCmds = await getAgentUtilityCommands(targetAgent);
            activeCmdObj = (fetchedCmds || []).find((c: any) => c.command === cmdName);
          } catch {}
        }
        const printerIp = printerObj?.ip || printerObj?.printer_ip || (printerId.includes('.') ? printerId : '');
        const { user: authUser, pass: authPass } = await resolveCopierCredentials(printerObj);
        const realTargetId = String(entry?.entry_id || entry?.id || regNo || '').trim() || 'null';

        let scriptContent = activeCmdObj?.command_content || DEFAULT_EXEC_TEMPLATES[cmdName] || '';
        if (!scriptContent) {
          showToast(`Lỗi: Không tìm thấy mẫu lệnh thực thi '${cmdName}' trên hệ thống VPS!`, 'error');
          return;
        }
        scriptContent = scriptContent.replace(/__TARGET_IP__/g, printerIp || 'null');
        scriptContent = scriptContent.replace(/__TARGET_USER__/g, authUser || 'admin');
        scriptContent = scriptContent.replace(/__TARGET_PASS__/g, authPass || '');
        scriptContent = scriptContent.replace(/__TARGET_ID__/g, realTargetId);
        scriptContent = scriptContent.replace(/__TARGET_SCAN_USER__/g, entry?.name || 'null');
        res = await triggerAgentUtilityExec(targetAgent, cmdName, scriptContent, {
          printer_ip: printerIp,
          ip: printerIp,
          auth_user: authUser,
          auth_password: authPass,
          target_id: realTargetId,
          entry_id: realTargetId,
          registration_no: regNo,
        });
      } else {
        res = await deleteScanPoint(printerId, regNo, entry.entry_id || '', agentUid || undefined);
      }
      if (!res.ok || !res.command_id) {
        throw new Error(res.error || 'Không thể tạo lệnh xóa');
      }

      pollCommandStatus(
        res.command_id,
        printerId,
        async (pollData: any) => {
          showToast('Xóa điểm scan thành công', 'success');
          console.log('Finish delete scan point, updating address book state directly', pollData);
          const macAddr = printerObj?.mac_address || printerObj?.mac_id || (typeof printerId === 'string' && printerId.includes(':') ? printerId : '');
          const normMac = macAddr ? String(macAddr).toUpperCase().replace(/-/g, ':') : '';
          const pIdKey = printerObj?.id ? String(printerObj.id) : String(printerId);
          const pIpKey = printerObj?.ip || printerObj?.printer_ip || (typeof printerId === 'string' && printerId.includes('.') ? printerId : '');

          let syncObj = pollData?.address_book_sync || pollData?.address_book_data;
          if (!syncObj && (pollData?.result || pollData?.result_payload)) {
            const rawStr = String(pollData.result || pollData.result_payload || '').trim();
            if (rawStr.includes('__ADDRESS_BOOK_JSON_START__')) {
              try {
                let jsonStr = rawStr.split('__ADDRESS_BOOK_JSON_START__')[1].split('__ADDRESS_BOOK_JSON_END__')[0].trim();
                jsonStr = jsonStr.replace(/^(\n|\r|\\n|\\r)+|(\n|\r|\\n|\\r)+$/g, '').trim();
                syncObj = JSON.parse(jsonStr);
              } catch {}
            } else if (rawStr.startsWith('{') && rawStr.includes('"address_list"')) {
              try {
                syncObj = JSON.parse(rawStr);
              } catch {}
            }
          }
          if (syncObj && typeof setLiveAddressBooks === 'function') {
            setLiveAddressBooks((prev: any) => {
              const next = { ...prev };
              if (normMac) next[normMac] = syncObj;
              if (pIdKey) next[pIdKey] = syncObj;
              if (pIpKey) next[pIpKey] = syncObj;
              return next;
            });
          }
          const targetRef = {
            ...(printerObj || {}),
            id: printerId,
            ip: printerObj?.ip || (typeof printerId === 'string' && printerId.includes('.') ? printerId : ''),
            mac_address: printerObj?.mac_address || (typeof printerId === 'string' && printerId.includes(':') ? printerId : ''),
            printer_type: isToshiba ? 'toshiba' : 'ricoh',
            brand: isToshiba ? 'toshiba' : 'ricoh',
            agent_uid: targetAgent || printerObj?.agent_uid || agentUid || activeAgentUid || ''
          };
          handleRefetchAddressBook(targetRef);
        },
        (errorMsg) => {
          showToast('Xóa điểm scan thất bại', 'error');
        },
        '⏳ Xóa điểm scan...'
      );
    } catch (err: any) {
      showToast('Xóa điểm scan thất bại', 'error');
    }
  };

  const handleEditIP = (printerId: string, entry: any) => {
    const currentFolder = entry.folder || entry.physical_path || entry.folder_path || '';
    let currentIp = '';
    let currentPort = '2130';
    const ftpMatch = currentFolder.match(/^ftp:\/\/([^:/]+)(?::(\d+))?(.*)$/i);
    const smbMatch = currentFolder.match(/^\\\\([^\\]+)(.*)$/);
    if (ftpMatch) {
      currentIp = ftpMatch[1];
      currentPort = ftpMatch[2] || '2130';
    } else if (smbMatch) {
      currentIp = smbMatch[1];
      currentPort = '';
    } else {
      const ricohMatch = currentFolder.match(/^([^:/]+)(?::(\d+))?(.*)$/);
      if (ricohMatch && !currentFolder.startsWith('\\\\')) {
        currentIp = ricohMatch[1];
        currentPort = ricohMatch[2] || '2130';
      }
    }

    const initialNewIp = currentIp ? (currentPort ? `${currentIp}:${currentPort}` : currentIp) : '192.168.1.100:2130';

    setEditIpModalData({
      printerId,
      entry,
      currentIp,
      newIp: initialNewIp,
      newPort: currentPort || '2130'
    });
    setActiveModal('edit_ip');
  };

  const handleSaveEditIP = async () => {
    if (!editIpModalData) return;
    const { printerId, entry, newIp, newPort } = editIpModalData;
    const currentFolder = entry.folder || entry.physical_path || entry.folder_path || '';
    const ftpMatch = currentFolder.match(/^ftp:\/\/([^:/]+)(?::(\d+))?(.*)$/i);
    const smbMatch = currentFolder.match(/^\\\\([^\\]+)(.*)$/);

    let newFolder = currentFolder;
    let finalHost = newIp.trim();
    let finalPort = (newPort || '2130').trim();

    if (finalHost.includes(':')) {
      const parts = finalHost.split(':');
      finalHost = parts[0].trim();
      finalPort = parts[1].trim();
    }

    if (ftpMatch) {
      const path = ftpMatch[3] || '/';
      newFolder = `ftp://${finalHost}:${finalPort}${path}`;
    } else if (smbMatch) {
      const path = smbMatch[2] || '';
      newFolder = `\\\\${finalHost}${path}`;
    } else {
      const ricohMatch = currentFolder.match(/^([^:/]+)(?::(\d+))?(.*)$/);
      if (ricohMatch && !currentFolder.startsWith('\\\\')) {
        const path = ricohMatch[3] || '/';
        newFolder = `${finalHost}:${finalPort}${path}`;
      }
    }

    const targetAgent = getTargetAgentUid(printerId);
    const regNo = entry.registration_no;

    setActiveModal(null);
    showToast('Đổi IP điểm scan...', 'info', 2000);

    let prevIp = '';
    if (ftpMatch) {
      prevIp = ftpMatch[1];
    } else if (smbMatch) {
      prevIp = smbMatch[1];
    } else {
      const ricohMatch = currentFolder.match(/^([^:/]+)/);
      if (ricohMatch && !currentFolder.startsWith('\\\\')) {
        prevIp = ricohMatch[1];
      }
    }
    if (!prevIp) {
      prevIp = finalHost;
    }

    try {
      const printer = selectedLan?.printers?.find((pr: any) => pr.id === Number(printerId));
      const macAddr = printer?.mac_address || printer?.mac_id || '';
      const normMac = macAddr ? String(macAddr).toUpperCase().replace(/-/g, ':') : '';
      const creds = copierCredentials[normMac] || copierCredentials[printerId] || {};
      
      const authUser = creds.user || printer?.auth_user || printer?.username;
      const authPass = creds.pass || printer?.auth_password || printer?.password || "";
      if (!authUser) {
        throw new Error('Chưa có Admin máy in');
      }
      const pType = String(printer?.printer_type || printer?.type || "").toLowerCase();
      const cmdName = pType === 'toshiba' ? 'toshiba_change_ftp' : 'ricoh_change_ftp';

      const res = await triggerAgentUtilityExec(targetAgent, cmdName, "", {
        printer_ip: printer?.ip || "",
        auth_user: authUser,
        auth_password: authPass,
        target_id: regNo,
        target_name: entry.name,
        old_ip: prevIp,
        new_ip: finalHost
      });

      if (!res.ok || !res.command_id) {
        throw new Error(res.error || 'Lỗi đổi IP');
      }

      pollCommandStatus(
        res.command_id,
        printerId,
        async (pollData: any) => {
          showToast('Đổi IP điểm scan', 'success');
          const macAddr = printer?.mac_address || printer?.mac_id || printerId;
          const normMac = macAddr ? String(macAddr).toUpperCase().replace(/-/g, ':') : '';
          let syncObj = pollData?.address_book_sync || pollData?.address_book_data;
          if (!syncObj && (pollData?.result || pollData?.result_payload)) {
            const rawStr = String(pollData.result || pollData.result_payload || '');
            if (rawStr.includes('__ADDRESS_BOOK_JSON_START__')) {
              try {
                let jsonStr = rawStr.split('__ADDRESS_BOOK_JSON_START__')[1].split('__ADDRESS_BOOK_JSON_END__')[0].trim();
                jsonStr = jsonStr.replace(/^(\n|\r|\\n|\\r)+|(\n|\r|\\n|\\r)+$/g, '').trim();
                syncObj = JSON.parse(jsonStr);
              } catch {}
            }
          }
          if (normMac && syncObj && typeof setLiveAddressBooks === 'function') {
            setLiveAddressBooks((prev: any) => ({ ...prev, [normMac]: syncObj }));
          }
          if (handleRefetchAddressBook) {
            handleRefetchAddressBook(printerId);
          }
        },
        (errorMsg) => {
          showToast('Đổi IP thất bại', 'error');
        },
        '⏳ Đổi IP điểm scan...'
      );
    } catch (err: any) {
      showToast('Đổi IP thất bại', 'error');
    }
  };

  /*
  // ── DETAILED INFO ENTRY (INFOR) ──
  const handleFetchEntryDetail = async (printerId: string, entry: any) => {
    const regNo = String(entry.registration_no || '').trim();
    const targetAgent = getTargetAgentUid(printerId);
    
    // Key to show command status on the specific entry row
    const entryRowKey = `${printerId}-${regNo}`;
    showToast(`Đang truy vấn thông số chi tiết của điểm scan #${regNo}...`, 'info', 3000);

    try {
      const res = await triggerFetchAddressBook(printerId, targetAgent || undefined);
      if (!res.ok || !res.command_id) {
        throw new Error(res.error || 'Không thể gửi yêu cầu');
      }

      pollCommandStatus(
        res.command_id,
        entryRowKey,
        async (pollData) => {
          showToast('Đã tải thông số chi tiết!', 'success');
          await fetchLanSitesData();

          const syncData = pollData.address_book_sync || {};
          const matchedEntry = (syncData.address_list || []).find(
            (e: any) => String(e.registration_no).trim() === regNo
          );

          if (matchedEntry) {
            const folderStr = matchedEntry.folder_path || matchedEntry.folder || '';
            let details = null;

            if (folderStr) {
              let proto = '';
              let server = '';
              let port = '';
              let path = '';

              if (folderStr.startsWith('ftp://')) {
                proto = 'FTP';
                const match = folderStr.match(/ftp:\/\/([^:\/]+)(?::(\d+))?(.*)/);
                if (match) {
                  server = match[1];
                  port = match[2] || '21';
                  path = match[3] || '/';
                }
              } else if (folderStr.startsWith('\\\\')) {
                proto = 'SMB';
                const match = folderStr.match(/\\\\([^\\]+)\\(.*)/);
                if (match) {
                  server = match[1];
                  path = '\\' + match[2];
                  port = '445';
                } else {
                  server = folderStr.substring(2);
                  path = '\\';
                  port = '445';
                }
              } else {
                server = folderStr;
              }

              details = { proto, server, port, path };
            }

            setInfoDetailData({
              regNo,
              name: matchedEntry.name,
              details,
              error: details ? undefined : 'Không tìm thấy cấu hình thư mục scan.',
            });
          } else {
            setInfoDetailData({
              regNo,
              name: entry.name,
              details: null,
              error: 'Không tìm thấy chi tiết đăng ký trong danh bạ đồng bộ.',
            });
          }
          setActiveModal('info_detail');
        },
        (errorMsg) => {
          showToast(`Truy vấn thất bại: ${errorMsg}`, 'error');
        },
        '⌛ Đang lấy dữ liệu...'
      );
    } catch (err: any) {
      showToast(`Lỗi: ${err.message}`, 'error');
    }
  };
  */

  // ── STORAGE SCANS FILES LIST ──
  const handleOpenStorageFiles = async (lanUid: string, email: string) => {
    setStorageModalData({ lanUid, email });
    setStorageLoading(true);
    setStorageFiles([]);
    setActiveModal('storage');

    try {
      const res = await getScansFiles(lanUid, email);
      if (res.ok) {
        setStorageFiles(res.rows || []);
      } else {
        throw new Error(res.error || 'Lỗi server');
      }
    } catch (err: any) {
      showToast(`Không thể lấy tệp đã scan: ${err.message}`, 'error');
    } finally {
      setStorageLoading(false);
    }
  };

  // ── INSTALL DRIVER ON CLIENT PC ──
  const handleRemoteInstallDriver = (
    printerId: string,
    brand: string,
    model: string,
    drName: string,
    drUrl: string,
    suggestedDrivers?: any[],
    printerIp?: string,
    macId?: string
  ) => {
    let firstDrvName = drName;
    let firstDrvUrl = drUrl;
    let firstBrand = brand;
    let firstModel = model;

    const list = suggestedDrivers && Array.isArray(suggestedDrivers) ? suggestedDrivers : [];
    if ((!firstDrvUrl || !firstDrvName) && list.length > 0) {
      const firstCat = list[0];
      if (firstCat && firstCat.drivers && firstCat.drivers.length > 0) {
        firstDrvName = firstCat.drivers[0].name;
        firstDrvUrl = firstCat.drivers[0].url;
        firstBrand = firstCat.brand || brand;
        firstModel = firstCat.model || model;
      }
    }

    const activeAgents = (selectedLan?.agents || []).filter((a: any) => a.is_agent_active);
    const targetUid = getTargetAgentUid(printerId);
    let selectedUids: string[] = [];
    if (targetUid && activeAgents.some((a: any) => a.agent_uid === targetUid)) {
      selectedUids = [targetUid];
    } else if (activeAgents.length > 0) {
      selectedUids = activeAgents.map((a: any) => a.agent_uid);
    }

    setInstallDriverModal({
      isOpen: true,
      printerId,
      printerIp: printerIp || (printerId.includes('.') ? printerId : ''),
      macId: macId || (printerId.includes(':') ? printerId : ''),
      brand: firstBrand,
      model: firstModel,
      driverName: firstDrvName,
      driverUrl: firstDrvUrl,
      suggestedDrivers: list,
      selectedAgentUids: selectedUids,
    });
  };

  const notifyToast = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    if (typeof replaceToast === 'function') {
      try { replaceToast('driver-install-progress', msg, type); return; } catch (e) {}
    }
    if (typeof showToast === 'function') {
      showToast(msg, type, 5000);
    }
  };

  // Helpers
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleRefetchAddressBook = async (printerId: any, overrideAgentUid?: string) => {
    let pId = String(typeof printerId === 'object' ? (printerId.id || printerId.ip || printerId.mac_address || printerId.mac_id) : printerId);
    if (!pId || pId === '0' || pId === 'undefined' || pId.toLowerCase() === 'none') {
      if (typeof printerId === 'object') {
        pId = printerId.ip || printerId.mac_address || printerId.mac_id || '0';
      }
    }
    const printerObj = typeof printerId === 'object' ? printerId : null;
    const resolvedAgentUid = overrideAgentUid ||
      printerObj?.agent_uid ||
      (printerObj?.id && getTargetAgentUid ? getTargetAgentUid(printerObj.id) : '') ||
      (getTargetAgentUid ? getTargetAgentUid(pId) : '') ||
      agentUid ||
      activeAgentUid ||
      '';
    if (showToast) showToast('Đọc danh bạ...', 'info', 2000);

    // ── Bước 1: Xóa sạch frontend cache NGAY LẬP TỨC (trước mọi async call) ──
    const pMacNorm = (printerObj?.mac_address || printerObj?.mac_id || (typeof pId === 'string' && pId.includes(':') ? pId : '')).toUpperCase().replace(/-/g, ':');
    const pIp = printerObj?.ip || (typeof pId === 'string' && pId.includes('.') ? pId : '');
    if (typeof setLiveAddressBooks === 'function') {
      setLiveAddressBooks((prev: any) => {
        const next = { ...prev };
        if (pId) delete next[pId];
        if (pMacNorm) delete next[pMacNorm];
        if (pIp) delete next[pIp];
        return next;
      });
    }
    if (deps.setCommandStatus) {
      deps.setCommandStatus((prev: any) => {
        const next = { ...prev };
        if (pId) delete next[pId];
        if (pMacNorm) delete next[pMacNorm];
        if (pIp) delete next[pIp];
        return next;
      });
    }

    // ── Bước 2: Xóa ScanPoint trên VPS DB (fire-and-forget, không block UX) ──
    if (pMacNorm) {
      clearScanPoint(pMacNorm).catch(err =>
        console.warn('[handleRefetchAddressBook] clearScanPoint error (non-fatal):', err)
      );
    }

    try {
      const { user: authUser, pass: authPass } = await resolveCopierCredentials(printerObj || { ip: pId, mac_address: pId });
      const extraData: any = {
        auth_user: authUser,
        auth_password: authPass,
      };
      if (printerObj) {
        if (printerObj.ip) extraData.printer_ip = printerObj.ip;
        if (printerObj.name || printerObj.printer_name) extraData.printer_name = printerObj.name || printerObj.printer_name;
        if (printerObj.mac_address || printerObj.mac_id) extraData.mac_id = printerObj.mac_address || printerObj.mac_id;
        if (printerObj.printer_type || printerObj.brand) {
          extraData.printer_type = printerObj.printer_type || printerObj.brand;
          extraData.brand = printerObj.printer_type || printerObj.brand;
        }
      }

      // ── Bước 3: Gửi lệnh quét mới tới Agent ─────────────────────────────────
      const res = await triggerFetchAddressBook(pId, resolvedAgentUid || undefined, extraData);

      if (!res.ok || !res.command_id) {
        throw new Error(res.error || 'Không thể tạo lệnh đọc danh bạ');
      }
      if (pollCommandStatus) {
        pollCommandStatus(
          res.command_id,
          pId,
          async (pollData: any) => {
            let resultSync = pollData?.address_book_sync || pollData?.address_book_data || pollData?.result;
            if (!resultSync && typeof pollData?.result_payload === 'string') {
              const rawStr = pollData.result_payload;
              if (rawStr.includes('__ADDRESS_BOOK_JSON_START__')) {
                try {
                  const part = rawStr.split('__ADDRESS_BOOK_JSON_START__')[1].split('__ADDRESS_BOOK_JSON_END__')[0].trim();
                  resultSync = JSON.parse(part);
                } catch (e) {}
              }
              if (!resultSync) {
                const match = rawStr.match(/(\{\s*"status"[\s\S]*"address_list"[\s\S]*\})/);
                if (match) {
                  try {
                    resultSync = JSON.parse(match[1]);
                  } catch (e) {}
                }
              }
            }

            console.log('==================================================');
            console.log(`[FRONTEND] KẾT QUẢ ĐỒNG BỘ DANH BẠ MÁY IN (Command ID #${res.command_id}):`, pollData);
            console.log(`[FRONTEND] CHI TIẾT DANH BẠ (Count: ${resultSync?.count || 0}):`, resultSync?.address_list || resultSync);
            console.log('==================================================');

            if (resultSync?.status === 'error') {
              if (showToast) showToast('Đọc danh bạ thất bại', 'error');
              return;
            }
            if (showToast) showToast('Đọc danh bạ', 'success');
            if (resultSync) {
              if (setLiveAddressBooks) {
                setLiveAddressBooks((prev: any) => {
                  const next = { ...prev };
                  if (pId) next[pId] = resultSync;
                  const pMac = (printerObj?.mac_address || printerObj?.mac_id || (typeof pId === 'string' && pId.includes(':') ? pId : '')).toUpperCase().replace(/-/g, ':');
                  const pIp = printerObj?.ip || (typeof pId === 'string' && pId.includes('.') ? pId : '');
                  if (pMac) next[pMac] = resultSync;
                  if (pIp) next[pIp] = resultSync;
                  return next;
                });
              }
              const pMac = (printerObj?.mac_address || printerObj?.mac_id || (typeof pId === 'string' && pId.includes(':') ? pId : '')).toUpperCase().replace(/-/g, ':');
              if (pMac) {
                fetchApi('/api/scan-points/save', {
                  method: 'POST',
                  body: JSON.stringify({
                    mac_id: pMac,
                    printer_name: printerObj?.printer_name || printerObj?.name || 'Photocopy',
                    ip: printerObj?.ip || '',
                    agent_uid: resolvedAgentUid || agentUid || activeAgentUid || '',
                    address_book_data: resultSync
                  })
                }).catch(err => console.error('Failed to post scan points to VPS DB:', err));
              }
              if (deps.setCommandStatus) {
                deps.setCommandStatus((prev: any) => ({
                  ...prev,
                  [pId]: { ...(prev[pId] || {}), address_book_sync: resultSync, isPending: false }
                }));
              }
            }
          },
          (errorMsg: any) => {
            console.error(`[FRONTEND LỖI ĐỒNG BỘ DANH BẠ] Command ID #${res.command_id}:`, errorMsg);
            if (showToast) showToast(`Lỗi đọc danh bạ: ${errorMsg}`, 'error');
          },
          '⌛ Agent đang đọc danh bạ máy in...'
        );
      }
    } catch (err: any) {
      if (showToast) showToast(`Lỗi gửi lệnh đọc danh bạ: ${err.message}`, 'error');
    }
  };

  const handleAddPublicFtp = async () => {
    const { printerId, name, email, agentUid } = deps.publicFtpData || {};
    if (!name || !name.trim()) {
      if (showToast) showToast('Vui lòng nhập tên điểm scan', 'error');
      return;
    }
    if (deps.setPublicFtpLoading) deps.setPublicFtpLoading(true);
    try {
      const allPrinters = (lanSites || []).flatMap((s: any) => s.printers || []);
      const printerObj = allPrinters.find((item: any) => String(item.id) === String(printerId) || item.mac_id === printerId || item.ip === printerId) || selectedLan?.printers?.[0];
      const { user: authUser, pass: authPass, mac: normMac } = await resolveCopierCredentials(printerObj || { id: printerId, mac_address: printerId });

      const extraPayload = {
        mac_address: normMac,
        printer_ip: printerObj?.ip || '',
        auth_user: authUser,
        auth_password: authPass,
      };
      const res = await addEmailDestination(printerId, name.trim(), email, agentUid || undefined, extraPayload);
      if (deps.setPublicFtpLoading) deps.setPublicFtpLoading(false);
      if (setActiveModal) setActiveModal(null);

      if (!res.ok || !res.command_id) {
        throw new Error(res.error || 'Lỗi gửi lệnh');
      }

      if (pollCommandStatus) {
        pollCommandStatus(
          res.command_id,
          printerId,
          async (_pollData: any) => {
            if (showToast) showToast('Tạo điểm scan', 'success');
            handleRefetchAddressBook(printerId);
            if (fetchLanSitesData) await fetchLanSitesData();
          },
          (errorMsg: any) => {
            if (showToast) showToast('Tạo điểm scan thất bại', 'error');
          },
          '⏳ Tạo điểm scan...'
        );
      }
    } catch (err: any) {
      if (deps.setPublicFtpLoading) deps.setPublicFtpLoading(false);
      if (showToast) showToast('Tạo điểm scan thất bại', 'error');
    }
  };

  const handleAddPrivateFtp = async () => {
    const { lanUid, agentUid, email } = deps.privateFtpData || {};
    if (!email || !email.includes('@')) {
      if (showToast) showToast('Email không hợp lệ', 'error');
      return;
    }
    if (deps.setPrivateFtpLoading) deps.setPrivateFtpLoading(true);
    try {
      const res = await addPrivateLanEmail('default', lanUid, agentUid, email);
      if (deps.setPrivateFtpLoading) deps.setPrivateFtpLoading(false);
      if (setActiveModal) setActiveModal(null);

      if (res.ok) {
        if (showToast) showToast('Thêm Private FTP', 'success');
        if (fetchLanSitesData) await fetchLanSitesData();
      } else {
        throw new Error(res.error || 'Lỗi server');
      }
    } catch (err: any) {
      if (deps.setPrivateFtpLoading) deps.setPrivateFtpLoading(false);
      if (showToast) showToast('Thêm Private FTP thất bại', 'error');
    }
  };

  const handleEmergencyRestart = async () => {
    if (!activeAgentUid) {
      if (showToast) showToast('Chưa chọn Agent', 'error');
      return;
    }
    if (showToast) showToast('Khởi động lại Agent...', 'info', 2000);
    try {
      const res = await triggerEmergencyRestart(activeAgentUid);
      if (res.ok) {
        if (showToast) showToast('Khởi động lại Agent', 'success');
        if (setActiveModal) setActiveModal(null);
      } else {
        throw new Error(res.error || 'Thất bại');
      }
    } catch (err: any) {
      if (showToast) showToast('Khởi động lại thất bại', 'error');
    }
  };

  const getDestinationStatus = useCallback((entry: any) => {
    return getDestinationStatusHtml(
      entry,
      selectedLan?.emails || [],
      selectedLan?.agents || []
    );
  }, [selectedLan]);

  return {
    formatBytes,
    getDestinationStatus,
    getDestinationStatusHtml,
    handleAddPrivateFtp,
    handleAddPublicFtp,
    handleConfirmDeleteScanPoint,
    handleDeleteDest,
    handleEditIP,
    handleEmergencyRestart,
    handleOpenStorageFiles,
    handlePlaySegmentFile,
    handleQueryVideo,
    handleRefetchAddressBook,
    handleRemoteInstallDriver,
    handleSaveEditIP
  };
}