import { TIERS } from '../lib/tiers';
import './AboutPage.css';

export default function AboutPage() {
  return (
    <div className="container about-page">
      <h1 className="about-title">About musix</h1>
      <p className="about-lede">
        musix plots a discography the way an episode graph plots a TV series. Every track gets
        a score out of ten and a colour, so a great run, a weak stretch or a front-loaded album
        is visible before you read a single number.
      </p>

      <section className="about-section">
        <h2 className="about-h2">Two scores</h2>
        <p>
          The <strong>public score</strong> is what the world thinks, and it leads everywhere by
          default. The <strong>user score</strong> is the plain average of what musix members
          have rated — no weighting, no blending. Switch between them from the control in the
          header.
        </p>
      </section>

      <section className="about-section">
        <h2 className="about-h2">Where the public score comes from</h2>
        <p>
          It combines how well a track is <em>rated</em> with how much attention it actually
          commands.
        </p>
        <ul className="about-list">
          <li><strong>MusicBrainz</strong> — community star ratings and vote counts, weighted by how many people voted.</li>
          <li><strong>Spotify</strong> — the popularity index each track carries, normalised across the whole catalogue; the heaviest single input.</li>
          <li><strong>Genius</strong> — lyrics pageviews, the sharpest per-track measure of attention available.</li>
          <li><strong>Deezer</strong> — listener rank, judged against the artist&rsquo;s own catalogue peak so an older record is not marked down simply for being old, plus the fan counts that order artist search.</li>
          <li><strong>Last.fm</strong> — scrobble counts.</li>
          <li><strong>Reddit</strong> — how much a track is actually discussed.</li>
          <li><strong>Sales certifications</strong> — gold through diamond, the one audited measure of scale in the model.</li>
          <li><strong>iTunes Search API</strong> and the <strong>Cover Art Archive</strong> — tracklists, artwork and previews.</li>
        </ul>
        <p>
          Attention counts for roughly twice as much as votes. Star ratings are sparse and skew
          towards older, canonical records, so on anything recent they are close to silent —
          while a song everyone is playing and arguing about is unambiguous. The attention
          signals are combined so that the strongest evidence leads, because each source is
          blind to a different slice: Last.fm badly under-counts recent rap, Genius has nothing
          for instrumentals, Reddit misses non-English music.
        </p>
        <p className="muted">
          No free API publishes per-track critic scores, so this measures public reception
          rather than a critics&rsquo; average. Open any track to see exactly which signals fed
          its number and how much each one counted. Only counts, artwork and credits are read
          from Genius — never lyrics.
        </p>
      </section>

      <section className="about-section">
        <h2 className="about-h2">The scale</h2>
        <div className="about-tiers">
          {TIERS.map((tier) => (
            <div key={tier.id} className="about-tier">
              <span className="about-tierchip" style={{ background: tier.colour, color: tier.ink }}>
                {tier.min === 0 ? '< 3' : `${tier.min.toFixed(0)}+`}
              </span>
              <span className="about-tiername">{tier.label}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
