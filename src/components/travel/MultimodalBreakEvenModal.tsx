import React, { useState, useMemo } from 'react';
import {
  X,
  TrendingDown,
  Truck,
  Plane,
  Bus,
  ShieldCheck,
  CheckCircle2,
  DollarSign,
  Clock,
  Sparkles,
  Info,
} from 'lucide-react';

interface MultimodalBreakEvenModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultOrigin?: string;
  defaultDestination?: string;
  defaultDistanceKm?: number;
}

export const MultimodalBreakEvenModal: React.FC<MultimodalBreakEvenModalProps> = ({
  isOpen,
  onClose,
  defaultOrigin = 'Campinas / SP',
  defaultDestination = 'Ribeirão Preto / SP',
  defaultDistanceKm = 360,
}) => {
  const [distanceKm, setDistanceKm] = useState(defaultDistanceKm);
  const [teamSize, setTeamSize] = useState(4); // default 4 technicians
  const [dieselPrice, setDieselPrice] = useState(6.20);
  const [vanKmPerL, setVanKmPerL] = useState(9.5);
  const [tollCost, setTollCost] = useState(95.00);
  const [busTicketPrice, setBusTicketPrice] = useState(135.00);
  const [airTicketPrice, setAirTicketPrice] = useState(680.00);
  const [airTransferCost, setAirTransferCost] = useState(240.00);

  if (!isOpen) return null;

  // Van cost (independent of crew size up to 7 pax)
  const vanTotalCost = useMemo(() => {
    const liters = (distanceKm * 2) / vanKmPerL;
    const fuelCost = liters * dieselPrice;
    return fuelCost + tollCost;
  }, [distanceKm, vanKmPerL, dieselPrice, tollCost]);

  // Bus cost (linear with team size)
  const busTotalCost = useMemo(() => {
    return busTicketPrice * 2 * teamSize;
  }, [busTicketPrice, teamSize]);

  // Flight cost (linear + transfer)
  const airTotalCost = useMemo(() => {
    return (airTicketPrice * 2 * teamSize) + airTransferCost;
  }, [airTicketPrice, teamSize, airTransferCost]);

  // Best option
  const { bestOption, savingsVsAir, savingsVsBus } = useMemo(() => {
    const minCost = Math.min(vanTotalCost, busTotalCost, airTotalCost);
    let best = 'van';
    if (minCost === busTotalCost) best = 'bus';
    if (minCost === airTotalCost) best = 'air';

    return {
      bestOption: best,
      savingsVsAir: Math.max(0, airTotalCost - minCost),
      savingsVsBus: Math.max(0, busTotalCost - minCost),
    };
  }, [vanTotalCost, busTotalCost, airTotalCost]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
      <div className="bg-[#111827] border border-cyan-500/40 rounded-3xl w-full max-w-4xl my-6 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-cyan-950/70 via-slate-900 to-blue-950/70 border-b border-cyan-500/30 flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-cyan-400" /> Inteligência Logística
              </span>
              <span className="text-xs text-slate-400">Ponto de Equilíbrio & Análise de Custos</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              Matriz Comparativa de Modalidade (Van vs Ônibus vs Aéreo)
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl">
              Identifique o ponto ótimo de transporte corporativo para a equipe técnica com base na distância da fábrica e na quantidade de montadores.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 text-slate-200 text-xs">
          {/* Controls */}
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-300">Distância Só Ida (km)</label>
              <input
                type="number"
                value={distanceKm}
                onChange={(e) => setDistanceKm(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-300">Tamanho da Equipe</label>
              <select
                value={teamSize}
                onChange={(e) => setTeamSize(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-semibold focus:outline-none focus:border-cyan-500"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'técnico' : 'técnicos'}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-300">Diesel S10 (R$/L)</label>
              <input
                type="number"
                step="0.05"
                value={dieselPrice}
                onChange={(e) => setDieselPrice(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-300">Pedágios Estimados (R$)</label>
              <input
                type="number"
                value={tollCost}
                onChange={(e) => setTollCost(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Cards Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* Van */}
            <div
              className={`p-4 rounded-2xl border transition relative flex flex-col justify-between ${
                bestOption === 'van'
                  ? 'bg-emerald-950/40 border-emerald-500 shadow-xl shadow-emerald-500/10'
                  : 'bg-slate-900 border-slate-800'
              }`}
            >
              {bestOption === 'van' && (
                <span className="absolute -top-2.5 right-4 px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-bold text-[9px] uppercase tracking-wider">
                  Mais Econômica
                </span>
              )}

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-300">
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <strong className="text-sm text-white block">Van da Frota</strong>
                    <span className="text-[10px] text-slate-400">Renault Master / Sprinter</span>
                  </div>
                </div>

                <div className="pt-2">
                  <span className="text-[10px] text-slate-400 block">Custo Total (Ida e Volta)</span>
                  <strong className="text-2xl font-mono font-bold text-white">
                    R$ {vanTotalCost.toFixed(2)}
                  </strong>
                  <span className="text-[10px] text-emerald-400 block font-mono">
                    R$ {(vanTotalCost / teamSize).toFixed(2)} / técnico
                  </span>
                </div>

                <div className="space-y-1 text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
                  <div className="flex justify-between">
                    <span>Combustível:</span>
                    <span className="font-mono text-slate-200">
                      R$ {(((distanceKm * 2) / vanKmPerL) * dieselPrice).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Pedágios:</span>
                    <span className="font-mono text-slate-200">R$ {tollCost.toFixed(2)}</span>
                  </div>
                  <div className="text-[10px] text-emerald-400 font-semibold pt-1">
                    ✓ Permite levar máquinas de solda TIG, tubos e ferramentas pesadas
                  </div>
                </div>
              </div>
            </div>

            {/* Bus */}
            <div
              className={`p-4 rounded-2xl border transition relative flex flex-col justify-between ${
                bestOption === 'bus'
                  ? 'bg-emerald-950/40 border-emerald-500 shadow-xl shadow-emerald-500/10'
                  : 'bg-slate-900 border-slate-800'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <div className="p-2 rounded-xl bg-blue-500/20 text-blue-300">
                    <Bus className="w-5 h-5" />
                  </div>
                  <div>
                    <strong className="text-sm text-white block">Ônibus Executivo</strong>
                    <span className="text-[10px] text-slate-400">QueroPassagem / Cometa / Garcia</span>
                  </div>
                </div>

                <div className="pt-2">
                  <span className="text-[10px] text-slate-400 block">Custo Total (Ida e Volta)</span>
                  <strong className="text-2xl font-mono font-bold text-white">
                    R$ {busTotalCost.toFixed(2)}
                  </strong>
                  <span className="text-[10px] text-slate-400 block font-mono">
                    R$ {(busTotalCost / teamSize).toFixed(2)} / técnico
                  </span>
                </div>

                <div className="space-y-1 text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
                  <div className="flex justify-between">
                    <span>Passagens ({teamSize}x Ida/Volta):</span>
                    <span className="font-mono text-slate-200">R$ {busTotalCost.toFixed(2)}</span>
                  </div>
                  <div className="text-[10px] text-amber-400 font-semibold pt-1">
                    ⚠ Limitação de bagagem pesada e horários fixos de rodoviária
                  </div>
                </div>
              </div>
            </div>

            {/* Flight */}
            <div
              className={`p-4 rounded-2xl border transition relative flex flex-col justify-between ${
                bestOption === 'air'
                  ? 'bg-emerald-950/40 border-emerald-500 shadow-xl shadow-emerald-500/10'
                  : 'bg-slate-900 border-slate-800'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300">
                    <Plane className="w-5 h-5" />
                  </div>
                  <div>
                    <strong className="text-sm text-white block">Aéreo Comercial</strong>
                    <span className="text-[10px] text-slate-400">LATAM / GOL / Azul</span>
                  </div>
                </div>

                <div className="pt-2">
                  <span className="text-[10px] text-slate-400 block">Custo Total (Ida e Volta)</span>
                  <strong className="text-2xl font-mono font-bold text-white">
                    R$ {airTotalCost.toFixed(2)}
                  </strong>
                  <span className="text-[10px] text-slate-400 block font-mono">
                    R$ {(airTotalCost / teamSize).toFixed(2)} / técnico
                  </span>
                </div>

                <div className="space-y-1 text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
                  <div className="flex justify-between">
                    <span>Bilhetes Aéreos:</span>
                    <span className="font-mono text-slate-200">
                      R$ {(airTicketPrice * 2 * teamSize).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Transfer Aeroporto ➔ Fábrica:</span>
                    <span className="font-mono text-slate-200">R$ {airTransferCost.toFixed(2)}</span>
                  </div>
                  <div className="text-[10px] text-cyan-400 font-semibold pt-1">
                    ✓ Mais rápido em distâncias &gt; 800km (interestaduais)
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Executive Verdict */}
          <div className="p-4 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-cyan-950/40 border border-emerald-500/40 rounded-2xl flex items-center justify-between gap-4">
            <div className="space-y-1">
              <strong className="text-sm text-emerald-300 block font-bold">
                Veredito do AgueroFlow para esta Rota:
              </strong>
              <p className="text-xs text-slate-300">
                Para uma equipe de <strong>{teamSize} técnicos</strong> percorrendo <strong>{distanceKm} km</strong>, a <strong>Van da Frota</strong> gera uma economia direta de <strong className="text-emerald-400 font-mono">R$ {savingsVsAir.toFixed(2)}</strong> em relação a voos e <strong className="text-cyan-300 font-mono">R$ {savingsVsBus.toFixed(2)}</strong> frente a passagens rodoviárias, viabilizando o transporte de equipamentos de montagem sem taxas adicionais de despacho.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl"
          >
            Fechar Comparativo
          </button>
        </div>
      </div>
    </div>
  );
};
