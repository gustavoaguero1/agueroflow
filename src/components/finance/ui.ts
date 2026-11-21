// Shared Tailwind classes for the finance screens (same dark palette as StockModule).
export const card = 'bg-[#121826] border border-slate-800 rounded-xl p-4';
export const input = 'w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-blue-500';
export const label = 'block text-[11px] font-semibold text-slate-400 mb-1';
export const btn = 'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
export const btnPrimary = `${btn} bg-blue-600 hover:bg-blue-500 text-white`;
export const btnGhost = `${btn} bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700`;
export const msgOk = 'text-xs rounded-lg px-3 py-2 bg-emerald-950/60 text-emerald-300 border border-emerald-800/50';
export const msgErr = 'text-xs rounded-lg px-3 py-2 bg-red-950/60 text-red-300 border border-red-800/50';
export const fmtDate = (iso?: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
export const today = () => new Date().toLocaleDateString('sv-SE'); // local YYYY-MM-DD
