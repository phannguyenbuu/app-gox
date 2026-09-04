// @ts-nocheck
import { addEmailDestination, addPrivateLanEmail, deleteEmailDestination, deleteLanEmail, getAgentSettings, getAgentUtilityCommands, getCommandStatus, getJobs, getLanSites, getScansFiles, installDriverOnAgent, modifyDeviceAddress, saveCopierCredentials, triggerAgentUtility, triggerAgentUtilityExec, triggerEmergencyRestart, triggerFetchAddressBook, updateAgentSettings } from '../../../api/mockAgentApi';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AgentApi } from '../../../api/AgentApi';
const BASE_URL = import.meta.env.VITE_API_URL || 'https://agentapi.quanlymay.com';

export const useAgentCameraVnc = (deps: any = {}) => {
  const { cameraForm, cameras, customRecordDuration, directLan, fetchCameraFiles, fetchCameraStatus, fetchCameras, isRecording30s, setActiveModal, setAllocatedVncAddr, setCameraTestLoading, setCameraTestResult, setIsRecording30s, setRecording30sCountdown, setSelectedCamera, setToshibaVncData, setVncTunnelLoading, showToast } = deps;
  const handleTestCameraConnection = async (agentUid: string) => {
    setCameraTestLoading(true);
    setCameraTestResult(null);
    try {
      const response = await fetch(`${BASE_URL}/api/agents/${agentUid}/cameras/0/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rtsp_url: cameraForm.rtsp_url })
      });
      const data = await response.json();
      if (data.ok && data.result) {
        setCameraTestResult(data.result);
      } else {
        setCameraTestResult({ ok: false, msg: data.error || 'Lỗi kiểm tra kết nối' });
      }
    } catch (err: any) {
      setCameraTestResult({ ok: false, msg: 'Lỗi: ' + err.message });
    } finally {
      setCameraTestLoading(false);
    }
  };

  const handleSaveCameraConfig = async (agentUid: string) => {
    try {
      const response = await fetch(`${BASE_URL}/api/agents/${agentUid}/cameras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cameraForm)
      });
      const data = await response.json();
      if (data.ok) {
        showToast('Lưu camera', 'success');
        fetchCameras(agentUid);
        setSelectedCamera(null);
      } else {
        showToast('Lưu camera thất bại', 'error');
      }
    } catch (err: any) {
      showToast('Lưu camera thất bại', 'error');
    }
  };

  const handleDeleteCamera = async (agentUid: string, cameraId: number) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa cấu hình camera này?')) return;
    try {
      const response = await fetch(`${BASE_URL}/api/agents/${agentUid}/cameras/${cameraId}/delete`, { method: 'POST' });
      const data = await response.json();
      if (data.ok) {
        showToast('Xóa camera', 'success');
        fetchCameras(agentUid);
        setSelectedCamera(null);
      } else {
        showToast('Xóa camera thất bại', 'error');
      }
    } catch (err: any) {
      showToast('Xóa camera thất bại', 'error');
    }
  };



  const handleRecord30s = async (agentUid: string, cameraId: number) => {
    if (isRecording30s) return;
    
    const camera = cameras.find((c: any) => c.id === cameraId);
    const macAddress = camera?.mac_address || '';
    
    if (!macAddress) {
      showToast('Không có MAC ID', 'error');
      return;
    }

    setIsRecording30s(true);
    setRecording30sCountdown(customRecordDuration);

    // Start visual countdown timer
    let count = customRecordDuration;
    const interval = setInterval(() => {
      count -= 1;
      setRecording30sCountdown(Math.max(count, 0));
      if (count <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    try {
      showToast(`Ghi hình ${customRecordDuration}s...`, 'info', 2000);
      const response = await fetch(`${BASE_URL}/api/cameras/record-control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mac_id: macAddress,
          action: 'record',
          duration: customRecordDuration
        })
      });
      const data = await response.json();
      clearInterval(interval);
      
      if (data.ok) {
        showToast(`Ghi hình ${customRecordDuration}s`, 'success');
      } else {
        showToast('Ghi hình thất bại', 'error');
      }
    } catch (err: any) {
      clearInterval(interval);
      showToast('Ghi hình thất bại', 'error');
    } finally {
      setIsRecording30s(false);
      setTimeout(() => {
        fetchCameraStatus(agentUid, cameraId);
        fetchCameraFiles(agentUid, cameraId);
      }, 1500);
    }
  };

  const handleDeleteCameraFile = async (agentUid: string, cameraId: number, filename: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa tệp video này khỏi máy trạm?\nFile: ${filename}`)) return;
    try {
      const response = await fetch(`${BASE_URL}/api/agents/${agentUid}/cameras/${cameraId}/delete-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
      });
      const data = await response.json();
      if (data.ok) {
        showToast('Đã xóa tệp video thành công!', 'success');
        fetchCameraFiles(agentUid, cameraId);
      } else {
        showToast('Lỗi xóa tệp: ' + data.error, 'error');
      }
    } catch (err: any) {
      showToast('Lỗi hệ thống: ' + err.message, 'error');
    }
  };

  // @ts-ignore
  const handleStartToshibaVnc = async (printerIp: string, printerName: string, agentUid: string) => {
    setToshibaVncData({ ip: printerIp, printerName: printerName, agentUid: agentUid });
    setAllocatedVncAddr('');
    setActiveModal('toshiba_vnc');

    if (directLan) {
      setAllocatedVncAddr(`${printerIp}:49105`);
      return;
    }

    setVncTunnelLoading(true);
    try {
      const response = await fetch(`${BASE_URL}/api/agents/${agentUid}/tunnel/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printer_ip: printerIp, printer_port: 49105 })
      });
      const data = await response.json();
      if (data.ok && data.url_port) {
        const cleanAddr = data.url_port.replace('http://', '').replace('https://', '');
        setAllocatedVncAddr(cleanAddr);
      } else {
        showToast('Không thể mở đường hầm VNC: ' + (data.error || 'Lỗi không xác định'), 'error');
        setActiveModal(null);
      }
    } catch (err: any) {
      showToast('Lỗi kết nối VPS: ' + (err.message || err), 'error');
      setActiveModal(null);
    } finally {
      setVncTunnelLoading(false);
    }
  };


  return { cameraForm, cameras, customRecordDuration, directLan, fetchCameraFiles, fetchCameraStatus, fetchCameras, handleDeleteCamera, handleDeleteCameraFile, handleRecord30s, handleSaveCameraConfig, handleStartToshibaVnc, handleTestCameraConnection, isRecording30s, setActiveModal, setAllocatedVncAddr, setCameraTestLoading, setCameraTestResult, setIsRecording30s, setRecording30sCountdown, setSelectedCamera, setToshibaVncData, setVncTunnelLoading, showToast };
}