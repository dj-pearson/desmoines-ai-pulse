import { useState, useRef, useCallback, useEffect } from 'react';
import { X } from 'lucide-react';
import { isCapacitor } from '@/lib/capacitorUtils';

interface ImageViewerProps {
  src: string;
  alt: string;
  children: React.ReactNode;
}

/**
 * Full-screen image viewer with pinch-to-zoom and swipe-to-dismiss.
 * Wraps its children (e.g. an <img>) — tap to open the viewer.
 * Only activates in Capacitor; on web, children render normally.
 */
export function ImageViewer({ src, alt, children }: ImageViewerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [translateY, setTranslateY] = useState(0);
  const initialPinchDistance = useRef(0);
  const initialScale = useRef(1);
  const touchStartY = useRef(0);
  const isDismissing = useRef(false);
  const imgRef = useRef<HTMLDivElement>(null);

  const handleOpen = useCallback(() => {
    if (isCapacitor()) {
      setIsOpen(true);
      setScale(1);
      setTranslateY(0);
    }
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setScale(1);
    setTranslateY(0);
    isDismissing.current = false;
  }, []);

  // Handle pinch-to-zoom
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch start
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      initialPinchDistance.current = Math.hypot(dx, dy);
      initialScale.current = scale;
    } else if (e.touches.length === 1 && scale <= 1) {
      // Single touch — potential swipe-to-dismiss
      touchStartY.current = e.touches[0].clientY;
      isDismissing.current = true;
    }
  }, [scale]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.hypot(dx, dy);
      const newScale = Math.max(0.5, Math.min(5, initialScale.current * (distance / initialPinchDistance.current)));
      setScale(newScale);
      isDismissing.current = false;
    } else if (e.touches.length === 1 && isDismissing.current && scale <= 1) {
      // Swipe-to-dismiss
      const deltaY = e.touches[0].clientY - touchStartY.current;
      setTranslateY(deltaY);
    }
  }, [scale]);

  const handleTouchEnd = useCallback(() => {
    if (isDismissing.current && Math.abs(translateY) > 100) {
      // Dismiss threshold reached
      handleClose();
    } else {
      setTranslateY(0);
    }
    isDismissing.current = false;

    // Snap scale back to 1 if it's below
    if (scale < 1) {
      setScale(1);
    }
  }, [translateY, scale, handleClose]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  // Prevent body scroll when viewer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const opacity = Math.max(0, 1 - Math.abs(translateY) / 300);

  return (
    <>
      <div onClick={handleOpen} className={isCapacitor() ? 'cursor-zoom-in' : ''}>
        {children}
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ backgroundColor: `rgba(0, 0, 0, ${opacity})` }}
          onClick={handleClose}
        >
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 text-white"
            style={{ top: 'max(1rem, env(safe-area-inset-top, 1rem))' }}
            aria-label="Close image viewer"
          >
            <X className="h-6 w-6" />
          </button>

          {/* Image */}
          <div
            ref={imgRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={(e) => e.stopPropagation()}
            className="w-full h-full flex items-center justify-center"
            style={{
              transform: `translateY(${translateY}px) scale(${scale})`,
              transition: isDismissing.current ? 'none' : 'transform 200ms ease-out',
              touchAction: 'none',
            }}
          >
            <img
              src={src}
              alt={alt}
              className="max-w-full max-h-full object-contain select-none"
              draggable={false}
            />
          </div>
        </div>
      )}
    </>
  );
}
