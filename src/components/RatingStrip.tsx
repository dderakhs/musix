import { useState } from 'react';
import './RatingStrip.css';

interface Props {
  value: number | null;
  disabled?: boolean;
  onRate: (score: number) => void;
  onClear: () => void;
}

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** 1-10, the scale musix members rate on. */
export default function RatingStrip({ value, disabled = false, onRate, onClear }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;

  return (
    <div className="rating-strip">
      <div
        className="rating-strip-buttons"
        role="radiogroup"
        aria-label="Your rating out of 10"
        onMouseLeave={() => setHover(null)}
      >
        {SCORES.map((score) => (
          <button
            key={score}
            type="button"
            role="radio"
            aria-checked={value === score}
            aria-label={`${score} out of 10`}
            disabled={disabled}
            className="rating-strip-button"
            data-filled={shown != null && score <= shown}
            data-exact={value === score}
            onMouseEnter={() => setHover(score)}
            onFocus={() => setHover(score)}
            onBlur={() => setHover(null)}
            onClick={() => onRate(score)}
          >
            {score}
          </button>
        ))}
      </div>
      {value != null && !disabled && (
        <button type="button" className="rating-strip-clear muted" onClick={onClear}>
          Clear
        </button>
      )}
    </div>
  );
}
