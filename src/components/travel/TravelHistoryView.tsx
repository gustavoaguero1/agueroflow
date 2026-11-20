import React, { useState } from 'react';
import {
  History,
  RotateCw,
  Search,
  Calendar,
  Users,
  Bus,
  TrendingDown,
  TrendingUp,
  ArrowRight,
  ExternalLink,
  Info,
  Clock,
  Sparkles,
  Building,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import { TravelSearchRecord, TravelSearchCriteria, TravelOffer } from '../../types/travel';

interface TravelHistoryViewProps {
  records: TravelSearchRecord[];
  onReconsult: (record: TravelSearchRecord) => void;
  onViewSavedResults: (record: TravelSearchRecord) => void;
  isReconsulting?: boolean;
}

export const TravelHistoryView: React.FC<TravelHistoryViewProps> = ({
  records,
  onReconsult,
  onViewSavedResults,
  isReconsulting = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = records.filter((r) => {
    const text = `${r.criteria.originCity} ${r.criteria.destinationCity} ${r.userName} ${r.bestOfferCarrier || ''} ${r.criteria.corporateContext?.travelReason || ''}`.toLowerCase();
    return text.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto text-slate-100">
      {/* Top Header Card */}
      <div className="bg-[#111827] border border-slate-700/80 rounded-2xl p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs text-cyan-400 font-semibold mb-1">
            <History className="w-4 h-4" />
            <span>Auditoria & Memória de Viagens</span>
          </div>
          <h2 className="text-xl font-bold text-white">Histórico de Pesquisas & Reconsulta</h2>
          <p className="text-xs text-slate-400 mt-1">
            Pesquisas rodoviárias salvas na organização com rastreabilidade de rotas, tarifas históricas e comparador de deltas.
          </p>
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrar por cidade ou solicitante..."
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {/* Warning banner */}
      <div className="p-3.5 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-center space-x-2.5 text-xs text-blue-200">
        <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />
        <span>
          <strong>Aviso de Governança:</strong> Tarifas e disponibilidades antigas são mantidas como dados históricos para controle orçamentário. Utilize <strong>Reconsultar Agora</strong> para verificar os preços em tempo real diretamente nos parceiros homologados.
        </span>
      </div>

      {/* List of Records */}
      {filtered.length === 0 ? (
        <div className="p-10 text-center bg-[#111827] border border-slate-800 rounded-2xl space-y-3">
          <History className="w-8 h-8 text-slate-600 mx-auto" />
          <h4 className="text-sm font-bold text-white">Nenhuma pesquisa registrada no histórico</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Realize uma nova busca de passagens na aba "Nova Busca" e clique em "Salvar Pesquisa" para acompanhar preços e reconsultar a qualquer momento.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((record) => {
            const hasDelta = record.previousBestPrice !== undefined && record.bestOfferTotalAmount !== undefined;
            const deltaAmount = hasDelta ? record.bestOfferTotalAmount! - record.previousBestPrice! : 0;
            const deltaPercent = hasDelta && record.previousBestPrice! > 0 ? (deltaAmount / record.previousBestPrice!) * 100 : 0;

            const formattedDate = new Intl.DateTimeFormat('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }).format(new Date(record.queriedAt));

            const totalPax =
              (record.criteria.passengers?.adults || 1) +
              (record.criteria.passengers?.children || 0) +
              (record.criteria.passengers?.seniors || 0);

            return (
              <div
                key={record.id}
                className="bg-[#111827] border border-slate-800 hover:border-slate-700 rounded-2xl p-4 sm:p-5 transition shadow-lg space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800/80 gap-3">
                  <div>
                    <div className="flex items-center space-x-2 text-xs">
                      <span className="font-semibold text-cyan-400">
                        {record.criteria.originCity} ({record.criteria.originState}) ➔ {record.criteria.destinationCity} ({record.criteria.destinationState})
                      </span>
                      <span className="text-slate-500">•</span>
                      <span className="text-slate-400">
                        Ida: {record.criteria.departureDate.split('-').reverse().join('/')}
                      </span>
                      {record.criteria.returnDate && (
                        <>
                          <span className="text-slate-500">•</span>
                          <span className="text-slate-400">
                            Volta: {record.criteria.returnDate.split('-').reverse().join('/')}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 mt-1">
                      <span>Pesquisado por: <strong className="text-slate-200">{record.userName}</strong></span>
                      <span>•</span>
                      <span>Horário do Registro: <strong className="text-slate-200">{formattedDate}</strong></span>
                      <span>•</span>
                      <span>{totalPax} {totalPax === 1 ? 'passageiro' : 'passageiros'}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => onViewSavedResults(record)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-semibold transition"
                    >
                      Ver Resultados Salvos ({record.resultsCount})
                    </button>

                    <button
                      type="button"
                      disabled={isReconsulting}
                      onClick={() => onReconsult(record)}
                      className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs flex items-center space-x-1.5 transition shadow-md shadow-cyan-500/20 disabled:opacity-50"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Reconsultar Agora</span>
                    </button>
                  </div>
                </div>

                {/* Offer Snapshot summary */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-3 pt-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-slate-400">
                      Melhor oferta registrada:
                      <strong className="text-white ml-1 font-semibold">
                        {record.bestOfferCarrier || 'Diversas viações'}
                      </strong>
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-400">
                      Fonte: <strong className="text-cyan-400">{record.bestOfferSourceName || 'QueroPassagem'}</strong>
                    </span>
                    {record.criteria.corporateContext?.travelReason && (
                      <>
                        <span className="text-slate-500">•</span>
                        <span className="text-emerald-400">
                          Motivo: {record.criteria.corporateContext.travelReason}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Prices and Deltas */}
                  <div className="flex items-center space-x-3 text-right">
                    {hasDelta && deltaAmount !== 0 && (
                      <div className="flex items-center space-x-1 text-xs">
                        {deltaAmount < 0 ? (
                          <span className="text-emerald-400 font-bold flex items-center gap-0.5">
                            <TrendingDown className="w-3.5 h-3.5" />
                            Economia de R$ {Math.abs(deltaAmount).toFixed(2).replace('.', ',')} ({Math.abs(deltaPercent).toFixed(1)}%)
                          </span>
                        ) : (
                          <span className="text-rose-400 font-bold flex items-center gap-0.5">
                            <TrendingUp className="w-3.5 h-3.5" />
                            Aumento de R$ {deltaAmount.toFixed(2).replace('.', ',')} (+{deltaPercent.toFixed(1)}%)
                          </span>
                        )}
                      </div>
                    )}

                    {record.bestOfferTotalAmount ? (
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase font-mono">Total Histórico</span>
                        <strong className="text-base font-mono font-bold text-white">
                          R$ {record.bestOfferTotalAmount.toFixed(2).replace('.', ',')}
                        </strong>
                      </div>
                    ) : (
                      <span className="text-slate-400 text-xs italic">A consultar</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
