/**
 * Run `worker` over `items` with bounded concurrency, stopping early once
 * `deadline` passes. The per-track enrichment sources are rate limited and a
 * serverless invocation has a hard timeout, so an unbounded fan-out would both
 * trip those limits and risk the whole request dying with nothing to show.
 */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  deadline: number,
  worker: (item: T) => Promise<R | null>,
): Promise<Map<T, R>> {
  const results = new Map<T, R>();
  let cursor = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      if (Date.now() > deadline) return;
      try {
        const value = await worker(item);
        if (value !== null) results.set(item, value);
      } catch {
        // One track failing must not lose the rest of the album.
      }
    }
  });

  await Promise.all(runners);
  return results;
}
