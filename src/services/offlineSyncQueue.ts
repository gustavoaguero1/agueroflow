export type OfflineMutationStatus = 'pendente' | 'sincronizado' | 'conflito' | 'rejeitado';

export interface OfflineMutationItem {
  id: string;
  idempotencyKey: string;
  orgId: string;
  entityType: 'work_order_event' | 'checklist_answer' | 'rdo_entry' | 'inspection_note';
  entityId: string;
  expectedVersion?: string;
  payload: Record<string, unknown>;
  status: OfflineMutationStatus;
  attempts: number;
  createdAt: string;
  lastAttemptAt?: string;
  errorReason?: string;
}

export function enqueueOfflineMutation(
  queue: readonly OfflineMutationItem[],
  incoming: Omit<OfflineMutationItem, 'status' | 'attempts'>,
): OfflineMutationItem[] {
  // Idempotent enqueue: duplicate idempotencyKey never creates a second mutation
  if (queue.some((item) => item.idempotencyKey === incoming.idempotencyKey && item.orgId === incoming.orgId)) {
    return [...queue];
  }
  return [
    ...queue,
    {
      ...incoming,
      status: 'pendente',
      attempts: 0,
    },
  ];
}

export function reconcileServerSyncResult(params: {
  item: OfflineMutationItem;
  serverStatus: number;
  serverVersion?: string;
  errorMessage?: string;
  nowIso?: string;
}): OfflineMutationItem {
  const now = params.nowIso || new Date().toISOString();
  const nextAttempts = params.item.attempts + 1;

  if (params.serverStatus >= 200 && params.serverStatus < 300) {
    return {
      ...params.item,
      status: 'sincronizado',
      attempts: nextAttempts,
      lastAttemptAt: now,
      errorReason: undefined,
    };
  }
  if (params.serverStatus === 409) {
    return {
      ...params.item,
      status: 'conflito',
      attempts: nextAttempts,
      lastAttemptAt: now,
      errorReason:
        params.errorMessage ||
        `Conflito de versão detectado no servidor (versão atual: ${params.serverVersion || 'alterada'}). Requer revisão humana.`,
    };
  }
  if (params.serverStatus === 400 || params.serverStatus === 403 || params.serverStatus === 422) {
    return {
      ...params.item,
      status: 'rejeitado',
      attempts: nextAttempts,
      lastAttemptAt: now,
      errorReason: params.errorMessage || 'Operação rejeitada pelas regras do servidor.',
    };
  }
  // Transient network/5xx -> stays pending for safe idempotent retry
  return {
    ...params.item,
    status: 'pendente',
    attempts: nextAttempts,
    lastAttemptAt: now,
    errorReason: params.errorMessage || 'Falha temporária de rede. Tentativa pendente.',
  };
}
