import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchCharts } from '../lib/api';
import type { ChartEntry } from '../lib/types';
import { ChartCard } from './HomePage';
import './ChartsPage.css';

type Tab = 'albums' | 'songs';

export default function ChartsPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'songs' ? 'songs' : 'albums';
  const [charts, setCharts] = useState<{ songs: ChartEntry[]; albums: ChartEntry[] } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchCharts(200, controller.signal)
      .then((r) => {
        if (!controller.signal.aborted) setCharts(r);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCharts({ songs: [], albums: [] });
      });
    return () => controller.abort();
  }, []);

  const entries = charts ? (tab === 'albums' ? charts.albums : charts.songs) : [];

  return (
    <div className="container charts-page">
      <header className="charts-head">
        <div>
          <h1 className="charts-title">Charts</h1>
          <p className="muted charts-sub">
            The most-played {tab === 'albums' ? 'albums' : 'songs'} right now, from Apple&rsquo;s
            official chart feed.
          </p>
        </div>
        <div className="charts-tabs" role="tablist">
          {(['albums', 'songs'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className="btn"
              onClick={() => setParams(t === 'albums' ? {} : { tab: t })}
            >
              {t === 'albums' ? 'Albums' : 'Songs'}
            </button>
          ))}
        </div>
      </header>

      {charts === null ? (
        <div className="charts-grid">
          {Array.from({ length: 18 }, (_, i) => (
            <div key={i} className="skeleton chartskel" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="muted">The chart is unavailable right now.</p>
      ) : (
        <div className="charts-grid">
          {entries.map((e) => (
            <ChartCard key={`${tab}-${e.rank}`} entry={e} kind={tab === 'albums' ? 'album' : 'song'} />
          ))}
        </div>
      )}
    </div>
  );
}
