/**
 * Depósitos por empresa. O servidor continua usando os mesmos nomes (uma lista, um objeto de
 * configuração, um Map), mas cada leitura/escrita vai para os dados da empresa do contexto
 * (`orgOf()`, ex.: a empresa do WhatsApp que recebeu a mensagem ou a da requisição).
 * Para gravar em disco, `all()` devolve tudo, com a empresa em cada registro.
 */

type WithOrg = { organizationId?: string };

/** Encaminha todas as operações do Proxy para o objeto atual (array, objeto ou Map). */
function forwarding<T extends object>(target: T, cur: () => T, bindMethods = false): T {
  return new Proxy(target, {
    get: (_t, p) => {
      const c = cur();
      const v = Reflect.get(c, p, c);
      return bindMethods && typeof v === 'function' ? v.bind(c) : v;
    },
    set: (_t, p, v) => Reflect.set(cur(), p, v),
    has: (_t, p) => Reflect.has(cur(), p),
    deleteProperty: (_t, p) => Reflect.deleteProperty(cur(), p),
    ownKeys: () => Reflect.ownKeys(cur()),
    getOwnPropertyDescriptor: (_t, p) => Reflect.getOwnPropertyDescriptor(cur(), p),
    defineProperty: (_t, p, d) => Reflect.defineProperty(cur(), p, d),
  });
}

export function createOrgScopedArray<T extends object>(o: { orgOf: () => string; defaultOrg: string; initial: unknown }) {
  const byOrg = new Map<string, T[]>();
  const bucket = (org: string) => {
    let a = byOrg.get(org);
    if (!a) byOrg.set(org, (a = []));
    return a;
  };
  for (const item of Array.isArray(o.initial) ? (o.initial as Array<T & WithOrg>) : []) {
    if (item && typeof item === 'object') bucket(item.organizationId || o.defaultOrg).push(item);
  }
  const cur = () => bucket(o.orgOf() || o.defaultOrg);
  return {
    view: forwarding([] as T[], cur),
    /** Troca a lista da empresa atual (substitui `lista = ...`). */
    set(arr: T[]) {
      byOrg.set(o.orgOf() || o.defaultOrg, arr);
    },
    all(): Array<T & { organizationId: string }> {
      return [...byOrg.entries()].flatMap(([org, arr]) => arr.map((x) => ({ ...x, organizationId: org })));
    },
    orgs: () => [...byOrg.keys()].filter((k) => (byOrg.get(k) || []).length > 0),
  };
}

export function createOrgScopedObject<T extends object>(o: {
  orgOf: () => string;
  defaultOrg: string;
  defaults: () => T;
  initial: unknown;
}) {
  const byOrg = new Map<string, T>();
  const init = o.initial as { __porEmpresa?: Record<string, T> } | T | null;
  if (init && typeof init === 'object' && '__porEmpresa' in init && init.__porEmpresa) {
    for (const [org, cfg] of Object.entries(init.__porEmpresa)) byOrg.set(org, { ...o.defaults(), ...cfg });
  } else if (init && typeof init === 'object') {
    byOrg.set(o.defaultOrg, { ...o.defaults(), ...(init as T) });
  }
  const cur = () => {
    const org = o.orgOf() || o.defaultOrg;
    let c = byOrg.get(org);
    if (!c) byOrg.set(org, (c = o.defaults()));
    return c;
  };
  return {
    view: forwarding({} as T, cur),
    /** Troca a configuração da empresa atual (substitui `config = { ... }`). */
    set(obj: T) {
      byOrg.set(o.orgOf() || o.defaultOrg, { ...obj });
    },
    all: (): Record<string, T> => Object.fromEntries(byOrg),
    orgs: () => [...byOrg.keys()],
  };
}

export function createOrgScopedMap<V extends object>(o: {
  orgOf: () => string;
  defaultOrg: string;
  initial: Array<[string, V & WithOrg]>;
}) {
  const byOrg = new Map<string, Map<string, V>>();
  const bucket = (org: string) => {
    let m = byOrg.get(org);
    if (!m) byOrg.set(org, (m = new Map()));
    return m;
  };
  for (const [k, v] of o.initial || []) bucket(v?.organizationId || o.defaultOrg).set(k, v);
  const cur = () => bucket(o.orgOf() || o.defaultOrg);
  return {
    view: forwarding(new Map<string, V>(), cur, true),
    all(): Array<[string, V & { organizationId: string }]> {
      return [...byOrg.entries()].flatMap(([org, m]) => [...m.entries()].map(([k, v]) => [k, { ...v, organizationId: org }] as [string, V & { organizationId: string }]));
    },
    orgs: () => [...byOrg.keys()].filter((k) => (byOrg.get(k)?.size || 0) > 0),
  };
}
