import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotificationStore, type NotificationType } from '../../services/notificationService';

// Inline style approach using CSS variables directly
const typeStyles: Record<NotificationType, { color: string; borderColor: string; icon: string }> = {
  success: {
    color: 'var(--color-success, #10b981)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
    icon: '✔',
  },
  error: {
    color: 'var(--color-error, #ef4444)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
    icon: '✖',
  },
  info: {
    color: 'var(--color-text-secondary, #94a3b8)',
    borderColor: 'rgba(255, 255, 255, 0.15)',
    icon: '⏳',
  },
};

const ToastContainer: React.FC = () => {
  const { notifications, removeNotification } = useNotificationStore();

  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        right: 12,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 4,
        width: 'auto',
        maxWidth: 'min(48vw, 240px)',
        pointerEvents: 'none',
      }}
    >
      <AnimatePresence>
        {notifications.map((n) => {
          const style = typeStyles[n.type] || typeStyles.info;
          return (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: 15, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 15, scale: 0.95 }}
              transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
              onClick={() => removeNotification(n.id)}
              style={{
                pointerEvents: 'auto',
                cursor: 'pointer',
                background: 'transparent',
                backdropFilter: 'blur(4px)',
                borderRadius: 4,
                padding: '3px 8px',
                fontSize: '0.72rem',
                lineHeight: 1.2,
                fontWeight: 500,
                border: `1px solid ${style.borderColor}`,
                color: style.color,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                wordBreak: 'break-word',
              }}
            >
              <span style={{ fontSize: '0.75rem', lineHeight: 1 }}>{style.icon}</span>
              <span>{n.message}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default ToastContainer;
