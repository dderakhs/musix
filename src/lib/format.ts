export function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return '--:--';
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function formatYear(date: string | null): string {
  if (!date) return '';
  return date.slice(0, 4);
}

/** One decimal, or an em dash when there is nothing to show. */
export function formatScore(score: number | null | undefined): string {
  return score == null ? '—' : score.toFixed(1);
}

export function pluralise(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
