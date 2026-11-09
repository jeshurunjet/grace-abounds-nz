'use client';
import { CSSProperties, ReactNode, useEffect, useRef, useState } from 'react';
export function Reveal({
  children,
  direction = 'up',
  delay = 0,
  duration = 600,
  threshold = 0.12,
  className = '',
}: {
  children: ReactNode;
  direction?: 'up' | 'down' | 'left' | 'right' | 'fade' | 'scale';
  delay?: number;
  duration?: number;
  threshold?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold]);
  return (
    <div
      ref={ref}
      className={`reveal reveal-${direction} ${visible ? 'is-visible' : ''} ${className}`}
      style={
        {
          '--reveal-delay': `${delay}ms`,
          '--reveal-duration': `${duration}ms`,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}
