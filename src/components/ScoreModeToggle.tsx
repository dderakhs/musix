import { useEffect, useRef, useState } from 'react';
import { SCORE_MODE_LABELS, useScoreMode, type ScoreMode } from '../lib/scoreMode';
import { useAuth } from '../lib/auth';
import './ScoreModeToggle.css';

/**
 * One control deciding which score the whole site shows. Public is the default
 * and the first option; musix's own user ratings are the deliberate switch.
 */
export default function ScoreModeToggle() {
  const { mode, setMode } = useScoreMode();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // "Your ratings" only means something once there is an account behind it.
  const modes: ScoreMode[] = user ? ['public', 'user', 'mine'] : ['public', 'user'];

  return (
    <div className="smode" ref={ref}>
      <button
        type="button"
        className="btn smode-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="smode-label">{SCORE_MODE_LABELS[mode]}</span>
        <svg viewBox="0 0 12 12" className="smode-caret" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6"
                strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="smode-menu" role="listbox">
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              role="option"
              aria-selected={mode === m}
              className="smode-option"
              data-active={mode === m}
              onClick={() => {
                setMode(m);
                setOpen(false);
              }}
            >
              {SCORE_MODE_LABELS[m]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
