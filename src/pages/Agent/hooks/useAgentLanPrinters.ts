// @ts-nocheck
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchApi, getLanSites, purgeLanPrinters, saveCopierCredentials, triggerAgentUtilityExec } from '../../../api/mockAgentApi';
import { verifyNetworkAccess } from '../../../api/mockApi';
import { useAuthStore } from '../../../stores/authStore';

export const useAgentLanPrinters = (deps: any = {}) => {
  const { showToast, pollCommandStatus, utilityCommands } = deps;

  const [lanSites, setLanSites] = useState<any[]>([]);
  const [selectedPublicIp, setSelectedPublicIp] = useState<string>(() => {
    // Preference: restore IP user đã nhập lần trước (không phải IoT data)
    return localStorage.getItem('goxprint_selected_public_ip') || localStorage.getItem('gox_connect_public_ip') || '';
  });
  // Fix B: không init từ localStorage — luôn auto-detect từ data mới sau fetch
  const [selectedLanUid, setSelectedLanUid] = useState<string>('');
  const [targetInternalIp, setTargetInternalIp] = useState<string>(() => {
    return localStorage.getItem('goxprint_target_internal_ip') || '';
  });
  const [lanSitesLoading, setLanSitesLoading] = useState(false);

  const [expandedPrinters, setExpandedPrinters] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('goxprint_expanded_printers');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [copierCredentials, setCopierCredentials] = useState<Record<string, { user: string; pass: string }>>({});
  const [saveAuthLoading, setSaveAuthLoading] = useState<Record<string, boolean>>({});
  const [selectedTargetAgents, setSelectedTargetAgents] = useState<Record<string, string>>({});
  const [liveAddressBooks, setLiveAddressBooks] = useState<Record<string, any>>({});

  const [editIpModalData, setEditIpModalData] = useState<{
    isOpen: boolean;
    copier: any;
    oldIp: string;
    newIp: string;
    targetAgentUid: string;
    status: string;
    error: string;
  }>({
    isOpen: false,
    copier: null,
    oldIp: '',
    newIp: '',
    targetAgentUid: '',
    status: '',
    error: ''
  });

  const [accessDeniedState, setAccessDeniedState] = useState<{
    isOpen: boolean;
    ip: string;
  }>({
    isOpen: false,
    ip: ''
  });

  const [myClientIp, setMyClientIp] = useState<string>('');

  const autoScanTriggers = useRef<Record<string, number>>({});

  // Fix F: useState thay useMemo(deps=[]) — rõ ràng hơn về việc chỉ capture một lần khi mount
  const [lastViewedId] = useState<string | null>(() =>
    localStorage.getItem('goxprint_last_viewed_copier_id')
  );

  // Fix C: ref để fetchLanSitesData luôn đọc selectedPublicIp hiện tại mà không cần deps
  const selectedPublicIpRef = useRef(selectedPublicIp);
  useEffect(() => { selectedPublicIpRef.current = selectedPublicIp; }, [selectedPublicIp]);


  const fetchLanSitesData = useCallback(async (isUserRefresh = false, overrideIp?: string, overrideMacs?: string[]) => {
    if (isUserRefresh) setLanSitesLoading(true);
    // Cho phép truyền thẳng IP muốn dùng thay vì đọc selectedPublicIpRef —
    // vì setSelectedPublicIp(x) rồi gọi fetchLanSitesData(true) ngay sau đó
    // (cùng 1 lượt gọi đồng bộ) sẽ đọc phải giá trị ref CŨ, do ref chỉ được
    // đồng bộ qua 1 useEffect chạy SAU khi React commit re-render — không kịp
    // trước khi hàm này đã bắt đầu chạy. Đây là nguyên nhân "Mở IP có sẵn" /
    // "Kết nối IP" verify nhầm sang IP cũ, dẫn tới bị từ chối (403) sai.
    const activeIpNow = (overrideIp !== undefined ? overrideIp : selectedPublicIpRef.current).trim();
    if (overrideIp !== undefined) selectedPublicIpRef.current = overrideIp;
    try {
      const data = await getLanSites(activeIpNow || undefined);
      const rows = data?.rows || (Array.isArray(data) ? data : []);
      setLanSites(rows);

      try {
        const clientIp = (data?.client_ip || '').trim();
        if (clientIp) setMyClientIp(clientIp);
        const activePublicIps = data?.active_public_ips || [];
        const effectiveIp = activeIpNow || clientIp;

        const matchedAgents: any[] = [];
        rows.forEach((site: any) => {
          (site.agents || []).forEach((ag: any) => {
            const agPub = (ag.public_ip || ag.wan_ip || ag.ip || '').trim();
            const agLoc = (ag.local_ip || '').trim();
            if (effectiveIp && ((agPub && agPub === effectiveIp) || (agLoc && agLoc === effectiveIp))) {
              matchedAgents.push(ag);
            }
          });
        });

        const isSameNetwork = matchedAgents.length > 0;

        console.log('==================================================');
        console.log('🌐 [PUBLIC IP ACCESS CONTROL CHECK]');
        console.log('📌 IP Public hiện tại của trình duyệt:', clientIp);
        if (activeIpNow) console.log('⚡ IP Public do người dùng chỉ định kết nối:', activeIpNow);
        console.log('🛡️ Danh sách Public IP đang Active trên Server:', activePublicIps);
        console.log('👥 Cùng mạng với 1 Agent nào đó (isSameNetwork):', isSameNetwork);
        console.log('==================================================');
        // Lưu ý: quyết định cấp quyền thật sự KHÔNG còn dựa vào isAllowed/isSameNetwork
        // ở đây nữa — chuyển toàn bộ sang verifyNetworkAccess() (CRM đối chiếu MAC theo
        // đúng danh sách /apps/printer/list, hoặc phiếu công việc active) bên dưới, để
        // tránh 2 lớp chặn xung đột nhau (lớp cũ từng return sớm trước khi lớp MAC/CRM
        // mới kịp chạy, khiến kỹ thuật luôn bị đẩy ra màn "mở trực tiếp" dù MAC hợp lệ).

        console.log('[FRONTEND SCANPOINTS VPS] DANH SÁCH DANH BẠ TỪ SCANPOINTS VPS (< 3 NGÀY):');
        rows.forEach((site: any) => {
          (site.printers || []).forEach((p: any) => {
            const sync = p.address_book_sync || {};
            const list = Array.isArray(sync.address_list) ? sync.address_list : (sync.address_book_data?.address_list || []);
            const macStr = p.mac_address || p.mac_id || '—';
            if (list.length > 0) {
              console.log(`📌 Máy in [${p.printer_name || p.name}] - IP: ${p.ip} | MAC: ${macStr} (${list.length} điểm scan trong ScanPoints VPS):`, list);
            }
          });
        });
        console.log('==================================================');
      } catch (logErr) {
        console.error('Console log error:', logErr);
      }

      if (rows.length > 0) {
        const findSiteByIp = (ip: string) => rows.find((s: any) => {
          const pubIp = (s.public_ip || s.wan_ip || '').trim();
          if (pubIp === ip) return true;
          return (s.agents || []).some((ag: any) => (ag.public_ip || ag.wan_ip || ag.ip || '').trim() === ip);
        });
        const normMac = (m: any) => String(m || '').toUpperCase().replace(/[^0-9A-F]/g, '');
        // QUAN TRỌNG: lan_uid KHÔNG phải khoá ổn định như tưởng — với 1 site đã
        // có Public IP "xác nhận", agentapi tự đổi lan_uid của site đó thành
        // chính chuỗi Public IP hiện tại (nên nó trôi theo IP luôn). Khoá thật
        // sự ổn định duy nhất là MAC của từng máy — nếu caller đã biết trước
        // các MAC thuộc site này (vd "Mở IP có sẵn", resolve qua endpoint
        // workstation luôn tươi mới), ưu tiên tìm site chứa MAC đó thay vì
        // so khớp IP/lan_uid (đều có thể lag so với IP thật hiện tại).
        const findSite = (ip: string, macs?: string[]) => {
          if (macs && macs.length > 0) {
            const macSet = new Set(macs.map(normMac).filter(Boolean));
            const byMac = rows.find((s: any) =>
              (s.printers || []).some((p: any) => macSet.has(normMac(p.mac_address || p.mac_id)))
            );
            if (byMac) return byMac;
          }
          return findSiteByIp(ip);
        };

        const activeIp = activeIpNow;
        let nextLanUid = '';

        if (activeIp) {
          const matchedSite = findSite(activeIp, overrideMacs);
          if (matchedSite) {
            localStorage.setItem('goxprint_selected_lan_uid', matchedSite.lan_uid);
            nextLanUid = matchedSite.lan_uid;
          } else {
            // IP user nhập nhưng không match site nào — giữ IP làm LAN UID tạm
            nextLanUid = activeIp;
          }

          // Luôn đối chiếu MAC tại site đó với CRM (Logic 1), hoặc tự động
          // duyệt/từ chối theo phiếu công việc active (Logic 2) — kể cả khi
          // đây là lần tải trang đầu tiên với 1 IP đã lưu từ localStorage,
          // không chỉ khi kỹ thuật chủ động bấm gửi lại (isUserRefresh).
          const macsAtSite = matchedSite
            ? (matchedSite.printers || [])
                .map((p: any) => (p.mac_address || p.mac_id || '').trim())
                .filter(Boolean)
            : [];
          const token = useAuthStore.getState().token;
          verifyNetworkAccess(token || '', { macs: macsAtSite, public_ip: activeIp, request_type: 'lookup' })
            .then((result) => {
              if (!result.ok || result.access !== 'full') {
                setAccessDeniedState({ isOpen: true, ip: activeIp });
                setSelectedLanUid('');
                localStorage.removeItem('goxprint_selected_lan_uid');
              } else if (result.access_type === 'auto_approved_task' && showToast) {
                showToast(`✔ Đã tự động duyệt qua phiếu công việc #${result.auto_approved_via}`, 'success', 4000);
              }
            })
            .catch(() => {});
        } else {
          // Khi chưa có IP user chỉ định: kiểm tra xem IP Public hiện tại (client_ip) có khớp mạng LAN nào không
          const detectedClientIp = (data?.client_ip || '').trim();
          if (detectedClientIp) {
            const matchedSite = findSiteByIp(detectedClientIp);
            if (matchedSite) {
              localStorage.setItem('goxprint_selected_lan_uid', matchedSite.lan_uid);
              nextLanUid = matchedSite.lan_uid;
            }
          }
          // TUYỆT ĐỐI CẤM FALLBACK: Không khớp mạng hiện tại và chưa chọn IP -> KHÔNG CHỌN, để trống
          if (!nextLanUid) localStorage.removeItem('goxprint_selected_lan_uid');
        }

        setSelectedLanUid(nextLanUid);
      } else {
        setSelectedLanUid('');
      }
      if (isUserRefresh) showToast('Tải mạng LAN', 'success');
    } catch (err: any) {
      console.error('Failed to fetch LAN sites:', err);
      if (isUserRefresh) showToast('Tải mạng LAN thất bại', 'error');
    } finally {
      setLanSitesLoading(false);
    }
  }, [showToast]);

  // Fetch lần đầu khi mount
  useEffect(() => {
    fetchLanSitesData();
  }, [fetchLanSitesData]);

  // Auto-refresh mỗi 60 giây — backend đã tự detect IP change, frontend chỉ cần đọc lại DB
  // luôn cập nhật mà không cần user thao tác thủ công
  useEffect(() => {
    const interval = setInterval(() => {
      fetchLanSitesData(); // silent: isUserRefresh=false → không hiện loading/toast
    }, 60_000);
    return () => clearInterval(interval);
  }, [fetchLanSitesData]);

  const filteredLanSites = useMemo(() => {
    if (!lanSites || lanSites.length === 0) return [];
    // Fix D: chỉ dùng state — không đọc localStorage trong useMemo
    const activePublicIp = selectedPublicIp.trim();
    if (activePublicIp) {
      const filtered = lanSites.filter((site) => {
        const sitePub = (site.public_ip || site.wan_ip || '').trim();
        if (sitePub === activePublicIp) return true;
        return (site.agents || []).some((ag: any) => {
          const agPub = (ag.public_ip || ag.wan_ip || ag.ip || '').trim();
          return agPub === activePublicIp;
        });
      });
      if (filtered.length > 0) return filtered;
      // Fix D: trả về rỗng thay vì fake placeholder — UI sẽ hiện "Không tìm thấy LAN"
      return [];
    }
    return lanSites;
  }, [lanSites, selectedPublicIp]);

  const selectedLan = useMemo(() => {
    // Ưu tiên selectedLanUid trước — đây là kết quả đã resolve đúng qua MAC
    // (ổn định) ở fetchLanSitesData, trong khi so khớp theo Public IP dưới
    // đây có thể trật vì trường public_ip/wan_ip lưu theo site có thể lag so
    // với IP thật sự hiện tại của Agent (site đã "xác nhận" IP sẽ tự đổi
    // lan_uid của nó thành chính IP đó, nên IP cũ vẫn còn sót lại 1 lúc).
    if (lanSites && lanSites.length > 0 && selectedLanUid) {
      const siteByUid = lanSites.find((site) => site.lan_uid === selectedLanUid);
      if (siteByUid) return siteByUid;
    }

    // Fix E: chỉ dùng state — không đọc localStorage trong useMemo
    const activePublicIp = selectedPublicIp.trim();
    if (activePublicIp) {
      if (lanSites && lanSites.length > 0) {
        const siteByPubIp = lanSites.find((site) => {
          const sitePub = (site.public_ip || site.wan_ip || site.lan_uid || '').trim();
          if (sitePub === activePublicIp) return true;
          return (site.agents || []).some((ag: any) => {
            const agPub = (ag.public_ip || ag.wan_ip || ag.ip || '').trim();
            return agPub === activePublicIp;
          });
        });
        if (siteByPubIp) return siteByPubIp;
      }
      return {
        lead: 'default',
        lan_uid: activePublicIp,
        lan_name: `IP Public ${activePublicIp}`,
        public_ip: activePublicIp,
        wan_ip: activePublicIp,
        active_agents: 0,
        agents: [],
        emails: [],
        printers: [],
      };
    }
    // TUYỆT ĐỐI CẤM FALLBACK sang siteWithPrinters hoặc lanSites[0]!
    return null;
  }, [lanSites, selectedPublicIp, selectedLanUid]);

  const triggerLanScan = useCallback((lanData: any, isManual = true) => {
    if (!lanData || !lanData.lan_uid) {
      showToast('Không có mạng LAN nào được chọn để thực hiện quét!', 'error', 4000);
      return;
    }
    const currentLanUid = lanData.lan_uid;
    const now = Date.now();

    // ── Chặn bấm liên tục khi lệnh quét đang chạy ──────────────────────────
    const isScanPending = deps.commandStatus?.[`scan_lan_${currentLanUid}`]?.isPending;
    if (isScanPending) {
      showToast('Đang quét mạng LAN, vui lòng chờ lệnh hiện tại hoàn tất...', 'warning', 3000);
      return;
    }

    // ── Cooldown: tối thiểu 10s cho bấm tay, 30s cho auto-scan ────────────
    const lastScan = autoScanTriggers.current[currentLanUid] || 0;
    if (isManual && now - lastScan < 10 * 1000) {
      showToast('Vui lòng chờ ít nhất 10 giây giữa các lần quét mạng LAN.', 'warning', 2500);
      return;
    }
    if (!isManual && now - lastScan < 30 * 1000) {
      return;
    }

    autoScanTriggers.current[currentLanUid] = now;

    // ── Kiểm tra Agent trực thuộc LAN (TUYỆT ĐỐI KHÔNG FALLBACK sang LAN khác) ──
    const activeAgentsList = (lanData.agents || []).filter((a: any) => a.is_agent_active);
    if (!activeAgentsList || activeAgentsList.length === 0) {
      showToast(`Không có Agent nào trực thuộc mạng LAN ${currentLanUid} đang hoạt động để thực hiện quét!`, 'error', 4000);
      return;
    }

    // ── Xóa sạch Printer + DeviceInfor cũ trên VPS trước khi quét ───────────
    // Fire-and-forget: không block scan, lỗi không ảnh hưởng UX
    purgeLanPrinters(currentLanUid).catch(err =>
      console.warn('[triggerLanScan] purgeLanPrinters error (non-fatal):', err)
    );

    activeAgentsList.sort((a: any, b: any) => {
      const tA = new Date(a.last_seen || a.updated_at || a.last_ping || 0).getTime();
      const tB = new Date(b.last_seen || b.updated_at || b.last_ping || 0).getTime();
      return tB - tA;
    });

    const targetAgent = activeAgentsList[0];
    if (targetAgent && pollCommandStatus) {
      showToast('Quét mạng LAN...', 'info', 3000);
      deps.setCommandStatus?.((prev: any) => ({
        ...prev,
        [`scan_lan_${currentLanUid}`]: { message: '⏳ Quét mạng LAN...', isPending: true }
      }));
      const a = targetAgent;

      const payload = {
        command: 'force_subnet_scan',
        lead: lanData.lead
      };
      fetchApi(`/api/agents/${a.agent_uid}/utility/exec?lead=default`, {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      .then(data => {
        const cmdId = data?.command_id || data?.id;
        if (cmdId) {
          if (data?.skipped) {
            showToast(data.message || 'Lệnh quét mạng đang được Agent thực thi...', 'info', 3000);
          }
          pollCommandStatus(
            Number(cmdId),
                `scan_lan_${currentLanUid}`,
                async (pollData: any) => {
                  console.log("🔍 [PRINTAGENT RESULT] Kết quả force_subnet_scan:", pollData);
                  let freshPrinters: any[] = [];
                  const rawRes = pollData?.result || pollData?.result_payload || pollData?.output || pollData?.error_message || pollData?.raw || '';
                  
                  if (Array.isArray(rawRes)) {
                    freshPrinters = rawRes;
                  } else if (typeof rawRes === 'string' && rawRes.trim()) {
                    try {
                      const directParsed = JSON.parse(rawRes.trim());
                      if (Array.isArray(directParsed)) freshPrinters = directParsed;
                    } catch {}

                    if (freshPrinters.length === 0) {
                      try {
                        let jsonStr = '';
                        if (rawRes.includes('__PRINTERS_JSON_START__')) {
                          jsonStr = rawRes.split('__PRINTERS_JSON_START__')[1].split('__PRINTERS_JSON_END__')[0].trim();
                        } else {
                          const cleanMatch = rawRes.match(/(?:^|\n)\s*(\[\s*\{[\s\S]*\}\s*\])/);
                          if (cleanMatch) {
                            jsonStr = cleanMatch[1];
                          } else {
                            const jsonArrayMatch = rawRes.match(/(\[\s*\{[\s\S]*\}\s*\])/);
                            if (jsonArrayMatch) {
                              jsonStr = jsonArrayMatch[1];
                            }
                          }
                        }
                        if (jsonStr) {
                          const parsed = JSON.parse(jsonStr);
                          if (Array.isArray(parsed)) freshPrinters = parsed;
                        }
                      } catch (e) {
                        console.error("🔍 [Frontend] Lỗi parse JSON máy in:", e);
                      }
                    }
                  }
                  
                  if (freshPrinters.length > 0) {
                    showToast('Lan scan done!', 'success', 4000);
                    try {
                      await fetchApi('/api/new-devices', {
                        method: 'POST',
                        body: JSON.stringify({
                          lan_uid: currentLanUid || 'default',
                          devices: freshPrinters
                        })
                      });
                    } catch (err) {}
                    fetchLanSitesData();
                  } else {
                    showToast('Lan scan done!', 'success', 4000);
                  }
                },
                async (_err: any) => {
                  showToast('Quét mạng LAN thất bại', 'error', 4000);
                },
                '⏳ Quét mạng LAN...'
              );
            }
          })
          .catch(e => {
            console.error(e);
          });
      }
  }, [showToast, pollCommandStatus, utilityCommands]);

  const filteredPrinters = useMemo(() => {
    if (!selectedLan) return [];
    const cleanTargetIp = (targetInternalIp || '').trim().toLowerCase();
    const filtered = (selectedLan.printers || []).filter((p: any) => {
      const name = (p.printer_name || p.name || '').toLowerCase().trim();
      const ip = (p.ip || p.printer_ip || '').toLowerCase().trim();
      if (name.includes('unknown') || name === 'unknown printer') return false;
      if (
        name.includes('pdf') ||
        name.includes('fax') ||
        name.includes('brother') ||
        name.includes('canon lbp') ||
        name.includes('rustdesk')
      ) {
        return false;
      }
      if (cleanTargetIp) {
        const isMatch = ip === cleanTargetIp || ip.includes(cleanTargetIp) || (cleanTargetIp.includes('.') && ip.endsWith(cleanTargetIp));
        if (!isMatch) return false;
      }
      return true;
    });

    if (lastViewedId) {
      return [...filtered].sort((a, b) => {
        const aMatch = String(a.id) === lastViewedId;
        const bMatch = String(b.id) === lastViewedId;
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        return 0;
      });
    }

    return filtered;
  }, [selectedLan, targetInternalIp, lastViewedId]);

  const getTargetAgentUid = useCallback((printerId: string | number) => {
    if (!selectedLan) return '';
    const rawStr = String(printerId || '').trim();
    const cleanTarget = rawStr.toUpperCase().replace(/[:-]/g, '');

    const printer = selectedLan?.printers?.find((p: any) => {
      const pMac = String(p?.mac_address || p?.mac_id || p?.mac || '').toUpperCase().replace(/[:-]/g, '');
      return (cleanTarget && pMac === cleanTarget) || p.ip === rawStr || String(p.id) === rawStr;
    });

    const onlineAgents = (selectedLan.agents || []).filter((a: any) => a.is_agent_active);
    const pMacNorm = (printer?.mac_address || printer?.mac_id || (rawStr.includes(':') ? rawStr : '')).toUpperCase().replace(/-/g, ':');
    const selected = (pMacNorm && selectedTargetAgents[pMacNorm]) || 
                     selectedTargetAgents[rawStr] || 
                     (printer?.id && selectedTargetAgents[printer.id]) ||
                     (printer?.ip && selectedTargetAgents[printer.ip]);
    if (selected) {
      const isSelOnline = onlineAgents.some((a: any) => a.agent_uid === selected);
      if (isSelOnline) return selected;
    }
    const lanPublicIp = selectedLan.public_ip || selectedLan.wan_ip;
    const sameIpAgent = onlineAgents.find((a: any) => (a.public_ip && a.public_ip === lanPublicIp) || (a.wan_ip && a.wan_ip === lanPublicIp));
    const matchedAgent = (printer?.agent_uid ? onlineAgents.find((a: any) => a.agent_uid === printer.agent_uid) : null) || sameIpAgent;
    return matchedAgent ? matchedAgent.agent_uid : (printer?.agent_uid || '');
  }, [selectedLan, selectedTargetAgents]);

  const handleCopierClick = (printerId: string) => {
    localStorage.setItem('goxprint_last_viewed_copier_id', printerId);
  };

  useEffect(() => {
    if (selectedLan) {
      const defaultTargets: Record<string, string> = {};

      selectedLan.printers.forEach((p: any) => {
        const onlineAgents = (selectedLan.agents || []).filter((a: any) => a.is_agent_active);
        const lanPublicIp = selectedLan.public_ip || selectedLan.wan_ip;
        const sameIpAgent = onlineAgents.find((a: any) => (a.public_ip && a.public_ip === lanPublicIp) || (a.wan_ip && a.wan_ip === lanPublicIp));
        const matchedAgent = (p.agent_uid ? onlineAgents.find((a: any) => a.agent_uid === p.agent_uid) : null) || sameIpAgent;
        const chosen = matchedAgent ? matchedAgent.agent_uid : (p.agent_uid || '');
        const pMac = (p.mac_address || p.mac_id || '').toUpperCase().replace(/-/g, ':');
        if (pMac) defaultTargets[pMac] = chosen;
        if (p.ip) defaultTargets[p.ip] = chosen;
        if (p.id !== undefined && p.id !== null) defaultTargets[p.id] = chosen;
      });

      setSelectedTargetAgents((prev) => ({ ...defaultTargets, ...prev }));

      setCopierCredentials((prev) => {
        const next = { ...prev };
        selectedLan.printers.forEach((p: any) => {
          const agentPushUser = p.auth_user || p.user || '';
          const agentPushPass = p.auth_password || p.password || '';

          const pMac = (p.mac_address || p.mac_id || '').toUpperCase().replace(/-/g, ':');
          const existing = (pMac && next[pMac]) || next[p.id] || (p.ip && next[p.ip]);
          const user = (existing?.user !== undefined) ? existing.user : agentPushUser;
          const pass = (existing?.pass !== undefined) ? existing.pass : agentPushPass;

          if (pMac) next[pMac] = { user, pass };
          if (p.ip) next[p.ip] = { user, pass };
          if (p.id !== undefined && p.id !== null) next[p.id] = { user, pass };
        });
        return next;
      });
    }
  }, [selectedLan]);

  const handleSaveAuth = async (p: any) => {
    const printerId = String(typeof p === 'object' ? p.id : p);
    const rawMac = typeof p === 'object' ? (p.mac_id || p.mac_address || '') : '';
    const normMac = rawMac ? rawMac.toUpperCase().replace(/-/g, ':') : '';
    const pType = typeof p === 'object' ? (p.printer_type || p.type || '') : '';
    const creds = (normMac && copierCredentials[normMac]) || copierCredentials[printerId] || { user: '', pass: '' };

    setSaveAuthLoading((prev) => ({ ...prev, [printerId]: true, ...(normMac ? { [normMac]: true } : {}) }));
    try {
      const res = await saveCopierCredentials(normMac || printerId, creds.user, creds.pass, normMac || printerId, pType);
      if (res.ok) {
        const cmdId = res.command_id || res.id;
        if (cmdId && pollCommandStatus) {
          showToast('Đã tạo lệnh lưu Auth, đang đợi Agent thực thi và ghi vào đĩa...', 'info', 3000);
          pollCommandStatus(
            cmdId,
            printerId,
            (resStatus: any) => {
              const extraMsg = resStatus?.error ? ` (${resStatus.error})` : (resStatus?.result ? ` (${resStatus.result})` : '');
              showToast(`Đã test đăng nhập thành công và lưu vào database!${extraMsg}`, 'success', 5000);
              setLanSites((prevSites) =>
                prevSites.map((site) => ({
                  ...site,
                  printers: site.printers.map((item: any) =>
                    String(item.id) === String(printerId) || (macId && item.mac_id === macId)
                      ? { ...item, auth_user: creds.user, auth_password: creds.pass }
                      : item
                  ),
                }))
              );
              setSaveAuthLoading((prev) => ({ ...prev, [printerId]: false }));
            },
            (errorMsg: any) => {
              showToast(`Lỗi Agent lưu Auth: ${errorMsg}`, 'error');
              setSaveAuthLoading((prev) => ({ ...prev, [printerId]: false }));
            },
            'Đang thực thi lưu tài khoản vào tệp printers.json...'
          );
        } else {
          showToast('Đã lưu tài khoản Web UI máy photocopy thành công', 'success');
          setLanSites((prevSites) =>
            prevSites.map((site) => ({
              ...site,
              printers: site.printers.map((item: any) =>
                String(item.id) === String(printerId) || (macId && item.mac_id === macId)
                  ? { ...item, auth_user: creds.user, auth_password: creds.pass }
                  : item
              ),
            }))
          );
          setSaveAuthLoading((prev) => ({ ...prev, [printerId]: false }));
        }
      } else {
        throw new Error(res.error || 'Lỗi lưu thông tin đăng nhập');
      }
    } catch (err: any) {
      showToast('Lưu tài khoản thất bại', 'error');
      setSaveAuthLoading((prev) => ({ ...prev, [printerId]: false }));
    }
  };

  const handleEditIP = (copier: any) => {
    const defaultAgentUid = getTargetAgentUid(copier.mac_id || copier.mac_address || copier.ip || copier.id);
    setEditIpModalData({
      isOpen: true,
      copier,
      oldIp: copier.ip || '',
      newIp: copier.ip || '',
      targetAgentUid: defaultAgentUid,
      status: '',
      error: ''
    });
  };

  const handleSaveEditIP = async () => {
    if (!editIpModalData.copier || !editIpModalData.newIp) return;
    const copier = editIpModalData.copier;
    const oldIp = editIpModalData.oldIp;
    const newIp = editIpModalData.newIp.trim();
    const targetAgentUid = editIpModalData.targetAgentUid;

    if (!newIp) {
      setEditIpModalData((p) => ({ ...p, error: 'Vui lòng nhập địa chỉ IP mới!' }));
      return;
    }

    setEditIpModalData((p) => ({ ...p, status: '⌛ Đang gửi lệnh đổi IP tới Agent...', error: '' }));
    showToast('Đổi IP...', 'info', 2000);

    try {
      const isToshiba = (copier.printer_type || copier.printer_name || '').toLowerCase().includes('toshiba');
      const cmdName = isToshiba ? 'toshiba_change_ftp' : 'ricoh_change_ftp';

      const res = await triggerAgentUtilityExec(targetAgentUid, cmdName, '', {
        old_ip: oldIp,
        new_ip: newIp,
        printer_ip: oldIp,
        target_ip: oldIp
      });

      if (!res.ok || !res.command_id) {
        throw new Error(res.error || 'Không thể tạo lệnh đổi IP');
      }

      setEditIpModalData((p) => ({ ...p, status: '⌛ Agent đang kết nối máy in để thực hiện đổi IP...' }));
      if (pollCommandStatus) {
        pollCommandStatus(
          res.command_id,
          `edit_ip_${copier.id}`,
          (_pollData: any) => {
            showToast('Đổi IP', 'success', 3000);
            setLanSites((prevSites) =>
              prevSites.map((site) => ({
                ...site,
                printers: site.printers.map((item: any) =>
                  String(item.id) === String(copier.id) || item.mac_id === copier.mac_id
                    ? { ...item, ip: newIp }
                    : item
                ),
              }))
            );
            setEditIpModalData((p) => ({ ...p, isOpen: false, status: '', error: '' }));
          },
          (errorMsg: any) => {
            showToast('Đổi IP thất bại', 'error');
            setEditIpModalData((p) => ({ ...p, status: '', error: errorMsg }));
          },
          '⏳ Đang cập nhật IP...'
        );
      }
    } catch (err: any) {
      setEditIpModalData((p) => ({ ...p, status: '', error: err.message || 'Lỗi không xác định' }));
      showToast('Đổi IP thất bại', 'error');
    }
  };

  return {
    lanSites, setLanSites,
    selectedPublicIp, setSelectedPublicIp, filteredLanSites,
    targetInternalIp, setTargetInternalIp,
    selectedLanUid, setSelectedLanUid,
    selectedLan, lanSitesLoading, setLanSitesLoading,
    fetchLanSitesData, triggerLanScan, filteredPrinters,
    copierCredentials, setCopierCredentials,
    saveAuthLoading, setSaveAuthLoading, handleSaveAuth,
    editIpModalData, setEditIpModalData, handleEditIP, handleSaveEditIP,
    expandedPrinters, setExpandedPrinters,
    selectedTargetAgents, setSelectedTargetAgents, getTargetAgentUid, handleCopierClick,
    accessDeniedState, setAccessDeniedState,
    liveAddressBooks, setLiveAddressBooks,
    myClientIp
  };
};
