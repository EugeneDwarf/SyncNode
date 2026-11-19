/**
 * Zero-dependency asynchronous pool (worker pool) runner.
 * Runs up to `limit` asynchronous tasks concurrently over the input items.
 */
export async function asyncPool<T, R>(
  limit: number,
  items: T[],
  iteratorFn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: Promise<R>[] = [];
  const executing: Set<Promise<any>> = new Set();

  for (const item of items) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    results.push(p);
    executing.add(p);

    const clean = () => executing.delete(p);
    p.then(clean, clean);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}
