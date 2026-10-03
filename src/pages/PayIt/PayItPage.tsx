import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTheme } from '../../theme/ThemeContext';

interface CounterData {
  total: number;
  bw: number;
  color: number;
  timestamp: number;
}

interface PayItSession {
  sessionId: string;
  printerRef: string;
  printerName: string;
  startTime: number;
  endTime?: number;
  initialCounter: CounterData;
  currentCounter: CounterData;
  priceBw: number;
  priceColor: number;
}

export interface PrinterItem {
  id: string;
  name: string;
  ip: string;
  macId?: string;
  brand?: string;
  model?: string;
  isOnline?: boolean;
}

export default function PayItPage() {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

  // Dynamic Theme Palette
  const t = {
    bg: isLight ? '#f8fafc' : '#090d16',
    text: isLight ? '#0f172a' : '#f8fafc',
    textMuted: isLight ? '#64748b' : '#94a3b8',
    cardBg: isLight ? '#ffffff' : 'rgba(15, 23, 42, 0.7)',
    cardBorder: isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.08)',
    cardShadow: isLight ? '0 10px 25px -5px rgba(0, 0, 0, 0.08)' : '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
    innerCard: isLight ? '#f1f5f9' : 'rgba(255, 255, 255, 0.03)',
    innerBorder: isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.06)',
    showcaseBg: isLight ? 'linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%)' : 'linear-gradient(180deg, rgba(30, 41, 59, 0.5) 0%, rgba(15, 23, 42, 0.8) 100%)',
    inputBg: isLight ? '#ffffff' : '#0f172a',
    inputBorder: isLight ? '#cbd5e1' : '#334155',
    inputText: isLight ? '#0f172a' : '#ffffff',
    settingsBg: isLight ? '#ffffff' : 'rgba(30, 41, 59, 0.85)',
    headerBorder: isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)',
    buttonSecondaryBg: isLight ? '#f1f5f9' : 'rgba(255, 255, 255, 0.05)',
    buttonSecondaryBorder: isLight ? '#cbd5e1' : 'rgba(255, 255, 255, 0.1)',
    buttonSecondaryText: isLight ? '#334155' : '#cbd5e1',
    footerText: isLight ? '#94a3b8' : '#475569',
  };

  const { printerRef: routePrinterRef } = useParams<{ printerRef?: string }>();
  const [searchParams] = useSearchParams();

  // Target printer parameters
  const initialRef = routePrinterRef || searchParams.get('mac') || searchParams.get('ip') || '';
  const initialIp = searchParams.get('ip') || (initialRef.includes('.') ? initialRef : '');
  
  const [printerRef, setPrinterRef] = useState<string>(initialRef);
  const [printerIp, setPrinterIp] = useState<string>(initialIp);
  const [printerName, setPrinterName] = useState<string>(searchParams.get('name') || '');

  // Printer discovery state
  const [availablePrinters, setAvailablePrinters] = useState<PrinterItem[]>([]);
  const [isLoadingPrinters, setIsLoadingPrinters] = useState<boolean>(true);
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);
  const [customIpInput, setCustomIpInput] = useState<string>('');
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [copyFeedback, setCopyFeedback] = useState<string>('');

  // Pricing configuration (VNĐ)
  const [priceBw, setPriceBw] = useState<number>(500);
  const [priceColor, setPriceColor] = useState<number>(2000);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Bank transfer info for VietQR
  const [bankCode, setBankCode] = useState<string>('MB');
  const [bankAccount, setBankAccount] = useState<string>('0334848398');
  const [bankOwner, setBankOwner] = useState<string>('GOXPRINT SELF-SERVICE');

  // Session state: 'idle' | 'running' | 'completed' | 'timeout'
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'timeout'>('idle');
  const [session, setSession] = useState<PayItSession | null>(null);

  // Maximum session duration from agentapi.quanlymay (default: 30 minutes)
  const [maxMinutes, setMaxMinutes] = useState<number>(30);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(30 * 60);

  // 1. Fetch available printers from LAN sites (VPS API) and Local Agent
  useEffect(() => {
    let isMounted = true;
    async function fetchPrinters() {
      setIsLoadingPrinters(true);
      const list: PrinterItem[] = [];
      const seen = new Set<string>();

      // A. Query VPS /api/lan-sites
      try {
        const apiHost = import.meta.env.VITE_API_URL || 'https://agentapi.quanlymay.com';
        const res = await fetch(`${apiHost}/api/lan-sites?lead=default`, {
          headers: {
            'X-API-Token': 'change-me',
            'X-API-Key': 'change-me',
            'Cache-Control': 'no-cache'
          }
        });
        if (res.ok) {
          const json = await res.json();
          (json.rows || []).forEach((row: any) => {
            (row.printers || []).forEach((p: any) => {
              const ip = String(p.ip || '').trim();
              if (ip && !seen.has(ip)) {
                seen.add(ip);
                list.push({
                  id: String(p.id || ip),
                  name: p.printer_name || p.name || `Máy Photocopy (${ip})`,
                  ip,
                  macId: p.mac_id || '',
                  brand: p.printer_type || '',
                  isOnline: Boolean(p.is_online)
                });
              }
            });
          });
        }
      } catch (e) {
        console.warn('Could not load printers from VPS:', e);
      }

      // B. Query local GoxAgent if available
      try {
        const agentHost = searchParams.get('agent_ip') || (window.location.hostname.match(/^\d+\.\d+\.\d+\.\d+$/) ? window.location.hostname : '127.0.0.1');
        const localRes = await fetch(`http://${agentHost}:9173/api/devices`, { signal: AbortSignal.timeout(1500) });
        if (localRes.ok) {
          const data = await localRes.json();
          (data.devices || []).forEach((d: any) => {
            const ip = String(d.ip || '').trim();
            if (ip && !seen.has(ip)) {
              seen.add(ip);
              list.push({
                id: String(d.id || ip),
                name: d.name || d.model_name || `Máy in (${ip})`,
                ip,
                macId: d.mac || '',
                brand: d.vendor || '',
                isOnline: true
              });
            }
          });
        }
      } catch {
        // Local agent query timeout or unavailable
      }

      if (!isMounted) return;

      setAvailablePrinters(list);
      setIsLoadingPrinters(false);

      // Auto-resolution logic:
      const targetQueryIp = searchParams.get('ip') || (initialRef.includes('.') ? initialRef : '');
      const rawQueryMac = searchParams.get('mac') || searchParams.get('mac_id') || searchParams.get('macId') || (initialRef.includes(':') || initialRef.includes('-') ? initialRef : '');
      const targetQueryMac = rawQueryMac.toLowerCase().replace(/[:-]/g, '');

      if (targetQueryIp) {
        const found = list.find((p) => p.ip === targetQueryIp);
        setPrinterIp(targetQueryIp);
        setPrinterRef(targetQueryIp);
        if (found) {
          setPrinterName(found.name);
        } else {
          setPrinterName(searchParams.get('name') || `Máy in ${targetQueryIp}`);
          setIsCustomMode(true);
          setCustomIpInput(targetQueryIp);
        }
      } else if (targetQueryMac) {
        const found = list.find((p) => (p.macId || '').toLowerCase().replace(/[:-]/g, '') === targetQueryMac);
        if (found) {
          setPrinterIp(found.ip);
          setPrinterRef(found.ip);
          setPrinterName(found.name);
        } else {
          setPrinterRef(rawQueryMac);
        }
      } else {
        // Check localStorage
        const savedIp = localStorage.getItem('payit_selected_printer_ip');
        const savedMatch = list.find((p) => p.ip === savedIp);
        if (savedMatch) {
          setPrinterIp(savedMatch.ip);
          setPrinterRef(savedMatch.ip);
          setPrinterName(savedMatch.name);
        } else if (list.length > 0) {
          // Default to the first discovered printer
          setPrinterIp(list[0].ip);
          setPrinterRef(list[0].ip);
          setPrinterName(list[0].name);
        } else {
          // If no printers discovered at all, set empty and allow custom input
          setPrinterName('Chưa chọn máy in');
          setIsCustomMode(true);
        }
      }
    }

    fetchPrinters();
    return () => { isMounted = false; };
  }, []);

  // Handle changing printer from dropdown
  const handleSelectPrinter = (selectedIp: string) => {
    if (selectedIp === '__custom__') {
      setIsCustomMode(true);
      setCustomIpInput(printerIp);
      return;
    }
    setIsCustomMode(false);
    const found = availablePrinters.find((p) => p.ip === selectedIp);
    if (found) {
      setPrinterIp(found.ip);
      setPrinterRef(found.ip);
      setPrinterName(found.name);
      localStorage.setItem('payit_selected_printer_ip', found.ip);

      // Update URL search param seamlessly without reload (prefer permanent macId)
      const newUrl = new URL(window.location.href);
      if (found.macId) {
        newUrl.searchParams.set('mac', found.macId);
        newUrl.searchParams.delete('ip');
      } else {
        newUrl.searchParams.set('ip', found.ip);
        newUrl.searchParams.delete('mac');
      }
      window.history.replaceState({}, '', newUrl.toString());
    }
  };

  // Handle applying a custom IP
  const handleApplyCustomIp = () => {
    const cleanIp = customIpInput.trim();
    if (!cleanIp) return;
    setPrinterIp(cleanIp);
    setPrinterRef(cleanIp);
    setPrinterName(`Máy in ${cleanIp}`);
    localStorage.setItem('payit_selected_printer_ip', cleanIp);

    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('ip', cleanIp);
    window.history.replaceState({}, '', newUrl.toString());
  };

  // 2. Load configuration from agentapi.quanlymay.com
  useEffect(() => {
    let isMounted = true;
    async function loadConfigFromApi() {
      if (!printerIp && !printerRef) return;
      try {
        const apiHost = import.meta.env.VITE_API_URL || 'https://agentapi.quanlymay.com';
        const query = new URLSearchParams();
        if (printerRef) query.append('printer_ref', printerRef);
        if (printerIp) query.append('ip', printerIp);
        const res = await fetch(`${apiHost}/api/payit/config?${query.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data) {
            const m = Number(data.max_minutes || data.timeout_minutes || data.max_duration_minutes);
            if (m && !isNaN(m) && m > 0) {
              setMaxMinutes(m);
              setSecondsRemaining(m * 60);
            }
            if (data.price_bw) setPriceBw(Number(data.price_bw));
            if (data.price_color) setPriceColor(Number(data.price_color));
            if (data.bank_account) setBankAccount(String(data.bank_account));
            if (data.bank_code) setBankCode(String(data.bank_code));
            if (data.bank_owner) setBankOwner(String(data.bank_owner));
            if (data.printer_name && !printerName) setPrinterName(String(data.printer_name));
          }
        }
      } catch {
        // Fallback to defaults
      }
    }
    loadConfigFromApi();
    return () => { isMounted = false; };
  }, [printerRef, printerIp]);

  // Live polling interval reference
  const intervalRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const [pollCount, setPollCount] = useState<number>(0);
  const [lastPollError, setLastPollError] = useState<string>('');
  const [isTestMode, setIsTestMode] = useState<boolean>(false);

  // Helper to query counter from Agent or VPS
  const fetchCurrentCounter = useCallback(async (ip: string): Promise<CounterData> => {
    if (isTestMode) {
      return new Promise((resolve) => {
        setTimeout(() => {
          setSession((prev) => {
            if (!prev) return prev;
            const diff = Math.floor(Math.random() * 2);
            return {
              ...prev,
              currentCounter: {
                ...prev.currentCounter,
                total: prev.currentCounter.total + diff,
                bw: prev.currentCounter.bw + diff,
                timestamp: Date.now()
              }
            };
          });
          resolve({
            total: (session?.currentCounter.total || 1000) + 1,
            bw: (session?.currentCounter.bw || 800) + 1,
            color: session?.currentCounter.color || 200,
            timestamp: Date.now()
          });
        }, 150);
      });
    }

    if (!ip) {
      return { total: 0, bw: 0, color: 0, timestamp: Date.now() };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);

    // 1. If Tunnel URL is provided (e.g. from PrintAgentX tunnel)
    const tunnelUrl = searchParams.get('tunnel_url');
    if (tunnelUrl) {
      try {
        const cleanTunnel = tunnelUrl.replace(/\/$/, '');
        const res = await fetch(`${cleanTunnel}/api/devices/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip, action: 'counter' }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.payload) {
            const p = data.payload;
            const cd = p.counter_data || {};
            const totalVal = Number(cd.total || p.total || p.counter || 0);
            const bwVal = Number(cd.copier_bw || cd.printer_bw || cd.bw || p.bw || totalVal);
            const colorVal = Number(cd.copier_full_color || cd.printer_full_color || cd.color || p.color || 0);
            return { total: totalVal, bw: bwVal, color: colorVal, timestamp: Date.now() };
          }
        }
      } catch {
        // Fallback to next method
      }
    }

    // 2. Direct LAN Agent attempt (Port 9173 on local machine or LAN IP)
    const agentHost = searchParams.get('agent_ip') || (window.location.hostname.match(/^\d+\.\d+\.\d+\.\d+$/) ? window.location.hostname : '127.0.0.1');
    try {
      const localAgentUrl = `http://${agentHost}:9173/api/devices/action`;
      const res = await fetch(localAgentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, action: 'counter' }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.payload) {
          const p = data.payload;
          const cd = p.counter_data || {};
          const totalVal = Number(cd.total || p.total || p.counter || 0);
          const bwVal = Number(cd.copier_bw || cd.printer_bw || cd.bw || p.bw || totalVal);
          const colorVal = Number(cd.copier_full_color || cd.printer_full_color || cd.color || p.color || 0);
          return { total: totalVal, bw: bwVal, color: colorVal, timestamp: Date.now() };
        }
      }
    } catch {
      // Local LAN failed or blocked by mixed-content, fallback to VPS
    }

    // 3. Fallback to Cloud VPS API (agentapi.quanlymay.com)
    try {
      const apiHost = import.meta.env.VITE_API_URL || 'https://agentapi.quanlymay.com';
      const vpsRes = await fetch(`${apiHost}/api/devices/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Token': 'change-me',
          'X-API-Key': 'change-me'
        },
        body: JSON.stringify({ ip, action: 'counter' })
      });
      if (vpsRes.ok) {
        const vpsData = await vpsRes.json();
        if (vpsData.ok && vpsData.payload) {
          const p = vpsData.payload;
          const cd = p.counter_data || {};
          const totalVal = Number(cd.total || p.total || p.counter || 0);
          const bwVal = Number(cd.copier_bw || cd.printer_bw || cd.bw || p.bw || totalVal);
          const colorVal = Number(cd.copier_full_color || cd.printer_full_color || cd.color || p.color || 0);
          return { total: totalVal, bw: bwVal, color: colorVal, timestamp: Date.now() };
        }
      }
    } catch (e: any) {
      setLastPollError(e?.message || 'Không thể kết nối đến máy in');
    }

    return {
      total: session?.currentCounter.total || 0,
      bw: session?.currentCounter.bw || 0,
      color: session?.currentCounter.color || 0,
      timestamp: Date.now()
    };
  }, [isTestMode, session]);

  const stopAllLoops = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopAllLoops();
    };
  }, [stopAllLoops]);

  // Handle Session Start
  const handleStartSession = async () => {
    if (!printerIp) {
      alert('Vui lòng chọn hoặc nhập IP của máy in trước khi bắt đầu!');
      return;
    }

    setLastPollError('');
    setPollCount(0);
    setSecondsRemaining(maxMinutes * 60);

    // Initial counter snapshot
    const initialCounter = await fetchCurrentCounter(printerIp);

    const newSession: PayItSession = {
      sessionId: `PAY-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 899 + 100)}`,
      printerRef: printerIp,
      printerName: printerName || `Máy in ${printerIp}`,
      startTime: Date.now(),
      initialCounter,
      currentCounter: { ...initialCounter },
      priceBw,
      priceColor
    };

    setSession(newSession);
    setStatus('running');

    // 1. Repeat 1s polling loop
    intervalRef.current = setInterval(async () => {
      try {
        const counter = await fetchCurrentCounter(printerIp);
        setSession((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            currentCounter: counter
          };
        });
        setPollCount((c) => c + 1);
        setLastPollError('');
      } catch (err: any) {
        setLastPollError(err?.message || 'Lỗi đọc số đếm');
      }
    }, 1000);

    // 2. Countdown timer loop
    timerRef.current = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          stopAllLoops();
          setStatus('timeout');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Handle Early Session Finish
  const handleFinishEarly = () => {
    stopAllLoops();
    if (session) {
      setSession({
        ...session,
        endTime: Date.now()
      });
    }
    setStatus('completed');
  };

  // Handle Reset / Start New Session
  const handleReset = () => {
    stopAllLoops();
    setSession(null);
    setStatus('idle');
    setPollCount(0);
    setSecondsRemaining(maxMinutes * 60);
    setLastPollError('');
  };

  // Calculation of printed pages
  const printedTotal = session
    ? Math.max(0, session.currentCounter.total - session.initialCounter.total)
    : 0;
  const printedBw = session
    ? Math.max(0, session.currentCounter.bw - session.initialCounter.bw)
    : 0;
  const printedColor = session
    ? Math.max(0, session.currentCounter.color - session.initialCounter.color)
    : 0;

  const totalCost = (printedBw * priceBw) + (printedColor * priceColor);

  // Time remaining format (MM:SS)
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // VietQR URL generation
  const qrDescription = encodeURIComponent(session?.sessionId || 'GOXPRINT-PAYIT');
  const vietQrUrl = `https://img.vietqr.io/image/${bankCode}-${bankAccount}-compact2.png?amount=${totalCost}&addInfo=${qrDescription}&accountName=${encodeURIComponent(bankOwner)}`;

  // Link for this printer to generate QR sticker (Prioritize permanent MAC address over dynamic IP)
  const currentPrinterObj = availablePrinters.find((p) => (printerRef && p.macId === printerRef) || p.ip === printerIp);
  const activeMac = currentPrinterObj?.macId || (printerRef.includes(':') || printerRef.includes('-') ? printerRef : '');
  const printerDirectUrl = activeMac
    ? `https://agentapi.quanlymay.com/pay?mac=${encodeURIComponent(activeMac)}`
    : `https://agentapi.quanlymay.com/pay?ip=${encodeURIComponent(printerIp)}`;
  const printerStickerQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(printerDirectUrl)}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(printerDirectUrl);
    setCopyFeedback('Đã sao chép link!');
    setTimeout(() => setCopyFeedback(''), 2500);
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: t.bg,
      color: t.text,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '16px',
      boxSizing: 'border-box',
      transition: 'background-color 0.3s, color 0.3s'
    }}>
      {/* Header bar */}
      <header style={{
        width: '100%',
        maxWidth: '540px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 0',
        borderBottom: `1px solid ${t.headerBorder}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.6rem' }}>⚡</span>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.5px' }}>
              Pay<span style={{ color: '#10b981' }}>It</span>
            </h1>
            <div style={{ fontSize: '0.72rem', color: t.textMuted }}>
              Tự phục vụ photocopy & in ấn
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            style={{
              background: t.buttonSecondaryBg,
              border: `1px solid ${t.buttonSecondaryBorder}`,
              color: t.buttonSecondaryText,
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontWeight: 600,
              boxShadow: isLight ? '0 1px 3px rgba(0,0,0,0.05)' : 'none'
            }}
            title={isLight ? 'Chuyển sang Giao diện Tối (Dark)' : 'Chuyển sang Giao diện Sáng (Light)'}
          >
            {isLight ? '🌙 Tối' : '☀️ Sáng'}
          </button>

          {/* Settings Button */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{
              background: t.buttonSecondaryBg,
              border: `1px solid ${t.buttonSecondaryBorder}`,
              color: t.buttonSecondaryText,
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '0.78rem',
              cursor: 'pointer',
              fontWeight: 600,
              boxShadow: isLight ? '0 1px 3px rgba(0,0,0,0.05)' : 'none'
            }}
          >
            ⚙️ Cài đặt
          </button>
        </div>
      </header>

      {/* Settings Panel Modal / Drawer */}
      {showSettings && (
        <div style={{
          width: '100%',
          maxWidth: '540px',
          background: t.settingsBg,
          border: `1px solid ${t.cardBorder}`,
          borderRadius: '14px',
          padding: '16px',
          marginTop: '12px',
          boxSizing: 'border-box',
          boxShadow: t.cardShadow
        }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: isLight ? '#0284c7' : '#38bdf8' }}>
            ⚙️ Cấu hình thông số thanh toán & giá
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '0.72rem', color: t.textMuted, display: 'block' }}>Giá Đen Trắng (đ/trang):</label>
              <input
                type="number"
                value={priceBw}
                onChange={(e) => setPriceBw(Number(e.target.value))}
                style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.inputText, fontSize: '0.8rem' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', color: t.textMuted, display: 'block' }}>Giá In Màu (đ/trang):</label>
              <input
                type="number"
                value={priceColor}
                onChange={(e) => setPriceColor(Number(e.target.value))}
                style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.inputText, fontSize: '0.8rem' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', color: t.textMuted, display: 'block' }}>STK VietQR:</label>
              <input
                type="text"
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
                style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.inputText, fontSize: '0.8rem' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', color: t.textMuted, display: 'block' }}>Ngân hàng VietQR:</label>
              <input
                type="text"
                value={bankCode}
                onChange={(e) => setBankCode(e.target.value)}
                style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.inputText, fontSize: '0.8rem' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', color: t.textMuted, display: 'block' }}>Chủ tài khoản:</label>
              <input
                type="text"
                value={bankOwner}
                onChange={(e) => setBankOwner(e.target.value)}
                style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.inputText, fontSize: '0.8rem' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', color: t.textMuted, display: 'block' }}>Thời lượng tối đa (phút):</label>
              <input
                type="number"
                value={maxMinutes}
                onChange={(e) => {
                  const m = Number(e.target.value);
                  setMaxMinutes(m);
                  if (status === 'idle') setSecondsRemaining(m * 60);
                }}
                style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.inputText, fontSize: '0.8rem' }}
              />
            </div>
          </div>
          <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              id="testModeCheck"
              checked={isTestMode}
              onChange={(e) => setIsTestMode(e.target.checked)}
            />
            <label htmlFor="testModeCheck" style={{ fontSize: '0.75rem', color: isLight ? '#d97706' : '#f59e0b', fontWeight: 600, cursor: 'pointer' }}>
              Bật chế độ Giả lập (Test Simulator) - Tự động nhảy số để test
            </label>
          </div>
        </div>
      )}

      {/* QR Code Sticker Modal */}
      {showQrModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            background: t.cardBg,
            border: `1px solid ${t.cardBorder}`,
            borderRadius: '18px',
            padding: '24px',
            maxWidth: '380px',
            width: '100%',
            textAlign: 'center',
            boxShadow: '0 20px 30px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '1.15rem', color: t.text }}>
              📱 Mã QR dán lên máy in
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: t.textMuted }}>
              Dán mã này lên <b>{printerName}</b> ({printerIp}) để khách quét là vào thẳng phiên in của máy này.
            </p>

            <div style={{
              background: '#ffffff',
              padding: '12px',
              borderRadius: '12px',
              display: 'inline-block',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
            }}>
              <img
                src={printerStickerQrUrl}
                alt="Printer QR"
                style={{ width: '200px', height: '200px', display: 'block' }}
              />
            </div>

            <div style={{
              marginTop: '14px',
              padding: '8px',
              borderRadius: '8px',
              background: t.innerCard,
              border: `1px solid ${t.innerBorder}`,
              fontSize: '0.75rem',
              color: isLight ? '#0284c7' : '#38bdf8',
              wordBreak: 'break-all'
            }}>
              {printerDirectUrl}
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button
                onClick={handleCopyLink}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '10px',
                  border: 'none',
                  background: '#10b981',
                  color: '#fff',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {copyFeedback || '📋 Sao chép Link'}
              </button>
              <button
                onClick={() => setShowQrModal(false)}
                style={{
                  padding: '10px 16px',
                  borderRadius: '10px',
                  border: `1px solid ${t.buttonSecondaryBorder}`,
                  background: t.buttonSecondaryBg,
                  color: t.buttonSecondaryText,
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main style={{ width: '100%', maxWidth: '540px', marginTop: '16px' }}>

        {/* ── STATE 1: IDLE ── */}
        {status === 'idle' && (
          <div style={{
            background: t.cardBg,
            border: `1px solid ${t.cardBorder}`,
            borderRadius: '16px',
            padding: '24px 20px',
            textAlign: 'center',
            boxShadow: t.cardShadow
          }}>
            {/* PRINTER SELECTOR CARD */}
            <div style={{
              background: t.innerCard,
              border: `1px solid ${t.innerBorder}`,
              borderRadius: '14px',
              padding: '14px 16px',
              marginBottom: '20px',
              textAlign: 'left'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: t.textMuted, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🖨️</span> Chọn máy in / photocopy:
                </label>
                {printerIp && (
                  <button
                    onClick={() => setShowQrModal(true)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: isLight ? '#0284c7' : '#38bdf8',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: 0
                    }}
                    title="Xem link & mã QR để in dán lên máy in này"
                  >
                    📱 QR dán máy
                  </button>
                )}
              </div>

              {isLoadingPrinters ? (
                <div style={{ fontSize: '0.82rem', color: t.textMuted, fontStyle: 'italic', padding: '6px 0' }}>
                  ⏳ Đang tìm kiếm các máy in trên hệ thống...
                </div>
              ) : (
                <select
                  value={isCustomMode ? '__custom__' : printerIp}
                  onChange={(e) => handleSelectPrinter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: t.inputBg,
                    border: `1.5px solid ${isLight ? '#cbd5e1' : '#334155'}`,
                    color: t.inputText,
                    fontSize: '0.92rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  {availablePrinters.map((p) => (
                    <option key={p.ip} value={p.ip}>
                      {p.name} — {p.ip} {p.isOnline ? '🟢' : ''}
                    </option>
                  ))}
                  <option value="__custom__">✏️ Nhập địa chỉ IP máy in khác...</option>
                </select>
              )}

              {/* Custom IP input box */}
              {isCustomMode && (
                <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Nhập IP máy in (vd: 192.168.1.226)"
                    value={customIpInput}
                    onChange={(e) => setCustomIpInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleApplyCustomIp()}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: t.inputBg,
                      border: `1px solid ${t.inputBorder}`,
                      color: t.inputText,
                      fontSize: '0.85rem'
                    }}
                  />
                  <button
                    onClick={handleApplyCustomIp}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#10b981',
                      color: '#fff',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Áp dụng
                  </button>
                </div>
              )}
            </div>

            <div style={{
              display: 'inline-block',
              padding: '6px 16px',
              borderRadius: '999px',
              background: isLight ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: isLight ? '#059669' : '#34d399',
              fontSize: '0.8rem',
              fontWeight: 700,
              marginBottom: '16px'
            }}>
              🟢 Sẵn sàng mở phiên in
            </div>

            <h2 style={{ margin: '0 0 6px 0', fontSize: '1.4rem', fontWeight: 800, color: t.text }}>
              {printerName || 'Máy Photocopy'}
            </h2>
            <p style={{ margin: '0 0 20px 0', fontSize: '0.85rem', color: t.textMuted }}>
              IP máy: <code style={{ color: isLight ? '#0284c7' : '#38bdf8', fontWeight: 700, fontSize: '0.95rem' }}>{printerIp || 'Chưa thiết lập'}</code>
            </p>

            {/* Price tags */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '24px'
            }}>
              <div style={{
                background: t.innerCard,
                border: `1px solid ${t.innerBorder}`,
                borderRadius: '12px',
                padding: '12px'
              }}>
                <div style={{ fontSize: '0.75rem', color: t.textMuted, fontWeight: 500 }}>Trắng đen (B&W)</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: t.text, marginTop: '4px' }}>
                  {priceBw.toLocaleString()} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>đ/trang</span>
                </div>
              </div>

              <div style={{
                background: t.innerCard,
                border: `1px solid ${t.innerBorder}`,
                borderRadius: '12px',
                padding: '12px'
              }}>
                <div style={{ fontSize: '0.75rem', color: t.textMuted, fontWeight: 500 }}>In Màu (Color)</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: isLight ? '#0284c7' : '#38bdf8', marginTop: '4px' }}>
                  {priceColor.toLocaleString()} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>đ/trang</span>
                </div>
              </div>
            </div>

            {/* Start Button */}
            <button
              onClick={handleStartSession}
              disabled={!printerIp}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '14px',
                border: 'none',
                background: printerIp ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#94a3b8',
                color: '#fff',
                fontSize: '1.15rem',
                fontWeight: 800,
                letterSpacing: '0.5px',
                cursor: printerIp ? 'pointer' : 'not-allowed',
                boxShadow: printerIp ? '0 8px 20px rgba(16, 185, 129, 0.35)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              🚀 BẮT ĐẦU PHIÊN IN
            </button>

            <p style={{ marginTop: '12px', fontSize: '0.78rem', color: t.textMuted, lineHeight: 1.5 }}>
              ⏱️ Phiên in tự động kết thúc sau tối đa <b>{maxMinutes} phút</b> (có thể hoàn tất sớm bất kỳ lúc nào).<br />
              Hệ thống cập nhật số trang mỗi 1 giây.
            </p>
          </div>
        )}

        {/* ── STATE 2: RUNNING (1s repeat, max 30m) ── */}
        {status === 'running' && session && (
          <div style={{
            background: t.cardBg,
            border: isLight ? '1px solid #10b981' : '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '20px',
            padding: '24px 20px',
            boxShadow: t.cardShadow
          }}>
            {/* Live Status Bar */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingBottom: '16px',
              borderBottom: `1px solid ${t.innerBorder}`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: '#10b981',
                  boxShadow: '0 0 10px #10b981',
                  display: 'inline-block'
                }}></span>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: isLight ? '#059669' : '#34d399' }}>
                  ĐANG THEO DÕI (1s/lần)
                </span>
                <span style={{ fontSize: '0.72rem', color: t.textMuted }}>#{pollCount}</span>
              </div>

              {/* Countdown badge */}
              <div style={{
                background: secondsRemaining < 300 ? 'rgba(239, 68, 68, 0.15)' : t.innerCard,
                border: secondsRemaining < 300 ? '1px solid #ef4444' : `1px solid ${t.innerBorder}`,
                color: secondsRemaining < 300 ? '#ef4444' : t.text,
                padding: '4px 10px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                ⏱️ {formatTime(secondsRemaining)}
              </div>
            </div>

            <div style={{ marginTop: '12px', fontSize: '0.82rem', color: t.textMuted, display: 'flex', justifyContent: 'space-between' }}>
              <span>Máy in: <b>{session.printerName}</b></span>
              <span>IP: <code style={{ color: isLight ? '#0284c7' : '#38bdf8' }}>{session.printerRef}</code></span>
            </div>

            {lastPollError && (
              <div style={{
                marginTop: '10px',
                padding: '8px 12px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                fontSize: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                ⚠️ {lastPollError}
              </div>
            )}

            {/* Showcase Page Counter */}
            <div style={{
              margin: '20px 0',
              padding: '24px 16px',
              borderRadius: '16px',
              background: t.showcaseBg,
              border: `1px solid ${t.innerBorder}`,
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.85rem', color: t.textMuted, fontWeight: 600, letterSpacing: '0.5px' }}>
                TỔNG SỐ TRANG ĐÃ IN TRONG PHIÊN
              </div>
              <div style={{
                fontSize: '3.8rem',
                fontWeight: 900,
                color: isLight ? '#0284c7' : '#38bdf8',
                lineHeight: 1.1,
                margin: '8px 0',
                letterSpacing: '-1px'
              }}>
                {printedTotal}
              </div>
              <div style={{ fontSize: '0.8rem', color: t.textMuted }}>
                Số đếm ban đầu: <b>{session.initialCounter.total}</b> ➔ Hiện tại: <b>{session.currentCounter.total}</b>
              </div>
            </div>

            {/* Detailed counter breakdown */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px',
              marginBottom: '20px'
            }}>
              <div style={{
                background: t.innerCard,
                border: `1px solid ${t.innerBorder}`,
                borderRadius: '12px',
                padding: '12px'
              }}>
                <div style={{ fontSize: '0.75rem', color: t.textMuted }}>Đen trắng (B&W)</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '2px' }}>
                  {printedBw} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>trang</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: t.textMuted, marginTop: '2px' }}>
                  {(printedBw * priceBw).toLocaleString()} đ
                </div>
              </div>

              <div style={{
                background: t.innerCard,
                border: `1px solid ${t.innerBorder}`,
                borderRadius: '12px',
                padding: '12px'
              }}>
                <div style={{ fontSize: '0.75rem', color: t.textMuted }}>Màu (Color)</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: isLight ? '#0284c7' : '#38bdf8', marginTop: '2px' }}>
                  {printedColor} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>trang</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: t.textMuted, marginTop: '2px' }}>
                  {(printedColor * priceColor).toLocaleString()} đ
                </div>
              </div>
            </div>

            {/* Temporary Amount Preview */}
            <div style={{
              background: isLight ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.05)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: '12px',
              padding: '12px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Tạm tính hiện tại:</span>
              <span style={{ fontSize: '1.2rem', fontWeight: 800, color: isLight ? '#059669' : '#10b981' }}>
                {totalCost.toLocaleString()} VNĐ
              </span>
            </div>

            {/* Early Termination Button */}
            <button
              onClick={handleFinishEarly}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '14px',
                border: 'none',
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                color: '#fff',
                fontSize: '1.05rem',
                fontWeight: 800,
                letterSpacing: '0.5px',
                cursor: 'pointer',
                boxShadow: '0 8px 20px rgba(239, 68, 68, 0.35)',
                transition: 'all 0.2s'
              }}
            >
              🛑 HOÀN TẤT IN & THANH TOÁN (KẾT THÚC SỚM)
            </button>

            <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '0.75rem', color: t.textMuted }}>
              Bấm nút trên khi bạn đã in xong để chốt số trang & thanh toán
            </div>
          </div>
        )}

        {/* ── STATE 3: COMPLETED OR TIMEOUT ── */}
        {(status === 'completed' || status === 'timeout') && session && (
          <div style={{
            background: t.cardBg,
            border: `1px solid ${t.cardBorder}`,
            borderRadius: '20px',
            padding: '24px 20px',
            boxShadow: t.cardShadow
          }}>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <div style={{
                display: 'inline-block',
                padding: '6px 14px',
                borderRadius: '999px',
                background: status === 'timeout' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                border: status === 'timeout' ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)',
                color: status === 'timeout' ? (isLight ? '#d97706' : '#fbbf24') : (isLight ? '#059669' : '#34d399'),
                fontSize: '0.8rem',
                fontWeight: 700
              }}>
                {status === 'timeout' ? `⏱️ Hết thời gian phiên (${maxMinutes} phút)` : '✅ Đã hoàn tất phiên in'}
              </div>

              <h2 style={{ margin: '10px 0 2px 0', fontSize: '1.3rem', fontWeight: 800, color: t.text }}>
                Hóa đơn thanh toán
              </h2>
              <div style={{ fontSize: '0.75rem', color: t.textMuted }}>
                Máy: <b>{session.printerName}</b> ({session.printerRef}) • Mã: <code style={{ color: isLight ? '#0284c7' : '#38bdf8', fontWeight: 700 }}>{session.sessionId}</code>
              </div>
            </div>

            {/* Bill Details */}
            <div style={{
              background: t.innerCard,
              border: `1px solid ${t.innerBorder}`,
              borderRadius: '14px',
              padding: '16px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${t.innerBorder}`, fontSize: '0.85rem' }}>
                <span style={{ color: t.textMuted }}>Trang đen trắng:</span>
                <span><b>{printedBw}</b> trang × {priceBw}đ = <b>{(printedBw * priceBw).toLocaleString()}đ</b></span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${t.innerBorder}`, fontSize: '0.85rem' }}>
                <span style={{ color: t.textMuted }}>Trang in màu:</span>
                <span><b>{printedColor}</b> trang × {priceColor}đ = <b>{(printedColor * priceColor).toLocaleString()}đ</b></span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 4px 0', fontSize: '1.1rem', fontWeight: 800 }}>
                <span style={{ color: isLight ? '#0284c7' : '#38bdf8' }}>TỔNG THANH TOÁN:</span>
                <span style={{ color: isLight ? '#059669' : '#10b981', fontSize: '1.25rem' }}>{totalCost.toLocaleString()} VNĐ</span>
              </div>
            </div>

            {/* VietQR Payment Section */}
            {totalCost > 0 ? (
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '16px',
                padding: '16px',
                textAlign: 'center',
                color: '#0f172a',
                marginBottom: '20px',
                boxShadow: '0 4px 14px rgba(0,0,0,0.06)'
              }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>
                  Quét mã QR để chuyển khoản thanh toán
                </div>
                <img
                  src={vietQrUrl}
                  alt="VietQR Payment"
                  style={{
                    width: '100%',
                    maxWidth: '240px',
                    height: 'auto',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                  }}
                />
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '8px' }}>
                  Tự động điền số tiền: <b>{totalCost.toLocaleString()} đ</b>
                  <br />
                  Nội dung: <b>{session.sessionId}</b>
                </div>
              </div>
            ) : (
              <div style={{
                padding: '16px',
                borderRadius: '12px',
                background: isLight ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: isLight ? '#059669' : '#34d399',
                textAlign: 'center',
                marginBottom: '20px',
                fontSize: '0.9rem',
                fontWeight: 600
              }}>
                🎉 Bạn chưa in trang nào trong phiên này (0đ). Không cần thanh toán!
              </div>
            )}

            {/* Action buttons */}
            <button
              onClick={handleReset}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                border: 'none',
                background: '#3b82f6',
                color: '#fff',
                fontSize: '1rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              🔄 Bắt đầu phiên in mới
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ marginTop: 'auto', padding: '24px 0 8px 0', fontSize: '0.72rem', color: t.footerText, textAlign: 'center' }}>
        PayIt • Nền tảng tự phục vụ in ấn quanlymay.com • Realtime 1s Loop
      </footer>
    </div>
  );
}
