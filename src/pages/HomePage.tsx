import { Link } from 'react-router-dom';
import './HomePage.css';

const EXAMPLES = [
  'Radiohead',
  'Kendrick Lamar',
  'Fleetwood Mac',
  'Björk',
  'The National',
  'Sufjan Stevens',
];

export default function HomePage() {
  return (
    <div className="home container">
      <section className="home-hero">
        <h1 className="home-title">
          Every track on the record, <span className="home-title-accent">plotted</span>.
        </h1>
        <p className="home-lede">
          musix graphs a whole discography track by track — the shape of a career the way
          an episode graph shows the shape of a series. Two lines, always: what the public
          thinks, and what musix members think.
        </p>

        <div className="home-examples">
          <span className="muted home-examples-label">Try</span>
          {EXAMPLES.map((name) => (
            <Link key={name} className="tag home-example" to={`/search?q=${encodeURIComponent(name)}`}>
              {name}
            </Link>
          ))}
        </div>
      </section>

      <section className="home-scores">
        <article className="card home-score-card">
          <div className="home-score-head">
            <span className="dot" style={{ background: 'var(--series-public)' }} />
            <h2>Public score</h2>
          </div>
          <p className="secondary">
            An aggregate of the public reception signals that are openly available:
            MusicBrainz community star ratings (real votes, per recording and per album),
            plus Deezer play-rank and Last.fm scrobbles mapped onto the same 0–10 scale.
          </p>
          <p className="muted home-score-note">
            No free API publishes per-track critic scores, so this is a composite of public
            opinion rather than a critics&rsquo; average. Every track shows exactly which
            signals fed its number and how much each one counted.
          </p>
        </article>

        <article className="card home-score-card">
          <div className="home-score-head">
            <span className="dot" style={{ background: 'var(--series-user)' }} />
            <h2>User score</h2>
          </div>
          <p className="secondary">
            The mean of musix members&rsquo; own 1–10 ratings. No weighting, no blending,
            no scraping — just what people here actually said.
          </p>
          <p className="muted home-score-note">
            Sign in, rate a track, and the orange line moves. Where the two lines diverge is
            usually the interesting part of a record.
          </p>
        </article>
      </section>

      <section className="home-sources">
        <h2 className="home-sources-title">Built from public data</h2>
        <ul className="home-sources-list">
          <li><strong>iTunes Search API</strong> — tracklists, artwork, 30-second previews</li>
          <li><strong>MusicBrainz</strong> — community ratings and release metadata</li>
          <li><strong>Cover Art Archive</strong> — album artwork</li>
          <li><strong>Deezer</strong> — track popularity rank</li>
          <li><strong>Last.fm</strong> — scrobble counts (optional)</li>
        </ul>
      </section>
    </div>
  );
}
