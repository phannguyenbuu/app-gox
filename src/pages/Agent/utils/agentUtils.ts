// Utility functions for Agent module

export function safePathToken(value: string): string {
  const text = (value || '').trim();
  if (!text) return 'unknown';
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(text)) {
    try {
      return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch {
      return 'unknown';
    }
  }
  const m = text.match(/^pub_(\d{1,3})_(\d{1,3})_(\d{1,3})_(\d{1,3})$/);
  if (m) {
    const rawIp = `${m[1]}.${m[2]}.${m[3]}.${m[4]}`;
    try {
      return btoa(rawIp).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch {
      return 'unknown';
    }
  }
  const ascii = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._@-]/g, '-')
    .replace(/^[\s\-_.]+|[\s\-_.]+$/g, '');
  return ascii || 'unknown';
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
