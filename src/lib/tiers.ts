/**
 * Rating tiers.
 *
 * The same seven-band shape seriesgraph uses for episodes, reworded for music.
 * A band is a *label plus a colour* for a 0-10 score, so a grid of tracks reads
 * as a shape at a glance before anyone reads a single number.
 *
 * Every colour was checked against the two things that matter: the number
 * printed inside the cell clears 4.5:1 against its own fill (each tier carries
 * the ink that does it), and the fill clears 3:1 against the app surface. The
 * number is always rendered too, so colour is reinforcement and never the only
 * channel carrying the value.
 */

export interface Tier {
  id: string;
  label: string;
  /** Lowest score in the band; bands are checked from the top down. */
  min: number;
  colour: string;
  /** Text colour that clears contrast on `colour`. */
  ink: string;
}

export const TIERS: Tier[] = [
  { id: 'banger',  label: 'Absolute Banger', min: 9.0, colour: '#3b9df0', ink: '#0b0b0b' },
  { id: 'heat',    label: 'Certified Heat',  min: 8.0, colour: '#12854a', ink: '#ffffff' },
  { id: 'rotation',label: 'Heavy Rotation',  min: 7.0, colour: '#2fbf5c', ink: '#0b0b0b' },
  { id: 'decent',  label: 'Decent',          min: 6.0, colour: '#e0c02b', ink: '#0b0b0b' },
  { id: 'mid',     label: 'Mid',             min: 5.0, colour: '#ef8f2e', ink: '#0b0b0b' },
  { id: 'skip',    label: 'Skip',            min: 3.0, colour: '#e04b46', ink: '#0b0b0b' },
  { id: 'garbage', label: 'Hot Garbage',     min: 0,   colour: '#a1734c', ink: '#0b0b0b' },
];

/** The band a score falls in, or null when a track has no score at all. */
export function tierFor(score: number | null | undefined): Tier | null {
  if (score == null || !Number.isFinite(score)) return null;
  return TIERS.find((t) => score >= t.min) ?? TIERS[TIERS.length - 1];
}
