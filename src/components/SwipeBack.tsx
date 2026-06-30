import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

/**
 * Mobile swipe-from-left-edge to go back (iOS-like).
 * Start within 24px of left edge, drag right >80px to trigger back().
 */
const SwipeBack = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const tracking = useRef(false);
  const [drag, setDrag] = useState(0);

  useEffect(() => {
    // Disable on login page
    if (location.pathname === '/login' || location.pathname === '/') return;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      if (t.clientX <= 24) {
        startX.current = t.clientX;
        startY.current = t.clientY;
        tracking.current = true;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking.current || startX.current === null || startY.current === null) return;
      const t = e.touches[0];
      const dx = t.clientX - startX.current;
      const dy = Math.abs(t.clientY - startY.current);
      if (dy > 40) { tracking.current = false; setDrag(0); return; }
      if (dx > 0) setDrag(Math.min(dx, 200));
    };
    const onEnd = () => {
      if (!tracking.current) return;
      if (drag > 80) navigate(-1);
      tracking.current = false;
      startX.current = null;
      setDrag(0);
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [drag, navigate, location.pathname]);

  if (drag <= 0) return null;
  const opacity = Math.min(drag / 80, 1);
  return (
    <div
      className="fixed top-1/2 -translate-y-1/2 z-[100] pointer-events-none flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
      style={{
        left: Math.min(drag - 24, 80),
        width: 48,
        height: 48,
        opacity,
        transform: `translateY(-50%) scale(${0.6 + opacity * 0.4})`,
      }}
    >
      <ChevronLeft className="h-7 w-7" />
    </div>
  );
};

export default SwipeBack;
