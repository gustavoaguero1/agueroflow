// Rotas do RH para o ponto (Task 7).
import type { Router, Request, Response, RequestHandler } from 'express';
import type { PontoStore } from './store.ts';

export interface RhRouteCtx {
  getStore: () => PontoStore | null;
  now: () => Date;
  wrap: (fn: (req: Request, res: Response, store: PontoStore) => Promise<unknown>) => RequestHandler;
}

export function registerRhRoutes(_r: Router, _ctx: RhRouteCtx): void {
  // preenchido na Task 7
}
