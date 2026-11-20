import React, { useState, useEffect } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';

interface BrowserSecurityCheckProps {
  onVerified: () => void;
}

export const BrowserSecurityCheck: React.FC<BrowserSecurityCheckProps> = ({ onVerified }) => {
  // States: 'checking' | 'verifying' | 'success' | 'fading'
  const [status, setStatus] = useState<'checking' | 'verifying' | 'success' | 'fading'>('checking');
  const [rayId, setRayId] = useState('');

  useEffect(() => {
    // Generate pseudo Ray ID
    const randomHex = Math.random().toString(36).substring(2, 10).toUpperCase() + Math.random().toString(36).substring(2, 10).toUpperCase();
    setRayId(randomHex);

    // Progression:
    // 1. Initial browser checking (700ms)
    const t1 = setTimeout(() => {
      setStatus('verifying');
    }, 700);

    // 2. Verified as human with HTTPS SSL (2100ms)
    const t2 = setTimeout(() => {
      setStatus('success');
    }, 2200);

    // 3. Smooth transition to unlock site (2900ms)
    const t3 = setTimeout(() => {
      setStatus('fading');
    }, 2900);

    // 4. Complete
    const t4 = setTimeout(() => {
      onVerified();
    }, 3300);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [onVerified]);

  const handleManualClick = () => {
    if (status === 'checking' || status === 'verifying') {
      setStatus('success');
      setTimeout(() => setStatus('fading'), 600);
      setTimeout(() => onVerified(), 1000);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center px-4 bg-[#0B0C16] text-white transition-opacity duration-500 ${
        status === 'fading' ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}
    >
      <div className="w-full max-w-md mx-auto flex flex-col items-center text-center">
        {/* Top Circular Emblem matching user reference */}
        <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center mb-8 shadow-lg shadow-black/40">
          <svg
            viewBox="0 0 100 100"
            className="w-12 h-12 text-[#0B0C16] fill-current"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Speed aerodynamic emblem similar to bullet train / fast flow */}
            <path d="M18 36h60c4 0 7 3 7 7s-3 7-7 7H18c-2 0-3-1-3-3 0-6 4-11 10-11z" />
            <path d="M12 56h56c3 0 5 2 5 5s-2 5-5 5H12c-2 0-3-1-3-3 0-4 1-7 3-7z" />
            <path d="M24 72h36c2 0 4 2 4 4s-2 4-4 4H24c-2 0-3-1-3-2 0-3 1-6 3-6z" />
            <circle cx="68" cy="43" r="3.5" fill="#0B0C16" />
          </svg>
        </div>

        {/* Main Heading */}
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-3">
          Checking your browser
        </h1>

        {/* Subtitle */}
        <p className="text-slate-400 text-xs sm:text-sm max-w-sm leading-relaxed mb-8">
          This site is experiencing heavy traffic. Please complete the check below to continue.
        </p>

        {/* Verification Box matching Cloudflare / Turnstile style */}
        <div
          onClick={handleManualClick}
          className="w-full max-w-[320px] bg-[#222222] hover:bg-[#282828] border border-[#555555] rounded-md py-4 px-5 flex items-center justify-start space-x-3 transition-colors cursor-pointer select-none shadow-md"
        >
          {status === 'success' || status === 'fading' ? (
            <div className="flex items-center space-x-3">
              <div className="w-6 h-6 rounded-full bg-[#22C55E] flex items-center justify-center text-white shadow-sm shrink-0">
                <svg className="w-4 h-4 stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-white">Sucesso!</span>
            </div>
          ) : (
            <div className="flex items-center space-x-3">
              <div className="w-5 h-5 rounded border border-slate-500 bg-slate-900/80 flex items-center justify-center shrink-0">
                <div className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              </div>
              <span className="text-xs text-slate-300 font-medium">Verificando se você é humano...</span>
            </div>
          )}
        </div>

        {/* Status text below box */}
        <div className="mt-4 flex items-center space-x-2 text-xs text-slate-500 font-medium tracking-wide">
          {status === 'success' || status === 'fading' ? (
            <span className="text-emerald-400 flex items-center space-x-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Verificado com sucesso</span>
            </span>
          ) : (
            <span className="animate-pulse">Verifying...</span>
          )}
        </div>

        {/* HTTPS / Security details footer */}
        <div className="mt-12 pt-6 border-t border-slate-900/80 w-full flex flex-col items-center text-[11px] text-slate-500 space-y-1">
          <div className="flex items-center space-x-1.5 text-slate-400">
            <Lock className="w-3 h-3 text-emerald-400" />
            <span className="font-semibold text-slate-300">Conexão Segura HTTPS (SSL/TLS 256-bit)</span>
          </div>
          <p className="text-[10px] text-slate-600">
            DDoS Protection by Cloudflare • Ray ID: <span className="font-mono">{rayId || '8D7F9B1C2A3E'}</span>
          </p>
        </div>
      </div>
    </div>
  );
};
