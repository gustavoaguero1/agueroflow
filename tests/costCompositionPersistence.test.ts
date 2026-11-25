import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const service = readFileSync(new URL('../src/services/costCompositionService.ts', import.meta.url), 'utf8');
const view = readFileSync(new URL('../src/components/commercial/costComposition/CostCompositionModuleView.tsx', import.meta.url), 'utf8');
const editor = readFileSync(new URL('../src/components/commercial/costComposition/CostCompositionEditor.tsx', import.meta.url), 'utf8');

const serviceStart = service.indexOf('export const CostCompositionService = {');
const duplicateStart = service.indexOf('// Duplicate an existing composition with new revision', serviceStart);
const persistence = service.slice(serviceStart, duplicateStart);

test('commercial cost compositions use Firestore as the only persistent source', () => {
  assert.ok(serviceStart >= 0 && duplicateStart > serviceStart, 'CostCompositionService block must exist');
  assert.doesNotMatch(persistence, /localStorage|sessionStorage/);
  assert.doesNotMatch(persistence, /getDemoCostCompositions/);
  assert.match(persistence, /async listCompositions\(orgId: string\)/);
  assert.match(persistence, /async deleteComposition\(id: string, orgId: string\)/);
  assert.match(persistence, /await setDoc\(doc\(db, 'commercial_cost_compositions'/);
  assert.match(persistence, /await deleteDoc\(ref\)/);
});

test('Firestore failures are surfaced to users instead of being represented as successful local saves', () => {
  assert.match(view, /Falha ao consultar o Firestore/);
  assert.match(view, /Não foi possível salvar a composição no banco de dados/);
  assert.match(view, /Não foi possível excluir a composição no banco de dados/);
  assert.match(editor, /Nenhum salvamento local foi simulado/);
});
