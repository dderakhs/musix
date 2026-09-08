/**
 * Run `worker` over `items` with bounded concurrency. Album hydration fans out
 * across several rate-limited upstreams, so an unbounded Promise.all would both
 * trip those limits and stall the first result behind the slowest one.
 */
export async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      try {
        await worker(item);
      } catch {
        // One album failing must not abort the rest of the discography.
      }
    }
  });
  await Promise.all(runners);
}
