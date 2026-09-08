import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * Which score the whole site leads with. Public is the default everywhere —
 * musix user ratings are the deliberate opt-in, not the other way round.
 */
export type ScoreMode = 'public' | 'user' | 'mine';

interface ScoreModeValue {
  mode: ScoreMode;
  setMode: (mode: ScoreMode) => void;
  /** Human label for the active mode, for headings and the toggle button. */
  label: string;
}

const ScoreModeContext = createContext<ScoreModeValue | null>(null);

const STORAGE_KEY = 'musix:score-mode';

function readStored(): ScoreMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'user' || stored === 'mine' ? stored : 'public';
  } catch {
    // Private browsing or blocked storage: fall back to the public default.
    return 'public';
  }
}

export const SCORE_MODE_LABELS: Record<ScoreMode, string> = {
  public: 'Public ratings',
  user: 'musix users',
  mine: 'Your ratings',
};

export function ScoreModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ScoreMode>(readStored);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Nothing to do; the choice just will not persist.
    }
  }, [mode]);

  const setMode = useCallback((next: ScoreMode) => setModeState(next), []);

  const value = useMemo<ScoreModeValue>(
    () => ({ mode, setMode, label: SCORE_MODE_LABELS[mode] }),
    [mode, setMode],
  );

  return <ScoreModeContext.Provider value={value}>{children}</ScoreModeContext.Provider>;
}

export function useScoreMode(): ScoreModeValue {
  const ctx = useContext(ScoreModeContext);
  if (!ctx) throw new Error('useScoreMode must be used inside <ScoreModeProvider>');
  return ctx;
}
