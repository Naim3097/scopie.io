/**
 * Map with an upper bound: inserting past capacity evicts the oldest entry
 * (insertion order). Every in-memory store on a public, unauthenticated API
 * must be bounded — an attacker with a curl loop must not be able to OOM the
 * process.
 */
export class BoundedMap<K, V> extends Map<K, V> {
  constructor(private readonly maxSize: number) {
    super();
  }

  override set(key: K, value: V): this {
    if (!this.has(key) && this.size >= this.maxSize) {
      const oldest = this.keys().next().value;
      if (oldest !== undefined) this.delete(oldest);
    }
    return super.set(key, value);
  }
}
