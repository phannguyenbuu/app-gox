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
  const initialPrinterRef = routePrinterRef || searchParams.get('mac') || searchParams.get('ip') || '';
  const [printerRef] = useState<string>(initialPrinterRef);
  const [printerIp, setPrinterIp] = useState<string>(searchParams.get('ip') || (initialPrinterRef.includes('.') ? initialPrinterRef : '192.168.1.100'));
  const [printerName, setPrinterName] = useState<string>(searchParams.get('name') || 'Máy Photocopy');

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

  // Load configuration from agentapi.quanlymay.com
  useEffect(() => {
    let isMounted = true;
    async function loadConfigFromApi() {
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
            if (data.printer_name) setPrinterName(String(data.printer_name));
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);

    // 1. If Tunnel URL is provided (e.g. from PrintAgentX tunnel)
    const tunnelUrl = searchParams.get('tunnel_url');
    if (tunnelUrl) {
      try {
        const cleanTunnel = tunnelUrl.replace(/\/$/, '');
        const res = await fetch(`${cleanTunnel}/api/action`, {
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
            return {
              total: Number(p.total || p.total_counter || p.counter || 0),
              bw: Number(p.bw || p.black_white || p.bw_counter || p.total || 0),
              color: Number(p.color || p.color_counter || 0),
              timestamp: Date.now()
            };
          }
        }
      } catch {
        // Fallback to next method
      }
    }

    // 2. Direct LAN Agent attempt (Port 9173 on local machine or LAN IP)
    const agentHost = searchParams.get('agent_ip') || (window.location.hostname.match(/^\d+\.\d+\.\d+\.\d+$/) ? window.location.hostname : '127.0.0.1');
    try {
      const localAgentUrl = `http://${agentHost}:9173/api/action`;
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
          return {
            total: Number(p.total || p.total_counter || p.counter || 0),
            bw: Number(p.bw || p.black_white || p.bw_counter || p.total || 0),
            color: Number(p.color || p.color_counter || 0),
            timestamp: Date.now()
          };
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, action: 'counter' })
      });
      if (vpsRes.ok) {
        const vpsData = await vpsRes.json();
        if (vpsData.ok && vpsData.payload) {
          const p = vpsData.payload;
          return {
            total: Number(p.total || p.counter || 0),
            bw: Number(p.bw || p.total || 0),
            color: Number(p.color || 0),
            timestamp: Date.now()
          };
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

  const handleStartSession = async () => {
    stopAllLoops();
    setLastPollError('');
    setSecondsRemaining(maxMinutes * 60);
    setPollCount(0);

    let initCounter: CounterData = { total: 0, bw: 0, color: 0, timestamp: Date.now() };
    try {
      initCounter = await fetchCurrentCounter(printerIp);
    } catch {
      initCounter = { total: 12500, bw: 10000, color: 2500, timestamp: Date.now() };
    }

    const newSession: PayItSession = {
      sessionId: `PAY-${Date.now().toString().slice(-6)}`,
      printerRef: printerRef || printerIp,
      printerName: printerName || 'Máy in tự phục vụ',
      startTime: Date.now(),
      initialCounter: initCounter,
      currentCounter: { ...initCounter },
      priceBw,
      priceColor
    };

    setSession(newSession);
    setStatus('running');

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

    intervalRef.current = setInterval(async () => {
      try {
        setPollCount((c) => c + 1);
        const latest = await fetchCurrentCounter(printerIp);
        setSession((prev) => {
          if (!prev) return null;
          const newBw = Math.max(prev.initialCounter.bw, latest.bw || prev.currentCounter.bw);
          const newColor = Math.max(prev.initialCounter.color, latest.color || prev.currentCounter.color);
          const newTotal = Math.max(prev.initialCounter.total, latest.total || (newBw + newColor));
          return {
            ...prev,
            currentCounter: {
              total: newTotal,
              bw: newBw,
              color: newColor,
              timestamp: Date.now()
            }
          };
        });
      } catch (err: any) {
        setLastPollError(err?.message || 'Lỗi nhịp đọc 1s');
      }
    }, 1000);
  };

  const handleFinishEarly = () => {
    stopAllLoops();
    setStatus('completed');
    if (session) {
      setSession({
        ...session,
        endTime: Date.now()
      });
    }
  };

  const handleReset = () => {
    stopAllLoops();
    setStatus('idle');
    setSession(null);
    setSecondsRemaining(maxMinutes * 60);
  };

  const printedBw = session ? Math.max(0, session.currentCounter.bw - session.initialCounter.bw) : 0;
  const printedColor = session ? Math.max(0, session.currentCounter.color - session.initialCounter.color) : 0;
  const printedTotal = session ? Math.max(0, session.currentCounter.total - session.initialCounter.total) : (printedBw + printedColor);
  const totalCost = (printedBw * priceBw) + (printedColor * priceColor);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const vietQrUrl = `https://img.vietqr.io/image/${bankCode}-${bankAccount}-compact2.png?amount=${totalCost}&addInfo=${encodeURIComponent(session?.sessionId || 'PAYIT')}&accountName=${encodeURIComponent(bankOwner)}`;

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: t.bg,
      color: t.text,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '16px',
      boxSizing: 'border-box',
      transition: 'background-color 0.3s, color 0.3s'
    }}>
      {/* Top Header */}
      <header style={{
        width: '100%',
        maxWidth: '540px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 0 20px 0',
        borderBottom: `1px solid ${t.headerBorder}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.25rem',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
          }}>
            🖨️
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, letterSpacing: '-0.5px', color: t.text }}>
              Pay<span style={{ color: '#10b981' }}>It</span>
            </h1>
            <p style={{ margin: 0, fontSize: '0.72rem', color: t.textMuted }}>
              agentapi.quanlymay.com/pay • In ấn tự phục vụ
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
            ⚙️ Cấu hình thông số
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '0.72rem', color: t.textMuted, display: 'block' }}>IP Máy in:</label>
              <input
                type="text"
                value={printerIp}
                onChange={(e) => setPrinterIp(e.target.value)}
                disabled={status === 'running'}
                style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.inputText, fontSize: '0.8rem' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', color: t.textMuted, display: 'block' }}>Tên hiển thị:</label>
              <input
                type="text"
                value={printerName}
                onChange={(e) => setPrinterName(e.target.value)}
                style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.inputText, fontSize: '0.8rem' }}
              />
            </div>
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
                  const val = Math.max(1, Number(e.target.value) || 1);
                  setMaxMinutes(val);
                  if (status === 'idle') setSecondsRemaining(val * 60);
                }}
                disabled={status === 'running'}
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

            <h2 style={{ margin: '0 0 8px 0', fontSize: '1.4rem', fontWeight: 800, color: t.text }}>
              {printerName}
            </h2>
            <p style={{ margin: '0 0 20px 0', fontSize: '0.85rem', color: t.textMuted }}>
              Địa chỉ kết nối: <code style={{ color: isLight ? '#0284c7' : '#38bdf8', fontWeight: 600 }}>{printerIp}</code>
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
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '14px',
                border: 'none',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#fff',
                fontSize: '1.15rem',
                fontWeight: 800,
                letterSpacing: '0.5px',
                cursor: 'pointer',
                boxShadow: '0 8px 20px rgba(16, 185, 129, 0.35)',
                transition: 'all 0.2s'
              }}
            >
              🚀 BẮT ĐẦU PHIÊN IN
            </button>

            <p style={{ marginTop: '12px', fontSize: '0.78rem', color: t.textMuted, lineHeight: 1.5 }}>
              ⏱️ Thời lượng tối đa <b>{maxMinutes} phút</b> (tự động kết thúc nếu quá giờ).<br />
              Hệ thống cập nhật số trang mỗi 1 giây. Bạn có thể bấm kết thúc sớm bất kỳ lúc nào.
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
            {/* Live Indicator Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  display: 'inline-block',
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: '#10b981',
                  boxShadow: '0 0 10px #10b981'
                }} />
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: isLight ? '#059669' : '#34d399' }}>
                  Đang đếm realtime (1s) • Nhịp #{pollCount}
                </span>
              </div>

              {/* Timer Badge */}
              <div style={{
                background: secondsRemaining < 300 ? 'rgba(239, 68, 68, 0.15)' : (isLight ? 'rgba(2, 132, 199, 0.1)' : 'rgba(59, 130, 246, 0.15)'),
                border: secondsRemaining < 300 ? '1px solid rgba(239, 68, 68, 0.3)' : (isLight ? '1px solid rgba(2, 132, 199, 0.3)' : '1px solid rgba(59, 130, 246, 0.3)'),
                color: secondsRemaining < 300 ? '#ef4444' : (isLight ? '#0284c7' : '#60a5fa'),
                padding: '4px 12px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums'
              }}>
                ⏳ Còn lại: {formatTime(secondsRemaining)}
              </div>
            </div>

            {/* Time progress bar */}
            <div style={{
              width: '100%',
              height: '6px',
              background: isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.1)',
              borderRadius: '999px',
              overflow: 'hidden',
              marginBottom: '20px'
            }}>
              <div style={{
                width: `${(secondsRemaining / (maxMinutes * 60)) * 100}%`,
                height: '100%',
                background: secondsRemaining < 300 ? '#ef4444' : '#10b981',
                transition: 'width 1s linear'
              }} />
            </div>

            {/* Main Live Counter Showcase */}
            <div style={{
              background: t.showcaseBg,
              border: `1px solid ${t.innerBorder}`,
              borderRadius: '16px',
              padding: '20px',
              textAlign: 'center',
              marginBottom: '20px',
              boxShadow: isLight ? 'inset 0 2px 4px rgba(0,0,0,0.02)' : 'none'
            }}>
              <div style={{ fontSize: '0.8rem', color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                Tổng số trang đã in trong phiên
              </div>
              <div style={{
                fontSize: '3.6rem',
                fontWeight: 900,
                color: t.text,
                margin: '4px 0',
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
                textShadow: isLight ? 'none' : '0 4px 20px rgba(16, 185, 129, 0.3)'
              }}>
                {printedTotal}
              </div>
              <div style={{ fontSize: '1.05rem', color: isLight ? '#059669' : '#10b981', fontWeight: 800 }}>
                Tạm tính: {totalCost.toLocaleString()} đ
              </div>
            </div>

            {/* B&W vs Color breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
              <div style={{
                background: t.innerCard,
                border: `1px solid ${t.innerBorder}`,
                borderRadius: '12px',
                padding: '12px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '0.75rem', color: t.textMuted, fontWeight: 500 }}>Trắng đen (B&W)</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: t.text, marginTop: '2px' }}>
                  {printedBw}
                </div>
                <div style={{ fontSize: '0.72rem', color: t.textMuted }}>
                  {(printedBw * priceBw).toLocaleString()} đ
                </div>
              </div>

              <div style={{
                background: t.innerCard,
                border: `1px solid ${t.innerBorder}`,
                borderRadius: '12px',
                padding: '12px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '0.75rem', color: t.textMuted, fontWeight: 500 }}>In Màu (Color)</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: isLight ? '#0284c7' : '#38bdf8', marginTop: '2px' }}>
                  {printedColor}
                </div>
                <div style={{ fontSize: '0.72rem', color: t.textMuted }}>
                  {(printedColor * priceColor).toLocaleString()} đ
                </div>
              </div>
            </div>

            {/* Finish Early Button */}
            <button
              onClick={handleFinishEarly}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '14px',
                border: 'none',
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                color: '#fff',
                fontSize: '1.1rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 8px 20px rgba(239, 68, 68, 0.35)',
                transition: 'all 0.2s'
              }}
            >
              🛑 HOÀN TẤT IN & THANH TOÁN (KẾT THÚC SỚM)
            </button>

            {lastPollError && (
              <div style={{ marginTop: '10px', fontSize: '0.72rem', color: '#ef4444', textAlign: 'center', fontWeight: 500 }}>
                ⚠️ {lastPollError}
              </div>
            )}
          </div>
        )}

        {/* ── STATE 3: COMPLETED OR TIMEOUT (Receipt & Payment) ── */}
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
                {status === 'timeout' ? `⏱️ Hết thời gian phiên (${maxMinutes} phút)` : '✅ Đã hoàn tất phiên in sớm'}
              </div>

              <h2 style={{ margin: '10px 0 2px 0', fontSize: '1.3rem', fontWeight: 800, color: t.text }}>
                Hóa đơn thanh toán
              </h2>
              <div style={{ fontSize: '0.75rem', color: t.textMuted }}>
                Mã phiên: <code style={{ color: isLight ? '#0284c7' : '#38bdf8', fontWeight: 700 }}>{session.sessionId}</code>
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
