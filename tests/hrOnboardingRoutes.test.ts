import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createHrOnboardingRouter } from '../server/hrOnboardingRoutes';
import type { AdminHandles } from '../server/firebaseAdmin';

function createFakeAdmin() {
  const docs = new Map<string, Record<string, any>>();
  const bucketFiles = new Map<string, { data: Buffer; contentType?: string }>();

  const makeDocRef = (col: string, id: string) => ({
    id,
    async get() {
      const key = `${col}/${id}`;
      const val = docs.get(key);
      return { id, exists: val !== undefined, data: () => (val ? { ...val } : undefined), ref: makeDocRef(col, id) };
    },
    async set(data: Record<string, any>, opts?: { merge?: boolean }) {
      const key = `${col}/${id}`;
      const prev = opts?.merge ? docs.get(key) || {} : {};
      docs.set(key, { ...prev, ...data });
    },
    async delete() {
      docs.delete(`${col}/${id}`);
    },
  });

  const makeQuery = (col: string, filters: Array<{ field: string; value: unknown }>, lim?: number) => ({
    where(field: string, _op: string, value: unknown) {
      return makeQuery(col, [...filters, { field, value }], lim);
    },
    limit(n: number) {
      return makeQuery(col, filters, n);
    },
    async get() {
      const matched = [...docs.entries()]
        .filter(([k]) => k.startsWith(`${col}/`))
        .map(([k, v]) => ({ id: k.slice(col.length + 1), data: v }))
        .filter((item) => filters.every((f) => item.data[f.field] === f.value));
      const sliced = lim !== undefined ? matched.slice(0, lim) : matched;
      const snapDocs = sliced.map((item) => ({
        id: item.id,
        exists: true,
        data: () => ({ ...item.data }),
        ref: makeDocRef(col, item.id),
      }));
      return { empty: snapDocs.length === 0, docs: snapDocs };
    },
  });

  const handles = {
    db: {
      collection(col: string) {
        return {
          doc: (id: string) => makeDocRef(col, id),
          where: (field: string, op: string, value: unknown) => makeQuery(col, [{ field, value }]),
          get: () => makeQuery(col, []).get(),
        };
      },
    },
    bucket: {
      file(name: string) {
        return {
          async save(buf: Buffer, opts?: { contentType?: string }) {
            bucketFiles.set(name, { data: Buffer.from(buf), contentType: opts?.contentType });
          },
          async download() {
            const entry = bucketFiles.get(name);
            if (!entry) throw new Error('ENOENT');
            return [entry.data];
          },
          async delete() {
            bucketFiles.delete(name);
          },
        };
      },
    },
  } as unknown as AdminHandles;

  return { docs, bucketFiles, handles };
}

async function startTestApp(handles: AdminHandles, userRef: { current: any }) {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use((req, _res, next) => {
    if (userRef.current) (req as any).user = userRef.current;
    next();
  });
  app.use('/api/hr/onboarding', createHrOnboardingRouter({ getAdminHandles: () => handles }));
  const server = app.listen(0);
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}/api/hr/onboarding`;
  return { base, close: () => new Promise<void>((r) => server.close(() => r())) };
}

test('fluxo completo de admissão persiste em Firestore + Storage privado sem gravar JSON local', async () => {
  const { docs, bucketFiles, handles } = createFakeAdmin();
  docs.set('organizations/org_a', { name: 'Metalúrgica Alfa Ltda' });
  const userRef: { current: any } = {
    current: { uid: 'u_rh_a', email: 'rh@alfa.test', master: false, orgs: { org_a: 'Admin' } },
  };
  const srv = await startTestApp(handles, userRef);

  try {
    // 1. RH generates link
    const genRes = await fetch(`${srv.base}/generate-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: 'org_a',
        targetRole: 'Caldeireiro',
        targetDepartment: 'Montagem',
      }),
    });
    assert.equal(genRes.status, 200);
    const genBody = (await genRes.json()) as any;
    assert.equal(genBody.success, true);
    const { id, token } = genBody.onboarding;
    assert.ok(docs.has(`hr_onboardings/${id}`));

    // 2. Public candidate checks token and gets real organization name (never hardcoded)
    userRef.current = null;
    const chkRes = await fetch(`${srv.base}/check/${encodeURIComponent(token)}`);
    assert.equal(chkRes.status, 200);
    const chkBody = (await chkRes.json()) as any;
    assert.equal(chkBody.status, 'valid');
    assert.equal(chkBody.data.companyName, 'Metalúrgica Alfa Ltda');

    // 3. Public candidate submits data with PNG attachment
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const subRes = await fetch(`${srv.base}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        submittedData: {
          fullName: 'Carlos Silva',
          cpf: '123.456.789-00',
          rgNumber: '12.345.678-9',
          acceptedLgpd: true,
          documents: {
            rgFront: {
              fileName: 'rg frente.png',
              mimeType: 'image/png',
              dataBase64: `data:image/png;base64,${pngBytes.toString('base64')}`,
              uploadedAt: new Date().toISOString(),
            },
          },
        },
      }),
    });
    assert.equal(subRes.status, 200);

    // Verify Firestore stores storagePath instead of raw base64
    const stored = docs.get(`hr_onboardings/${id}`)!;
    assert.equal(stored.status, 'submitted');
    assert.equal(stored.submittedData.documents.rgFront.dataBase64, undefined);
    const storagePath = stored.submittedData.documents.rgFront.storagePath as string;
    assert.ok(storagePath.startsWith(`hr-onboardings/org_a/${id}/rgFront_`));
    assert.equal(bucketFiles.has(storagePath), true);

    // 4. Cross-org user is denied downloading the candidate's document
    userRef.current = { uid: 'u_rh_b', email: 'rh@beta.test', master: false, orgs: { org_b: 'Admin' } };
    const crossDocRes = await fetch(`${srv.base}/${encodeURIComponent(id)}/document/rgFront?orgId=org_b`);
    assert.equal(crossDocRes.status, 403);

    // 5. Same-org RH downloads the document cleanly
    userRef.current = { uid: 'u_rh_a', email: 'rh@alfa.test', master: false, orgs: { org_a: 'Admin' } };
    const ownDocRes = await fetch(`${srv.base}/${encodeURIComponent(id)}/document/rgFront?orgId=org_a`);
    assert.equal(ownDocRes.status, 200);
    const ownDocBody = (await ownDocRes.json()) as any;
    assert.equal(ownDocBody.mimeType, 'image/png');
    assert.ok(ownDocBody.dataBase64.startsWith('data:image/png;base64,'));

    // 6. Deleting onboarding removes both Firestore doc and Storage object
    const delRes = await fetch(`${srv.base}/${encodeURIComponent(id)}?orgId=org_a`, { method: 'DELETE' });
    assert.equal(delRes.status, 200);
    assert.equal(docs.has(`hr_onboardings/${id}`), false);
    assert.equal(bucketFiles.has(storagePath), false);
  } finally {
    await srv.close();
  }
});

test('submit rejeita tipo MIME perigoso e usuário sem área RH não lista admissões', async () => {
  const { docs, handles } = createFakeAdmin();
  const userRef: { current: any } = {
    current: { uid: 'u_ops', email: 'ops@alfa.test', master: false, orgs: { org_a: 'Operacional' } },
  };
  const srv = await startTestApp(handles, userRef);

  try {
    const listRes = await fetch(`${srv.base}/list?orgId=org_a`);
    assert.equal(listRes.status, 403);

    docs.set('hr_onboardings/onb_1', {
      id: 'onb_1',
      token: 'tok_1',
      orgId: 'org_a',
      organizationId: 'org_a',
      status: 'pending',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    userRef.current = null;
    const badMime = await fetch(`${srv.base}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'tok_1',
        submittedData: {
          fullName: 'Teste',
          cpf: '000.000.000-00',
          rgNumber: '111',
          acceptedLgpd: true,
          documents: {
            otherDoc: {
              fileName: 'evil.html',
              mimeType: 'text/html',
              dataBase64: `data:text/html;base64,${Buffer.from('<script>alert(1)</script>').toString('base64')}`,
            },
          },
        },
      }),
    });
    assert.equal(badMime.status, 400);
  } finally {
    await srv.close();
  }
});
