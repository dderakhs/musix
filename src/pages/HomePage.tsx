import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchCharts } from '../lib/api';
import type { ChartEntry } from '../lib/types';
import { TIERS } from '../lib/tiers';
import SearchBox from '../components/SearchBox';
import './HomePage.css';

const EXAMPLES = ['Drake', 'Kendrick Lamar', 'Radiohead', 'SZA', 'Fleetwood Mac', 'Tyler, The Creator'];

export default function HomePage() {
  const [chart, setChart] = useState<ChartEntry[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchCharts(controller.signal)
      .then((r) => {
        if (!controller.signal.aborted) setChart(r.songs);
      })
      .catch(() => {
        if (!controller.signal.aborted) setChart([]);
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="home">
      <section className="home-hero container">
        <h1 className="home-title">
          Every track on the record, <span className="home-title-accent">graphed</span>.
        </h1>
        <p className="home-lede">
          Search an artist and see their whole discography scored track by track — the shape
          of a career in one glance.
        </p>

        <div className="home-search">
          <SearchBox size="hero" placeholder="Search an artist, album or song…" />
        </div>

        <div className="home-examples">
          <span className="muted home-examples-label">Try</span>
          {EXAMPLES.map((name) => (
            <Link key={name} className="tag home-example" to={`/search?q=${encodeURIComponent(name)}`}>
              {name}
            </Link>
          ))}
        </div>
      </section>

      <section className="container home-section">
        <div className="home-sectionhead">
          <h2 className="home-sectiontitle">Popular right now</h2>
          <p className="muted home-sectionsub">The most-played songs today</p>
        </div>

        {chart === null ? (
          <div className="rail">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="skeleton home-chartskel" />
            ))}
          </div>
        ) : chart.length === 0 ? (
          <p className="muted">The chart is unavailable right now.</p>
        ) : (
          <div className="rail">
            {chart.slice(0, 40).map((song) => (
              <Link
                key={`${song.rank}-${song.itunesTrackId}`}
                className="chartcard"
                to={song.itunesTrackId ? `/track/${song.itunesTrackId}` : `/search?q=${encodeURIComponent(`${song.artistName} ${song.title}`)}`}
              >
                <span className="chartcard-art">
                  {song.artworkUrl && <img src={song.artworkUrl} alt="" loading="lazy" />}
                  <span className="chartcard-rank">{song.rank}</span>
                </span>
                <span className="chartcard-title">{song.title}</span>
                <span className="muted chartcard-artist">{song.artistName}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="container home-section home-about" id="about">
        <div className="home-sectionhead">
          <h2 className="home-sectiontitle">About musix</h2>
        </div>

        <div className="home-aboutgrid">
          <div className="home-aboutcol">
            <p>
              musix plots a discography the way an episode graph plots a TV series. Every
              track gets a score out of ten and a colour, so a great run, a weak stretch or a
              front-loaded album is visible before you read a single number.
            </p>
            <p>
              There are two scores. The <strong>public score</strong> is what the world thinks,
              and it leads everywhere by default. The <strong>user score</strong> is the plain
              average of what musix members have rated — no weighting, no blending. You can
              switch between them from the control in the header.
            </p>
          </div>

          <div className="home-aboutcol">
            <h3 className="home-abouth3">Where the public score comes from</h3>
            <p>
              It combines how well a track is <em>rated</em> with how much attention it
              actually commands. Community star ratings and vote counts come from
              MusicBrainz. Attention is measured from Genius lyrics pageviews, Deezer
              listener rank, Last.fm scrobbles and Reddit discussion volume. Tracklists,
              artwork and previews come from the iTunes Search API and the Cover Art Archive.
            </p>
            <p>
              Attention counts for roughly twice as much as votes. Star ratings are sparse and
              skew towards older, canonical records, so on anything recent they are close to
              silent — while a song everyone is playing and arguing about is unambiguous. Open
              any track to see exactly which signals fed its number and how much each counted.
            </p>
            <p className="muted home-aboutnote">
              No free API publishes per-track critic scores, so this is a measure of public
              reception rather than a critics&rsquo; average.
            </p>
          </div>
        </div>

        <div className="home-tiers">
          <h3 className="home-abouth3">The scale</h3>
          <div className="home-tierrow">
            {TIERS.map((tier) => (
              <span key={tier.id} className="home-tier">
                <span
                  className="home-tierchip"
                  style={{ background: tier.colour, color: tier.ink }}
                >
                  {tier.min === 0 ? '<3' : `${tier.min.toFixed(0)}+`}
                </span>
                {tier.label}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
