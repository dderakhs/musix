import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchCharts } from '../lib/api';
import type { ChartEntry } from '../lib/types';
import SearchBox from '../components/SearchBox';
import Rail from '../components/Rail';
import './HomePage.css';

const EXAMPLES = ['Drake', 'Juice WRLD', 'Kendrick Lamar', 'SZA', 'Radiohead', 'Tyler, The Creator'];

export default function HomePage() {
  const [charts, setCharts] = useState<{ songs: ChartEntry[]; albums: ChartEntry[] } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchCharts(100, controller.signal)
      .then((r) => {
        if (!controller.signal.aborted) setCharts(r);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCharts({ songs: [], albums: [] });
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

      <div className="container">
        <Rail
          title="Popular albums this week"
          subtitle="The most-played records right now"
          action={<Link className="btn railblock-more" to="/charts">See all</Link>}
        >
          {charts === null
            ? Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton chartskel" />)
            : charts.albums.slice(0, 30).map((a) => <ChartCard key={`al-${a.rank}`} entry={a} kind="album" />)}
        </Rail>

        <Rail
          title="Popular singles this week"
          subtitle="The most-played songs right now"
          action={<Link className="btn railblock-more" to="/charts?tab=songs">See all</Link>}
        >
          {charts === null
            ? Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton chartskel" />)
            : charts.songs.slice(0, 30).map((s) => <ChartCard key={`sg-${s.rank}`} entry={s} kind="song" />)}
        </Rail>
      </div>
    </div>
  );
}

export function ChartCard({ entry, kind }: { entry: ChartEntry; kind: 'album' | 'song' }) {
  const href =
    kind === 'album' && entry.itunesCollectionId
      ? `/album/${entry.itunesCollectionId}`
      : entry.itunesTrackId
        ? `/track/${entry.itunesTrackId}`
        : `/search?q=${encodeURIComponent(`${entry.artistName} ${entry.title}`)}`;

  return (
    <Link className="chartcard" to={href}>
      <span className="chartcard-art">
        {entry.artworkUrl && <img src={entry.artworkUrl} alt="" loading="lazy" />}
        <span className="chartcard-rank">{entry.rank}</span>
      </span>
      <span className="chartcard-title">{entry.title}</span>
      <span className="muted chartcard-artist">{entry.artistName}</span>
    </Link>
  );
}
