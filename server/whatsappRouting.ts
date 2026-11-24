/** Qual conexão de WhatsApp usar: a de quem chama, ou o número oficial da empresa. Funções puras. */
import { LEGACY_SESSION_KEY, sessionKeyForUser } from './whatsappSessions';

export function sessionForRequest(req: {
  user?: { uid?: string };
  orgId?: string;
}): { key: string; orgId: string; uid: string } | { error: string; status: number } {
  const uid = req.user?.uid;
  if (!uid) return { error: 'Entre no AgueroFlow para usar o WhatsApp.', status: 401 };
  if (!req.orgId) return { error: 'Selecione uma empresa para conectar o WhatsApp.', status: 400 };
  return { key: sessionKeyForUser(uid), orgId: req.orgId, uid };
}

/** Lista de marcas (ex.: sessões que viram um contato) sem repetir. */
export function addTag(list: string[] | undefined, tag: string | undefined): string[] {
  const out = [...(list || [])];
  if (tag && !out.includes(tag)) out.push(tag);
  return out;
}

/**
 * Remetente das automações da empresa (NDs, comandos, resumo semanal): o número oficial se estiver
 * conectado; senão outra conexão da mesma empresa (a sessão antiga primeiro, depois a mais antiga);
 * senão null.
 */
export function pickOrgSender(
  orgId: string,
  sessions: Array<{ key: string; orgId: string; connected: boolean; since?: number }>,
  officialKey?: string,
): string | null {
  const mine = sessions.filter((s) => s.orgId === orgId && s.connected);
  if (officialKey && mine.some((s) => s.key === officialKey)) return officialKey;
  const legacy = mine.find((s) => s.key === LEGACY_SESSION_KEY);
  if (legacy) return legacy.key;
  const oldest = [...mine].sort((a, b) => (a.since ?? 0) - (b.since ?? 0))[0];
  return oldest ? oldest.key : null;
}
