import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface ImageLightboxProps {
  src: string | null;
  alt?: string;
  onClose: () => void;
}

// Modal xem ảnh toàn màn hình — hỗ trợ pinch-to-zoom bằng 2 ngón tay trên điện
// thoại (component ImageZoomViewer sẵn có trong Agent chỉ zoom bằng chuột/lăn
// chuột, không bắt được cử chỉ chạm đa điểm), kèm zoom bằng lăn chuột trên
// desktop và double-tap/double-click để phóng nhanh.
export function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const lastTapRef = useRef(0);

  const reset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const touchDistance = (touches: React.TouchList) => {
    const a = touches[0];
    const b = touches[1];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLImageElement>) => {
    if (e.touches.length === 2) {
      pinchRef.current = { startDist: touchDistance(e.touches), startScale: scale };
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        if (scale > 1) reset();
        else setScale(2.5);
      }
      lastTapRef.current = now;
      if (scale > 1) {
        panRef.current = {
          startX: e.touches[0].clientX,
          startY: e.touches[0].clientY,
          origX: position.x,
          origY: position.y,
        };
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLImageElement>) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const ratio = touchDistance(e.touches) / pinchRef.current.startDist;
      const next = Math.min(Math.max(pinchRef.current.startScale * ratio, 1), 5);
      setScale(next);
      if (next === 1) setPosition({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && panRef.current) {
      e.preventDefault();
      setPosition({
        x: panRef.current.origX + (e.touches[0].clientX - panRef.current.startX),
        y: panRef.current.origY + (e.touches[0].clientY - panRef.current.startY),
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLImageElement>) => {
    if (e.touches.length < 2) pinchRef.current = null;
    if (e.touches.length === 0) panRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLImageElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 0.2 : -0.2;
    setScale((s) => {
      const next = Math.min(Math.max(s + factor, 1), 5);
      if (next === 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  };

  return (
    <AnimatePresence>
      {src && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            touchAction: 'none',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              reset();
              onClose();
            }
          }}
        >
          <button
            onClick={() => {
              reset();
              onClose();
            }}
            aria-label="Đóng"
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              zIndex: 10,
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              fontSize: '1.2rem',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
          <img
            src={src}
            alt={alt || 'Ảnh'}
            draggable={false}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onDoubleClick={() => (scale > 1 ? reset() : setScale(2.5))}
            style={{
              maxWidth: '92vw',
              maxHeight: '85vh',
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transition: pinchRef.current || panRef.current ? 'none' : 'transform 0.15s ease-out',
              touchAction: 'none',
              cursor: scale > 1 ? 'grab' : 'zoom-in',
              userSelect: 'none',
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
