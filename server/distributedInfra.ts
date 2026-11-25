import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AdminHandles } from './firebaseAdmin.ts';

export interface StructuredLogPayload {
  level: 'info' | 'warn' | 'error';
  event: string;
  correlationId?: string;
  orgId?: string;
  durationMs?: number;
  detail?: Record<string, unknown>;
}

export function logStructured(payload: StructuredLogPayload): void {
  const entry = {
    ts: new Date().toISOString(),
    ...payload,
  };
  if (payload.level === 'error') console.error(JSON.stringify(entry));
  else if (payload.level === 'warn') console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

/** Attaches a stable correlation ID to every request & response header for structured observability. */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = typeof req.headers['x-correlation-id'] === 'string' ? req.headers['x-correlation-id'].trim() : '';
  const cid = incoming && incoming.length <= 128 ? incoming : crypto.randomUUID();
  (req as any).correlationId = cid;
  res.setHeader('x-correlation-id', cid);
  next();
}

/**
 * Firestore-backed distributed lock preventing concurrent execution of scheduled jobs
 * across multiple server instances.
 */
export async function acquireDistributedLock(params: {
  admin: AdminHandles;
  lockKey: string;
  ownerId: string;
  ttlMs: number;
}): Promise<boolean> {
  const ref = params.admin.db.collection('job_locks').doc(params.lockKey.replace(/[^A-Za-z0-9_-]/g, '_'));
  const nowMs = Date.now();
  const expiresAtMs = nowMs + Math.max(1000, params.ttlMs);

  return params.admin.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const data = snap.data() as { ownerId?: string; expiresAtMs?: number };
      if ((data.expiresAtMs || 0) > nowMs && data.ownerId !== params.ownerId) {
        return false;
      }
    }
    tx.set(ref, {
      lockKey: params.lockKey,
      ownerId: params.ownerId,
      acquiredAt: new Date(nowMs).toISOString(),
      expiresAtMs,
    });
    return true;
  });
}

export async function releaseDistributedLock(admin: AdminHandles, lockKey: string, ownerId: string): Promise<void> {
  const ref = admin.db.collection('job_locks').doc(lockKey.replace(/[^A-Za-z0-9_-]/g, '_'));
  await admin.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data()?.ownerId === ownerId) {
      tx.delete(ref);
    }
  });
}

export interface DurableJobRecord {
  id: string;
  orgId: string;
  jobType: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  status: 'queued' | 'running' | 'completed' | 'dead_letter';
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export async function enqueueDurableJob(params: {
  admin: AdminHandles;
  orgId: string;
  jobType: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  maxAttempts?: number;
}): Promise<{ replayed: boolean; job: DurableJobRecord }> {
  const docId = `djob_${params.orgId}_${params.idempotencyKey}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 180);
  const ref = params.admin.db.collection('durable_jobs').doc(docId);
  return params.admin.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      return { replayed: true, job: snap.data() as DurableJobRecord };
    }
    const now = new Date().toISOString();
    const job: DurableJobRecord = {
      id: docId,
      orgId: params.orgId,
      jobType: params.jobType,
      idempotencyKey: params.idempotencyKey,
      payload: params.payload,
      status: 'queued',
      attempts: 0,
      maxAttempts: Math.max(1, params.maxAttempts ?? 5),
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    };
    tx.create(ref, job);
    return { replayed: false, job };
  });
}

export function computeNextRetryIso(attempts: number, nowMs = Date.now()): string {
  // Exponential backoff capped at 30 minutes
  const delayMs = Math.min(30 * 60 * 1000, Math.pow(2, Math.max(0, attempts)) * 5000);
  return new Date(nowMs + delayMs).toISOString();
}
