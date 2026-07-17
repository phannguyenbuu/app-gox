import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { AnimatedButton } from '../components/ui/AnimatedButton';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';

export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(email);
      if (result.success) {
        navigate('/dashboard', { replace: true });
      } else {
        setError(result.error);
      }
    } catch {
      setError('Đã xảy ra lỗi. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <motion.div
        style={styles.formWrapper}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      >
        <div style={styles.logoArea}>
          <motion.div
            style={styles.logoGlow}
            animate={{
              boxShadow: [
                '0 0 20px rgba(0,212,255,0.2)',
                '0 0 40px rgba(0,212,255,0.4)',
                '0 0 20px rgba(0,212,255,0.2)',
              ],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            <span style={styles.logoIcon}>⚙</span>
          </motion.div>
          <h1 style={styles.title}>Quản lý Sửa chữa Máy móc</h1>
        </div>

        <form onSubmit={handleLogin} style={styles.form}>
          <div style={styles.field}>
            <label htmlFor="email" style={styles.label}>
              Email <span style={{ color: 'var(--color-error)' }}>*</span>
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Nhập email"
              style={styles.input}
              autoComplete="email"
              disabled={loading}
              autoFocus
            />
          </div>

          {error && (
            <motion.div
              style={styles.error}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {error}
            </motion.div>
          )}

          <div style={styles.buttonWrapper}>
            {loading ? (
              <div style={styles.spinnerWrapper}>
                <LoadingSpinner size="sm" />
              </div>
            ) : (
              <AnimatedButton disabled={!email.trim()}>Đăng nhập</AnimatedButton>
            )}
          </div>
        </form>
      </motion.div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh', display: 'flex', alignItems: 'center',
    justifyContent: 'center', padding: '24px 20px', background: 'var(--color-bg)',
  },
  formWrapper: { width: '100%', maxWidth: '380px' },
  logoArea: { textAlign: 'center', marginBottom: '24px' },
  logoGlow: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 64, height: 64, borderRadius: '50%',
    background: 'var(--color-surface)', border: '1px solid var(--color-primary)', marginBottom: 12,
  },
  logoIcon: { fontSize: '28px', color: 'var(--color-primary)' },
  title: { fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-primary)', margin: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: '16px' },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '0.85rem', color: 'var(--color-text-secondary)', fontWeight: 500 },
  input: {
    background: 'var(--color-surface)', color: 'var(--color-text)',
    border: '1px solid var(--color-surface-light)', borderRadius: '8px',
    padding: '12px', fontSize: '1rem', width: '100%', boxSizing: 'border-box' as const,
  },
  passwordWrapper: { position: 'relative', display: 'flex', alignItems: 'center' },
  eyeBtn: {
    position: 'absolute', right: '12px', background: 'none', border: 'none',
    color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '4px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  error: {
    color: 'var(--color-error)', fontSize: '0.875rem', padding: '10px 12px',
    background: 'color-mix(in srgb, var(--color-error) 10%, var(--color-surface))',
    borderRadius: '8px', border: '1px solid color-mix(in srgb, var(--color-error) 25%, transparent)',
  },
  buttonWrapper: { marginTop: '4px' },
  spinnerWrapper: { display: 'flex', justifyContent: 'center', padding: '8px 0' },
};
