/**
 * Depósitos por empresa. O servidor continua usando os mesmos nomes (uma lista, um objeto de
 * configuração, um Map), mas cada leitura/escrita vai para os dados da empresa do contexto
 * (`orgOf()`, ex.: a empresa do WhatsApp que recebeu a mensagem ou a da requisição).
 * Para gravar em disco, `all()` devolve tudo, com a empresa em cada registro.
 */

type WithOrg = { organizationId?: string };

/** Opções comuns: empresa do contexto, empresa padrão e como normalizar ids (ex.: effectiveOrg). */
interface ScopeOpts {
  orgOf: () => string;
  defaultOrg: string;
  /** Normaliza o id da empresa (id antigo → empresa real). Sem isso: vazio vira a padrão. */
  normalize?: (org?: string) => string;
}

/** Chave do balde: o mesmo id normalizado para dados, contexto e gravação. */
const keyOf = (o: ScopeOpts, org?: string): string => (o.normalize ? o.normalize(org || undefined) : org || o.defaultOrg);

/** Encaminha todas as operações do Proxy para o objeto atual (array, objeto ou Map). */
function forwarding<T extends object>(target: T, cur: () => T, bindMethods = false, onStore?: (p: PropertyKey, v: unknown) => void): T {
  return new Proxy(target, {
    get: (_t, p) => {
      const c = cur();
      const v = Reflect.get(c, p, c);
      return bindMethods && typeof v === 'function' ? v.bind(c) : v;
    },
    set: (_t, p, v) => {
      onStore?.(p, v);
      return Reflect.set(cur(), p, v);
    },
    has: (_t, p) => Reflect.has(cur(), p),
    deleteProperty: (_t, p) => Reflect.deleteProperty(cur(), p),
    ownKeys: () => Reflect.ownKeys(cur()),
    getOwnPropertyDescriptor: (_t, p) => Reflect.getOwnPropertyDescriptor(cur(), p),
    defineProperty: (_t, p, d) => Reflect.defineProperty(cur(), p, d),
  });
}

export function createOrgScopedArray<T extends object>(o: ScopeOpts & { initial: unknown }) {
  const byOrg = new Map<string, T[]>();
  const bucket = (org: string) => {
    let a = byOrg.get(org);
    if (!a) byOrg.set(org, (a = []));
    return a;
  };
  /** Todo registro guardado leva a empresa (assim a cópia na nuvem e as respostas da API também). */
  const stamp = (v: unknown, org: string) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) (v as WithOrg).organizationId = org;
  };
  for (const item of Array.isArray(o.initial) ? (o.initial as Array<T & WithOrg>) : []) {
    if (!item || typeof item !== 'object') continue;
    const org = keyOf(o, item.organizationId);
    stamp(item, org);
    bucket(org).push(item);
  }
  const cur = () => bucket(keyOf(o, o.orgOf()));
  const onStore = (p: PropertyKey, v: unknown) => {
    if (typeof p === 'string' && /^\d+$/.test(p)) stamp(v, keyOf(o, o.orgOf()));
  };
  return {
    view: forwarding([] as T[], cur, false, onStore),
    /** Troca a lista da empresa atual (substitui `lista = ...`). */
    set(arr: T[]) {
      const org = keyOf(o, o.orgOf());
      for (const v of arr) stamp(v, org);
      byOrg.set(org, arr);
    },
    all(): Array<T & { organizationId: string }> {
      return [...byOrg.entries()].flatMap(([org, arr]) => arr.map((x) => ({ ...x, organizationId: org })));
    },
    /** Os registros reais de todas as empresas (sem copiar): para quem precisa alterar em lote. */
    live(): T[] {
      return [...byOrg.values()].flat();
    },
    orgs: () => [...byOrg.keys()].filter((k) => (byOrg.get(k) || []).length > 0),
  };
}

export function createOrgScopedObject<T extends object>(
  o: ScopeOpts & {
    /** Padrões de uma empresa (a empresa padrão pode ter padrões diferentes das novas). */
    defaults: (org: string) => T;
    initial: unknown;
  },
) {
  const byOrg = new Map<string, T>();
  const init = o.initial as { __porEmpresa?: Record<string, T> } | T | null;
  if (init && typeof init === 'object' && '__porEmpresa' in init && init.__porEmpresa) {
    for (const [raw, cfg] of Object.entries(init.__porEmpresa)) {
      const org = keyOf(o, raw);
      byOrg.set(org, { ...o.defaults(org), ...(byOrg.get(org) || {}), ...cfg });
    }
  } else if (init && typeof init === 'object') {
    const org = keyOf(o, o.defaultOrg);
    byOrg.set(org, { ...o.defaults(org), ...(init as T) });
  }
  const cur = () => {
    const org = keyOf(o, o.orgOf());
    let c = byOrg.get(org);
    if (!c) byOrg.set(org, (c = o.defaults(org)));
    return c;
  };
  return {
    view: forwarding({} as T, cur),
    /** Troca a configuração da empresa atual (substitui `config = { ... }`). */
    set(obj: T) {
      byOrg.set(keyOf(o, o.orgOf()), { ...obj });
    },
    all: (): Record<string, T> => Object.fromEntries(byOrg),
    orgs: () => [...byOrg.keys()],
  };
}

export function createOrgScopedMap<V extends object>(o: ScopeOpts & { initial: Array<[string, V & WithOrg]> }) {
  const byOrg = new Map<string, Map<string, V>>();
  const bucket = (org: string) => {
    let m = byOrg.get(org);
    if (!m) byOrg.set(org, (m = new Map()));
    return m;
  };
  for (const [k, v] of o.initial || []) bucket(keyOf(o, v?.organizationId)).set(k, v);
  const cur = () => bucket(keyOf(o, o.orgOf()));
  return {
    view: forwarding(new Map<string, V>(), cur, true),
    all(): Array<[string, V & { organizationId: string }]> {
      return [...byOrg.entries()].flatMap(([org, m]) => [...m.entries()].map(([k, v]) => [k, { ...v, organizationId: org }] as [string, V & { organizationId: string }]));
    },
    orgs: () => [...byOrg.keys()].filter((k) => (byOrg.get(k)?.size || 0) > 0),
  };
}
