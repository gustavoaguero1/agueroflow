import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSidebarCollapsed, writeSidebarCollapsed, SIDEBAR_KEY, isToggleSidebarShortcut } from '../src/components/layout/sidebarPref';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

test('barra lateral começa aberta quando nada foi salvo', () => {
  assert.equal(readSidebarCollapsed(mem()), false);
});

test('lembra que a barra lateral foi recolhida', () => {
  const s = mem();
  writeSidebarCollapsed(s, true);
  assert.equal(s.m.get(SIDEBAR_KEY), '1');
  assert.equal(readSidebarCollapsed(s), true);
  writeSidebarCollapsed(s, false);
  assert.equal(readSidebarCollapsed(s), false);
});

test('armazenamento indisponível não quebra a tela', () => {
  const broken = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };
  assert.equal(readSidebarCollapsed(broken), false);
  assert.doesNotThrow(() => writeSidebarCollapsed(broken, true));
  assert.equal(readSidebarCollapsed(null), false);
});

test('atalho Ctrl/⌘ + B recolhe e abre a barra', () => {
  assert.equal(isToggleSidebarShortcut({ key: 'b', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }), true);
  assert.equal(isToggleSidebarShortcut({ key: 'B', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false }), true);
  assert.equal(isToggleSidebarShortcut({ key: 'b', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }), false);
  assert.equal(isToggleSidebarShortcut({ key: 'b', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true }), false);
});
