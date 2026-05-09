import { useEffect, useRef, useState } from 'react';
import type { AppView } from '@/lib/views';

interface PageTransitionBarProps {
  currentView: AppView;
}

/**
 * Animated top-of-page loading bar that triggers on every view change.
 * Uses a CSS transition with a quick fill → fade approach.
 */
export default function PageTransitionBar({ currentView }: PageTransitionBarProps) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const prevViewRef = useRef(currentView);

  useEffect(() => {
    if (currentView === prevViewRef.current) return;
    prevViewRef.current = currentView;

    // Start the bar
    setVisible(true);
    setProgress(0);

    // Simulate fast progress
    const frame1 = requestAnimationFrame(() => setProgress(30));
    const t1 = setTimeout(() => setProgress(65), 100);
    const t2 = setTimeout(() => setProgress(85), 250);
    const t3 = setTimeout(() => setProgress(100), 400);
    const t4 = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 700);

    return () => {
      cancelAnimationFrame(frame1);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [currentView]);

  if (!visible && progress === 0) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[9999] h-[3px]"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.3s ease-out' }}
    >
      <div
        className="h-full rounded-r-full bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600"
        style={{
          width: `${progress}%`,
          transition: progress > 0 ? 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
        }}
      />
    </div>
  );
}
