import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getJobs } from '../api/mockAgentApi';

interface JobItem {
  id: number;
  lead: string;
  lan_uid: string;
  agent_uid: string;
  printer_id: number;
  printer_name: string;
  ip: string;
  command_type: string;
  command_params: string;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'superseded' | string;
  error_message: string;
  requested_at: string;
  responded_at: string;
}

function getCommandName(type: string, paramsStr: string): string {
  if (type === 'trigger_utility') {
    try {
      const params = JSON.parse(paramsStr || '{}');
      const cmd = params.command || params.action || params.utility_type || params.cmd_name || params.type || '';
      if (cmd === 'query_device_now') return '🔍 Truy vấn Máy in tức thì';
      if (cmd === 'start_camera_recorder') return '📹 Kích hoạt Ghi hình Camera';
      if (cmd === 'stop_camera_recorder') return '⏹️ Dừng ghi hình Camera';
      if (cmd === 'test_camera_rtsp') return '🔌 Kiểm tra kết nối RTSP';
      if (cmd === 'query_camera_video') return '🎬 Truy xuất Video Camera';
      if (cmd === 'delete_camera_file') return '🗑️ Xóa tệp video Camera';
      if (cmd === 'list_camera_files') return '📂 Lấy danh sách video';
      if (cmd === 'get_camera_status') return '📊 Xem trạng thái ghi hình';
      if (cmd === 'start_tunnel') return '🌐 Mở kết nối Web Proxy (SSH Tunnel)';
      if (cmd === 'stop_tunnel') return '🔌 Đóng kết nối Web Proxy';
      if (cmd === 'force_subnet_scan') return '📡 Quét thiết bị mạng LAN';
      if (cmd === 'get_agent_ip') return '🔄 Lấy thông tin IP cục bộ';
      if (cmd === 'change_agent_ip') return '⚙️ Thay đổi IP máy Agent';
      return cmd ? `⚙️ Lệnh tiện ích: ${cmd}` : '⚙️ Lệnh tiện ích';
    } catch {
      return '⚙️ Lệnh tiện ích';
    }
  }
  
  if (type === 'emergency_restart') return '🔄 Khởi động lại Agent';
  if (type === 'general_settings') return '⚙️ Cập nhật cấu hình Agent';
  if (type === 'add_scan_email_dest') return '📧 Thêm đích quét Email';
  if (type === 'delete_scan_email_dest') return '🗑️ Xóa đích quét Email';
  if (type === 'fetch_address_book') return '📖 Đồng bộ danh bạ máy in';
  if (type === 'address_modify') return '✏️ Chỉnh sửa điểm scan';
  if (type === 'install_driver') return '🖨️ Cài đặt Driver máy in';
  if (type === 'save_printer_auth' || type === 'update_credentials') return '🔑 Cập nhật mật khẩu máy in';
  if (type === 'when_ip_change') return '🔄 Phát hiện đổi IP máy trạm (when_ip_change)';
  return `⚡ Lệnh hệ thống: ${type}`;
}

export default function DownloadPage() {
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [copiedJobId, setCopiedJobId] = useState<number | null>(null);
  
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [totalJobs, setTotalJobs] = useState(0);

  const fetchJobsList = useCallback(async () => {
    try {
      const res = await getJobs(undefined, undefined, undefined, page, limit, filterStatus, search);
      if (res.ok && res.jobs) {
        setJobs(res.jobs);
        if (res.total !== undefined) setTotalJobs(res.total);
        setError(null);
      } else {
        setError(res.error || 'Lỗi tải danh sách công việc');
      }
    } catch (err: any) {
      setError('Lỗi kết nối server: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll for jobs every 3 seconds to show live updates of pending tasks
  useEffect(() => {
    fetchJobsList();
    const interval = setInterval(fetchJobsList, 3000);
    return () => clearInterval(interval);
  }, [fetchJobsList]);
  
  useEffect(() => {
    setPage(1);
  }, [search, filterStatus, limit]);

  const hasPendingJob = jobs.some((job) => job.status === 'pending');

  const filteredJobs = jobs;

  return (
    <div style={{ padding: '16px 16px 80px', minHeight: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
          📋 Job Manager
        </h2>
        {hasPendingJob && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 11, color: 'var(--color-warning)', fontWeight: 600,
            background: 'rgba(234,179,8,0.1)', padding: '4px 10px', borderRadius: 20
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--color-warning)',
              animation: 'pulse-yellow 1.2s infinite'
            }} />
            Đang polling phản hồi...
          </div>
        )}
      </div>

      {/* Search & Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Tìm theo lệnh, Agent ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1, padding: '9px 12px', border: '1.5px solid var(--color-surface-light)',
            borderRadius: 9, fontSize: 13, background: 'var(--color-surface)', color: 'var(--color-text)',
            outline: 'none', boxSizing: 'border-box'
          }}
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{
            padding: '0 10px', border: '1.5px solid var(--color-surface-light)',
            borderRadius: 9, fontSize: 13, background: 'var(--color-surface)', color: 'var(--color-text)',
            outline: 'none', cursor: 'pointer'
          }}
        >
          <option value="all">Tất cả</option>
          <option value="pending">Chờ phản hồi</option>
          <option value="success">Thành công</option>
          <option value="failed">Thất bại</option>
        </select>
      </div>

      {error && (
        <div style={{ padding: 14, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, color: '#f87171', fontSize: 13, marginBottom: 12 }}>
          ⚠️ {error}
        </div>
      )}

      {loading && jobs.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13 }}>
          ⏳ Đang tải danh sách lệnh...
        </div>
      ) : filteredJobs.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13, border: '1.5px dashed var(--color-surface-light)', borderRadius: 12 }}>
          Không tìm thấy lệnh nào
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredJobs.map((job) => {
            const isExpanded = expandedJobId === job.id;
            const cmdName = getCommandName(job.command_type, job.command_params);

            return (
              <div
                key={job.id}
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-surface-light)',
                  borderRadius: 12,
                  overflow: 'hidden',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  transition: 'border-color 0.2s',
                  borderColor: isExpanded ? 'var(--color-primary-light)' : 'var(--color-surface-light)'
                }}
              >
                {/* Header Row */}
                <div
                  onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
                  style={{
                    padding: '12px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    gap: 10
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 600 }}>#{job.id}</span>
                      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {cmdName}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
                      <span>Agent: <b>{job.agent_uid}</b></span>
                      <span>•</span>
                      <span>{job.requested_at}</span>
                    </div>
                  </div>

                  {/* Badge */}
                  {(() => {
                    const isRealError = job.status === 'failed' || (job.error_message && (job.error_message.includes('[-] LỖI') || job.error_message.includes('LỖI:') || job.error_message.includes('SyntaxError') || job.error_message.includes('RuntimeError') || job.error_message.includes('Traceback')));
                    const isSuperseded = job.status === 'superseded' || (job.error_message && (job.error_message.includes('thay thế') || job.error_message.includes('thử lại sau')));
                    const isPending = job.status === 'pending' || job.status === 'processing';
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            padding: '3px 8px',
                            borderRadius: 20,
                            background:
                              isPending ? 'rgba(234,179,8,0.15)' :
                              isRealError ? 'rgba(239,68,68,0.15)' :
                              isSuperseded ? 'rgba(148,163,184,0.15)' :
                              'rgba(34,197,94,0.15)',
                            color:
                              isPending ? 'var(--color-warning)' :
                              isRealError ? '#f87171' :
                              isSuperseded ? '#94a3b8' :
                              '#4ade80',
                          }}
                        >
                          {
                            isPending ? 'Chờ Agent' :
                            isRealError ? 'Lỗi thực thi' :
                            isSuperseded ? 'Thay thế' :
                            'Thành công'
                          }
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                          {isExpanded ? '▲' : '▼'}
                        </span>
                      </div>
                    );
                  })()}
                </div>

                {/* Collapsible Content */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      style={{ overflow: 'hidden', borderTop: '1px solid var(--color-surface-light)' }}
                    >
                      <div style={{ padding: 14, fontSize: 12, background: 'rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {/* Parameters Details */}
                        {(() => {
                          let parsed: any = null;
                          try {
                            parsed = JSON.parse(job.command_params);
                          } catch {
                            parsed = null;
                          }

                          let execScript = '';
                          let paramsToDisplay = job.command_params;

                          if (parsed && typeof parsed === 'object') {
                            if (parsed.command_content) {
                              execScript = String(parsed.command_content);
                              const { command_content, ...rest } = parsed;
                              paramsToDisplay = JSON.stringify(rest, null, 2);
                            } else {
                              paramsToDisplay = JSON.stringify(parsed, null, 2);
                            }
                          }

                          // Format newlines correctly for textarea
                          const formattedScript = execScript ? execScript.replace(/\\n/g, '\n').replace(/\\t/g, '  ') : '';

                          return (
                            <div>
                              <div style={{ color: 'var(--color-text-secondary)', fontWeight: 600, marginBottom: 4 }}>Chi tiết lệnh gửi đi:</div>
                              <pre style={{
                                margin: 0, padding: 8, background: 'rgba(0,0,0,0.3)', borderRadius: 6,
                                color: '#a5b4fc', fontFamily: 'monospace', overflowX: 'auto', fontSize: 11
                              }}>
                                {paramsToDisplay}
                              </pre>

                              {formattedScript && (
                                <div style={{ marginTop: 8 }}>
                                  <div style={{ color: '#818cf8', fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>📜 Nội dung Exec Script (command_content):</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        navigator.clipboard.writeText(formattedScript);
                                        setCopiedJobId(job.id);
                                        setTimeout(() => setCopiedJobId(null), 2000);
                                      }}
                                      style={{
                                        padding: '4px 10px',
                                        fontSize: 11,
                                        fontWeight: 600,
                                        borderRadius: 4,
                                        border: '1px solid rgba(99, 102, 241, 0.6)',
                                        background: copiedJobId === job.id ? 'rgba(34, 197, 94, 0.2)' : 'rgba(99, 102, 241, 0.25)',
                                        color: copiedJobId === job.id ? '#4ade80' : '#c7d2fe',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        transition: 'all 0.2s',
                                        outline: 'none'
                                      }}
                                    >
                                      {copiedJobId === job.id ? '✓ Đã chép vào bộ nhớ tam!' : '📋 Sao chép Script'}
                                    </button>
                                  </div>
                                  <textarea
                                    readOnly
                                    value={formattedScript}
                                    style={{
                                      width: '100%',
                                      height: '50vh',
                                      minHeight: 200,
                                      padding: 10,
                                      background: '#0f172a',
                                      border: '1px solid rgba(99, 102, 241, 0.4)',
                                      borderRadius: 6,
                                      color: '#38bdf8',
                                      fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                                      fontSize: 11,
                                      lineHeight: '1.5',
                                      resize: 'vertical',
                                      outline: 'none',
                                      boxSizing: 'border-box'
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Terminal Response Details */}
                        {(() => {
                          const isRealError = job.status === 'failed' || (job.error_message && (job.error_message.includes('[-] LỖI') || job.error_message.includes('LỖI:') || job.error_message.includes('SyntaxError') || job.error_message.includes('RuntimeError') || job.error_message.includes('Traceback')));
                          const isSuperseded = job.status === 'superseded' || (job.error_message && (job.error_message.includes('thay thế') || job.error_message.includes('thử lại sau')));
                          
                          if (job.error_message && job.error_message.trim()) {
                            return (
                              <div>
                                <div style={{ color: 'var(--color-text-secondary)', fontWeight: 600, marginBottom: 4 }}>
                                  {job.status === 'processing' ? '⏳ Nhật ký tiến trình đang thực thi:' : 'Kết quả phản hồi từ máy trạm:'}
                                </div>
                                <pre style={{
                                  margin: 0, padding: 8,
                                  background: isSuperseded ? 'rgba(148,163,184,0.06)' : isRealError ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.06)',
                                  border: `1px solid ${isSuperseded ? 'rgba(148,163,184,0.2)' : isRealError ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.15)'}`,
                                  borderRadius: 6,
                                  color: isSuperseded ? '#cbd5e1' : isRealError ? '#fca5a5' : '#86efac',
                                  fontFamily: 'monospace', overflowX: 'auto', fontSize: 11, whiteSpace: 'pre-wrap'
                                }}>
                                  {job.error_message}
                                </pre>
                              </div>
                            );
                          }

                          if (job.status === 'pending' || job.status === 'processing') {
                            return (
                              <div>
                                <div style={{ color: 'var(--color-text-secondary)', fontWeight: 600, marginBottom: 4 }}>Trạng thái thực thi:</div>
                                <div style={{
                                  padding: 8, background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.2)',
                                  borderRadius: 6, color: '#fde047', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6
                                }}>
                                  <span>⏳</span>
                                  <span>Lệnh đã được gửi đến hàng đợi. Đang chờ Agent tại máy trạm tiếp nhận và thực thi trên máy photocopy...</span>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div>
                              <div style={{ color: 'var(--color-text-secondary)', fontWeight: 600, marginBottom: 4 }}>Kết quả phản hồi từ máy trạm:</div>
                              <pre style={{
                                margin: 0, padding: 8,
                                background: isSuperseded ? 'rgba(148,163,184,0.06)' : isRealError ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.06)',
                                border: `1px solid ${isSuperseded ? 'rgba(148,163,184,0.2)' : isRealError ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.15)'}`,
                                borderRadius: 6,
                                color: isSuperseded ? '#cbd5e1' : isRealError ? '#fca5a5' : '#86efac',
                                fontFamily: 'monospace', overflowX: 'auto', fontSize: 11, whiteSpace: 'pre-wrap'
                              }}>
                                {job.status === 'success' ? 'Thực hiện thành công không có thông báo.' : isSuperseded ? 'Lệnh đã được thay thế bởi lệnh mới hơn.' : 'Lệnh thất bại từ máy trạm hoặc không nhận được phản hồi từ Agent.'}
                              </pre>
                            </div>
                          );
                        })()}

                        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8, marginTop: 4 }}>
                          <span>Thời gian yêu cầu: {job.requested_at}</span>
                          {job.responded_at && <span>Hoàn thành: {job.responded_at}</span>}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination UI */}
      {filteredJobs.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 20, gap: 10 }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--color-surface-light)', background: page <= 1 ? 'rgba(255,255,255,0.02)' : 'var(--color-surface)', color: page <= 1 ? '#555' : '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
          >
            &lt;
          </button>
          <div style={{ background: '#ff5722', color: '#fff', padding: '6px 14px', borderRadius: 8, fontWeight: 'bold' }}>
            {page}
          </div>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page >= Math.ceil(totalJobs / limit) || Math.ceil(totalJobs / limit) === 0}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--color-surface-light)', background: (page >= Math.ceil(totalJobs / limit) || Math.ceil(totalJobs / limit) === 0) ? 'rgba(255,255,255,0.02)' : 'var(--color-surface)', color: (page >= Math.ceil(totalJobs / limit) || Math.ceil(totalJobs / limit) === 0) ? '#555' : '#fff', cursor: (page >= Math.ceil(totalJobs / limit) || Math.ceil(totalJobs / limit) === 0) ? 'not-allowed' : 'pointer' }}
          >
            &gt;
          </button>
          
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            style={{ marginLeft: 10, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--color-surface-light)', background: 'var(--color-surface)', color: '#fff' }}
          >
            <option value={20}>20 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
            <option value={200}>200 / page</option>
          </select>
        </div>
      )}

      {/* Global CSS for pulsing animation */}
      <style>{`
        @keyframes pulse-yellow {
          0% { box-shadow: 0 0 0 0 rgba(234,179,8,0.7); }
          70% { box-shadow: 0 0 0 5px rgba(234,179,8,0); }
          100% { box-shadow: 0 0 0 0 rgba(234,179,8,0); }
        }
      `}</style>
    </div>
  );
}
