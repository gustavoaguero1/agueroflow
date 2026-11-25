/** Preferência "barra lateral recolhida" (só desktop), lembrada no navegador. */
export const SIDEBAR_KEY = 'agueroflow.sidebarCollapsed';

type Store = Pick<Storage, 'getItem' | 'setItem'> | null | undefined;

export function readSidebarCollapsed(store: Store): boolean {
  try {
    return store?.getItem(SIDEBAR_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(store: Store, collapsed: boolean): void {
  try {
    store?.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
  } catch {
    /* navegador sem armazenamento: vale só nesta aba */
  }
}

type KeyLike = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>;

/** Ctrl+B (Windows) ou ⌘B (Mac). */
export function isToggleSidebarShortcut(e: KeyLike): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'b';
}
