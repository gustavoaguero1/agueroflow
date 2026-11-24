/**
 * Coleção "virtual": junta duas fontes ao vivo (ex.: rh_employees + complemento de Operações) e
 * entrega para a página no mesmo formato de snapshot que ela já usa ({ docs: [{ id, data() }] }).
 */
type Unsub = () => void;
type Source<T> = (next: (rows: T[]) => void, err?: (e: unknown) => void) => Unsub;

export function createVirtualCollection<A, B>(opts: {
  subscribeA: Source<A>;
  subscribeB: Source<B>;
  join: (a: A[], b: B[]) => Array<{ id: string } & Record<string, unknown>>;
}) {
  return {
    onSnapshot(next: (s: { docs: Array<{ id: string; exists: boolean; data: () => unknown }>; size: number; empty: boolean }) => void, err?: (e: unknown) => void): Unsub {
      let a: A[] | null = null;
      let b: B[] | null = null;
      const emit = () => {
        if (a === null || b === null) return;
        const rows = opts.join(a, b);
        next({ docs: rows.map((r) => ({ id: r.id, exists: true, data: () => r })), size: rows.length, empty: rows.length === 0 });
      };
      const ua = opts.subscribeA((rows) => { a = rows; emit(); }, err);
      const ub = opts.subscribeB((rows) => { b = rows; emit(); }, err);
      return () => { ua(); ub(); };
    },
  };
}
