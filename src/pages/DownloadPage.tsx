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
  status: 'pending' | 'success' | 'failed';
  error_message: string;
  requested_at: string;
  responded_at: string;
}

function getCommandName(type: string, paramsStr: string): string {
  if (type === 'trigger_utility') {
    try {
      const params = JSON.parse(paramsStr);
      const cmd = params.command;
      if (cmd === 'query_device_now') return '🔍 Truy vấn Máy in tức thì';
      if (cmd === 'start_camera_recorder') return '📹 Kích hoạt Ghi hình Camera';
      if (cmd === 'stop_camera_recorder') return '⏹️ Dừng ghi hình Camera';
      if (cmd === 'test_camera_rtsp') return '🔌 Kiểm tra kết nối RTSP';
      if (cmd === 'query_camera_video') return '🎬 Truy xuất Video Camera';
      if (cmd === 'delete_camera_file') return '🗑️ Xóa tệp video Camera';
      if (cmd === 'list_camera_files') return '📂 Lấy danh sách video';
      if (cmd === 'get_camera_status') return '📊 Xem trạng thái ghi hình';
      return `⚙️ Lệnh tiện ích: ${cmd}`;
    } catch {
      return '⚙️ Lệnh tiện ích';
    }
  }
  if (type === 'emergency_restart') return '🔄 Khởi động lại Agent';
  if (type === 'general_settings') return '⚙️ Cập nhật cấu hình Agent';
  if (type === 'add_scan_email_dest') return '📧 Thêm đích quét Email';
  if (type === 'delete_scan_email_dest') return '🗑️ Xóa đích quét Email';
  return `⚡ Lệnh hệ thống: ${type}`;
}

export default function DownloadPage() {
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const fetchJobsList = useCallback(async () => {
    try {
      const res = await getJobs();
      if (res.ok && res.jobs) {
        setJobs(res.jobs);
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

  const hasPendingJob = jobs.some((job) => job.status === 'pending');

  const filteredJobs = jobs.filter((job) => {
    const name = getCommandName(job.command_type, job.command_params).toLowerCase();
    const agent = job.agent_uid.toLowerCase();
    const q = search.toLowerCase();
    const matchesSearch = name.includes(q) || agent.includes(q) || String(job.id).includes(q);
    const matchesStatus = filterStatus === 'all' || job.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '3px 8px',
                        borderRadius: 20,
                        background:
                          job.status === 'success' ? 'rgba(34,197,94,0.15)' :
                          job.status === 'failed' ? 'rgba(239,68,68,0.15)' :
                          'rgba(234,179,8,0.15)',
                        color:
                          job.status === 'success' ? '#4ade80' :
                          job.status === 'failed' ? '#f87171' :
                          'var(--color-warning)',
                      }}
                    >
                      {job.status === 'pending' ? 'Chờ Agent' : job.status === 'success' ? 'Thành công' : 'Thất bại'}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
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
                        <div>
                          <div style={{ color: 'var(--color-text-secondary)', fontWeight: 600, marginBottom: 4 }}>Chi tiết lệnh gửi đi:</div>
                          <pre style={{
                            margin: 0, padding: 8, background: 'rgba(0,0,0,0.3)', borderRadius: 6,
                            color: '#a5b4fc', fontFamily: 'monospace', overflowX: 'auto', fontSize: 11
                          }}>
                            {(() => {
                              try {
                                const parsed = JSON.parse(job.command_params);
                                return JSON.stringify(parsed, null, 2);
                              } catch {
                                return job.command_params;
                              }
                            })()}
                          </pre>
                        </div>

                        {/* Terminal Response Details */}
                        {(job.status !== 'pending' || job.error_message) && (
                          <div>
                            <div style={{ color: 'var(--color-text-secondary)', fontWeight: 600, marginBottom: 4 }}>Kết quả phản hồi từ máy trạm:</div>
                            <pre style={{
                              margin: 0, padding: 8,
                              background: job.status === 'failed' ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.06)',
                              border: `1px solid ${job.status === 'failed' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)'}`,
                              borderRadius: 6,
                              color: job.status === 'failed' ? '#fca5a5' : '#86efac',
                              fontFamily: 'monospace', overflowX: 'auto', fontSize: 11, whiteSpace: 'pre-wrap'
                            }}>
                              {job.error_message || 'Thực hiện thành công không có thông báo.'}
                            </pre>
                          </div>
                        )}

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
