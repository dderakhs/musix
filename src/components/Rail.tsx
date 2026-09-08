import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import './Rail.css';

interface Props {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}

/**
 * A horizontal shelf with arrow buttons. A bare scrollbar is easy to miss and
 * awkward with a trackpad, so the arrows are the primary affordance; they hide
 * themselves at each end and disappear entirely when everything already fits.
 */
export default function Rail({ title, subtitle, action, children }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setAtStart(el.scrollLeft <= 2);
    setAtEnd(el.scrollLeft >= max - 2);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, children]);

  const nudge = (direction: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    // Move by most of a screenful, leaving a card visible for continuity.
    el.scrollBy({ left: direction * (el.clientWidth * 0.85), behavior: 'smooth' });
  };

  const hidden = atStart && atEnd;

  return (
    <section className="railblock">
      <header className="railblock-head">
        <div>
          <h2 className="railblock-title">{title}</h2>
          {subtitle && <p className="muted railblock-sub">{subtitle}</p>}
        </div>
        <div className="railblock-controls">
          {action}
          {!hidden && (
            <>
              <button
                type="button"
                className="railbtn"
                aria-label={`Scroll ${title} left`}
                disabled={atStart}
                onClick={() => nudge(-1)}
              >
                <Chevron dir="left" />
              </button>
              <button
                type="button"
                className="railbtn"
                aria-label={`Scroll ${title} right`}
                disabled={atEnd}
                onClick={() => nudge(1)}
              >
                <Chevron dir="right" />
              </button>
            </>
          )}
        </div>
      </header>

      <div className="rail" ref={trackRef} onScroll={measure}>
        {children}
      </div>
    </section>
  );
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={`chev chev-${dir}`}>
      <path
        d="M6 3l5 5-5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
