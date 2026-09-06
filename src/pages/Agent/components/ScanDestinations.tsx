// @ts-nocheck
import React from 'react';
import { styles } from '../AgentStyles';

export interface ScanDestinationsProps {
  hasAddressList: boolean;
  sync: any;
  p: any;
  commandStatus: Record<string, any>;
  getDestinationStatus: (entry: any) => any;
  selectedLan: any;
  handleOpenStorageFiles: (lanUid: string, destVal: string) => void;
  handleDeleteDest: (pTarget: any, entry: any) => void;
  handleChangeFtp?: (printer: any, entry: any) => void;
  handleEditIP?: (pTarget: any, entry: any) => void;
}

export function ScanDestinations({
  hasAddressList,
  sync,
  p,
  commandStatus,
  getDestinationStatus,
  selectedLan,
  handleOpenStorageFiles,
  handleDeleteDest,
  handleChangeFtp,
  handleEditIP
}: ScanDestinationsProps) {
  const filteredList = Array.isArray(sync?.address_list)
    ? sync.address_list.filter((entry: any) => {
        if (!entry || typeof entry !== 'object') return false;
        if (entry.type === 'Summary') return false;
        const name = (entry.name || '').trim();
        if (name === 'Summary' || name === 'Total' || name.startsWith('Users:')) return false;
        return Boolean(name || entry.entry_id || (entry.registration_no && entry.registration_no !== '-') || entry.email_address || entry.email || entry.folder || entry.physical_path);
      })
    : [];

  const pMac = String(p?.mac_address || p?.mac_id || '').toUpperCase().replace(/-/g, ':');
  const pIp = String(p?.ip || p?.printer_ip || '').trim();
  const printerKey = pMac || pIp || String(p?.id || '0');

  return (
    <div style={styles.destinationsBlock}>
      <span style={styles.destBlockTitle}>📂 Danh sách điểm scan:</span>
      
      {filteredList.length > 0 ? (
        filteredList.map((entry: any, eIdx: number) => {
          const emailVal = entry.email_address || entry.email || '';
          const folderVal = entry.physical_path || entry.folder || entry.folder_path || '';
          const destVal = (emailVal || folderVal || '').trim();

          let destType = 'Folder';
          if (folderVal.startsWith('ftp://')) destType = 'FTP';
          else if (folderVal.startsWith('\\\\')) destType = 'SMB';
          else if (emailVal || emailVal.includes('@')) destType = 'Email';

          const statusInfo = typeof getDestinationStatus === 'function' ? getDestinationStatus(entry) : { label: '✔ ACTIVE', type: 'success', title: '' };
          const regNo = (entry.registration_no && entry.registration_no !== '-') ? entry.registration_no : (entry.entry_id || (eIdx + 1));
          const rowKey = `${printerKey}-${regNo}`;
          const isRowPending = Boolean(
            commandStatus[rowKey]?.isPending || 
            (p?.id && commandStatus[`${p.id}-${regNo}`]?.isPending) ||
            (pMac && commandStatus[`${pMac}-${regNo}`]?.isPending)
          );

          return (
            <div key={eIdx} style={{ ...styles.destItemCard, flexDirection: 'row', alignItems: 'center', gap: '12px', flexWrap: 'nowrap', overflow: 'hidden' }}>
              {/* 1. Reg No */}
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 600, minWidth: 'max-content' }}>
                #{regNo}
              </span>

              {/* 2. Name */}
              <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                {entry.name}
                {(entry.warning || entry.error) && (
                  <span style={{ color: '#fbbf24', cursor: 'help' }} title={entry.warning || entry.error}>
                    ⚠️
                  </span>
                )}
              </span>

              {/* (Optional) 📁 File count */}
              {typeof entry.file_count === 'number' && (
                <span
                  onClick={() => handleOpenStorageFiles(selectedLan.lan_uid, destVal)}
                  style={{
                    color: 'var(--color-primary)',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    whiteSpace: 'nowrap'
                  }}
                  title="Xem danh sách tệp tin đã scan trên VPS"
                >
                  📁 {entry.file_count} files
                </span>
              )}

              {/* 3. ID */}
              {entry.entry_id && (
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                  ID: <strong>{entry.entry_id}</strong>
                </span>
              )}

              {/* 3.5. Change FTP */}
              {handleChangeFtp && (destType === 'FTP' || destType === 'Folder') && (
                <button
                  style={{
                    padding: '4px',
                    fontSize: '0.9rem',
                    color: 'var(--color-primary)',
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: '4px',
                    cursor: isRowPending ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: isRowPending ? 0.5 : 1,
                    minWidth: '24px'
                  }}
                  onClick={() => handleEditIP && handleEditIP(p, entry)}
                  disabled={isRowPending}
                  title="Thay đổi FTP (Cập nhật IP)"
                >
                  ✏️
                </button>
              )}

              {/* 4. Trash */}
              <button
                style={{
                  padding: '4px',
                  fontSize: '0.9rem',
                  color: 'var(--color-error)',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '4px',
                  cursor: isRowPending ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: isRowPending ? 0.5 : 1,
                  minWidth: '24px'
                }}
                onClick={() => handleDeleteDest(p, entry)}
                disabled={isRowPending}
                title="Xóa"
              >
                🗑️
              </button>
            </div>
          );
        })
      ) : (
        <div style={styles.emptySubText}>
          {sync.status === 'error'
            ? 'Không thể tải danh sách (Lỗi đồng bộ)'
            : 'Chưa có điểm scan nào trên máy in.'}
        </div>
      )}
    </div>
  );
}
