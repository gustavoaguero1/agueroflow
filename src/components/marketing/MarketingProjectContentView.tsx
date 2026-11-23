import React, { useState } from 'react';
import {
  HardHat,
  Sparkles,
  ShieldCheck,
  Share2,
  Copy,
  Check,
  FileText,
  Sliders,
  Eye,
  EyeOff,
  Layers,
  ArrowRight,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Download,
  Presentation,
} from 'lucide-react';
import {
  ProjectToContentRequest,
  ToneOfVoice,
} from '../../types/marketing';
import { apiFetch } from '../../apiAuthFetch';

interface ThemedSlide {
  slide: number;
  badge: string;
  title: string;
  subtitle: string;
  content: string;
  keyMetric: string;
  metricLabel: string;
  tag: string;
  themeGradient?: string;
  accentColor?: string;
}

export const MarketingProjectContentView: React.FC = () => {
  const [projectName, setProjectName] = useState('Montagem de Skid Asséptico e Rede Sanitária 316L');
  const [clientName, setClientName] = useState('Multinacional Farmacêutica');
  const [maskClientName, setMaskClientName] = useState(true);
  const [location, setLocation] = useState('Paulínia - SP');
  const [serviceType, setServiceType] = useState<any>('tubulacao_inox');
  const [scopeSummary, setScopeSummary] = useState(
    'Instalação de 1.400 metros de tubulação sanitária Schedule 10 em AISI 316L com curvas OD e conexões TC, incluindo teste hidrostático e decapagem química.'
  );
  const [technicalHighlights, setTechnicalHighlights] = useState(
    'Solda TIG orbital com purga de argônio 99,99%\nRugosidade interna Ra <= 0.4 µm com polimento eletrolítico\n100% de ensaio em líquido penetrante com emissão de laudo\nZero horas de atraso no cronograma da parada fabril'
  );
  const [selectedTone, setSelectedTone] = useState<ToneOfVoice>('profissional');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<any>(null);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  // Active slide carousel view
  const [activeSlideIndex, setActiveSlideIndex] = useState<number>(0);

  const handleGenerateContent = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);

    try {
      const highlightsArray = technicalHighlights
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      const res = await apiFetch('/api/marketing/project-to-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName,
          clientName,
          maskClientName,
          serviceType,
          location,
          technicalHighlights: highlightsArray,
          scopeSummary,
          selectedTone,
          companyName: 'Aguero Inox',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setGeneratedResult(data);
        setActiveSlideIndex(0);
      }
    } catch (err) {
      console.error('Falha ao transformar projeto em conteúdo:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string, identifier: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(identifier);
    setTimeout(() => setCopiedItem(null), 2500);
  };

  const slides: ThemedSlide[] = generatedResult?.technicalSlides || [];
  const currentSlide = slides[activeSlideIndex];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <h2 className="text-lg font-bold text-white tracking-tight flex items-center space-x-2">
          <HardHat className="w-5 h-5 text-amber-400" />
          <span>Transformar Obras em Apresentações & Conteúdo de Autoridade</span>
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Converta diários de obra (RDO), montagens de caldeiraria e tubulações industriais em estudos de caso com **slides temáticos altamente elaborados**, além de artigos para LinkedIn e legendas para Instagram.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form Inputs (5 cols) */}
        <div className="lg:col-span-5">
          <form
            onSubmit={handleGenerateContent}
            className="p-5 rounded-xl border border-slate-800 bg-slate-900/70 space-y-4 text-xs shadow-lg"
          >
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              Dados da Obra / Serviço Executado
            </h3>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Título ou Identificação do Projeto *
              </label>
              <input
                type="text"
                required
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Ex: Fabricação de Tanques e Montagem de Tubulações"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-slate-300 font-semibold">Cliente da Obra</label>
                <button
                  type="button"
                  onClick={() => setMaskClientName(!maskClientName)}
                  className={`text-[11px] font-medium flex items-center space-x-1 cursor-pointer ${
                    maskClientName ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {maskClientName ? (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Nome Ocultado por Sigilo</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5" />
                      <span>Nome Exposto (Autorizado)</span>
                    </>
                  )}
                </button>
              </div>

              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Ex: Nome da Indústria Cliente"
                className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
              />
              <span className="text-[10px] text-slate-500 block">
                {maskClientName
                  ? 'A IA substituirá o nome real por "Grande multinacional do setor..." para proteger o sigilo industrial.'
                  : 'O nome do cliente será exibido abertamente na publicação.'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Tipo de Serviço</label>
                <select
                  value={serviceType}
                  onChange={(e) => setServiceType(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white cursor-pointer"
                >
                  <option value="tubulacao_inox">Tubulações Inox 304/316L</option>
                  <option value="caldeiraria">Caldeiraria & Tanques</option>
                  <option value="montagem_industrial">Montagem Industrial</option>
                  <option value="soldagem_especial">Soldagem TIG Sanitária</option>
                  <option value="manutencao_parada">Parada de Manutenção</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Localidade</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Ex: Campinas - SP"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Resumo do Escopo Executado
              </label>
              <textarea
                rows={3}
                value={scopeSummary}
                onChange={(e) => setScopeSummary(e.target.value)}
                placeholder="Descreva o que foi fabricado ou instalado..."
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Destaques Técnicos & Normas (1 por linha)
              </label>
              <textarea
                rows={3}
                value={technicalHighlights}
                onChange={(e) => setTechnicalHighlights(e.target.value)}
                placeholder="Ex: Solda TIG orbital, Ra <= 0.4 µm, teste hidrostático..."
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500 font-mono text-[11px]"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Tom de Voz</label>
              <select
                value={selectedTone}
                onChange={(e) => setSelectedTone(e.target.value as any)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white cursor-pointer"
              >
                <option value="profissional">Profissional & Engenharia</option>
                <option value="comercial">Comercial & Prospecção</option>
                <option value="educativo">Educativo & Boas Práticas</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={isGenerating}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition shadow-lg shadow-blue-600/30 flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>{isGenerating ? 'Gerando Slides & Apresentação...' : 'Gerar Slides & Conteúdo com IA'}</span>
            </button>
          </form>
        </div>

        {/* Results Area (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {!generatedResult && !isGenerating && (
            <div className="p-12 text-center rounded-xl border border-slate-800 bg-slate-900/40 text-slate-500 text-xs flex flex-col items-center space-y-3">
              <Presentation className="w-10 h-10 text-slate-600" />
              <p className="max-w-md">
                Preencha os dados do projeto à esquerda e clique em "Gerar Slides & Conteúdo com IA" para criar uma sequência visual de slides carrossel estilizados, métricas-chave e artigos corporativos.
              </p>
            </div>
          )}

          {isGenerating && (
            <div className="p-12 text-center rounded-xl border border-blue-500/30 bg-slate-900/60 text-slate-300 text-xs flex flex-col items-center space-y-3 animate-pulse">
              <Sparkles className="w-8 h-8 text-cyan-400 animate-spin" />
              <p>Elaborando slides técnicos tematizados e refinando narrativa industrial com Gemini...</p>
            </div>
          )}

          {generatedResult && (
            <div className="space-y-6">
              {/* THEMED SLIDES CAROUSEL VIEWER (HIGH IMPACT) */}
              {slides.length > 0 && currentSlide && (
                <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/90 shadow-2xl space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <span className="font-bold text-cyan-400 flex items-center space-x-1.5 uppercase text-xs">
                      <Presentation className="w-4 h-4 text-cyan-400" />
                      <span>Slides Tematizados da Apresentação ({slides.length} slides)</span>
                    </span>

                    {/* Slide Navigation Buttons */}
                    <div className="flex items-center space-x-2">
                      <span className="text-[11px] text-slate-400 font-mono">
                        {activeSlideIndex + 1} de {slides.length}
                      </span>
                      <button
                        onClick={() => setActiveSlideIndex((idx) => Math.max(0, idx - 1))}
                        disabled={activeSlideIndex === 0}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 cursor-pointer"
                        title="Slide anterior"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setActiveSlideIndex((idx) => Math.min(slides.length - 1, idx + 1))}
                        disabled={activeSlideIndex === slides.length - 1}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 cursor-pointer"
                        title="Próximo slide"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* ACTIVE THEMED SLIDE CANVAS (16:9 Aspect Presentation) */}
                  <div
                    className="w-full aspect-[16/10] rounded-xl p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden border border-slate-700 shadow-2xl transition-all"
                    style={{
                      background: currentSlide.themeGradient || 'linear-gradient(135deg, #090D16 0%, #0369A1 100%)',
                    }}
                  >
                    {/* Background Graphic Accents */}
                    <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-cyan-500/10 blur-2xl pointer-events-none" />
                    <div className="absolute right-0 bottom-0 text-[70px] font-black font-mono text-white/5 pointer-events-none select-none">
                      0{currentSlide.slide}
                    </div>

                    {/* Top Row: Badge & Tag */}
                    <div className="flex items-center justify-between relative z-10">
                      <span
                        className="px-3 py-1 rounded-md text-[10px] font-bold tracking-widest uppercase shadow"
                        style={{
                          backgroundColor: `${currentSlide.accentColor || '#38BDF8'}25`,
                          color: currentSlide.accentColor || '#38BDF8',
                          border: `1px solid ${currentSlide.accentColor || '#38BDF8'}60`,
                        }}
                      >
                        {currentSlide.badge}
                      </span>

                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-300/80 px-2 py-0.5 rounded bg-black/40 border border-white/10">
                        {currentSlide.tag}
                      </span>
                    </div>

                    {/* Middle: Title, Subtitle & Content */}
                    <div className="space-y-2 relative z-10 max-w-xl my-2">
                      <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-snug">
                        {currentSlide.title}
                      </h3>
                      <p
                        className="text-xs sm:text-sm font-semibold tracking-wide"
                        style={{ color: currentSlide.accentColor || '#38BDF8' }}
                      >
                        {currentSlide.subtitle}
                      </p>
                      <p className="text-xs text-slate-200 leading-relaxed opacity-95 pt-1">
                        {currentSlide.content}
                      </p>
                    </div>

                    {/* Bottom: Highlight Key Metric & Aguero Inox Brand Footer */}
                    <div className="flex items-end justify-between pt-3 border-t border-white/10 relative z-10">
                      <div className="flex items-baseline space-x-2">
                        <span
                          className="text-2xl sm:text-3xl font-black tracking-tight"
                          style={{ color: currentSlide.accentColor || '#38BDF8' }}
                        >
                          {currentSlide.keyMetric}
                        </span>
                        <span className="text-[11px] text-slate-300 uppercase tracking-wider font-semibold">
                          {currentSlide.metricLabel}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-white/50 block">
                          AGUERO INOX & CALDEIRARIA
                        </span>
                        <span className="text-[9px] font-mono text-cyan-400/80">
                          SLIDE 0{currentSlide.slide} / 0{slides.length}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Slide Thumbnails Selector */}
                  <div className="grid grid-cols-5 gap-2 pt-1">
                    {slides.map((s, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveSlideIndex(idx)}
                        className={`p-2 rounded-lg border text-left transition cursor-pointer ${
                          activeSlideIndex === idx
                            ? 'bg-cyan-950/40 border-cyan-500 ring-1 ring-cyan-500'
                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <span className="text-[9px] font-mono text-cyan-400 font-bold block">
                          Slide #{s.slide}
                        </span>
                        <p className="text-[10px] text-slate-200 font-semibold truncate mt-0.5">
                          {s.badge}
                        </p>
                        <span className="text-[9px] text-slate-500 truncate block">
                          {s.keyMetric}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* LinkedIn Article Box */}
              {generatedResult.linkedinArticle && (
                <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/80 space-y-3 text-xs shadow-lg">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="font-bold text-blue-400 flex items-center space-x-1.5 uppercase text-[11px]">
                      <span>LinkedIn · Estudo de Caso B2B</span>
                    </span>
                    <button
                      onClick={() =>
                        copyToClipboard(
                          `${generatedResult.linkedinArticle.title}\n\n${generatedResult.linkedinArticle.leadParagraph}\n\n${generatedResult.linkedinArticle.bodyParagraphs.join('\n\n')}\n\n${generatedResult.linkedinArticle.callToAction}`,
                          'linkedin'
                        )
                      }
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium inline-flex items-center space-x-1 cursor-pointer"
                    >
                      {copiedItem === 'linkedin' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar Artigo Completo</span>
                        </>
                      )}
                    </button>
                  </div>

                  <h3 className="text-sm font-bold text-white">
                    {generatedResult.linkedinArticle.title}
                  </h3>

                  <p className="text-slate-300 font-medium leading-relaxed">
                    {generatedResult.linkedinArticle.leadParagraph}
                  </p>

                  <div className="space-y-2 text-slate-300 leading-relaxed border-t border-slate-800/60 pt-2">
                    {generatedResult.linkedinArticle.bodyParagraphs?.map((p: string, idx: number) => (
                      <p key={idx}>{p}</p>
                    ))}
                  </div>

                  <div className="p-3 rounded-lg bg-blue-950/30 border border-blue-800/40 text-blue-300 font-semibold">
                    CTA: {generatedResult.linkedinArticle.callToAction}
                  </div>
                </div>
              )}

              {/* Instagram / WhatsApp Post Box */}
              {generatedResult.instagramPost && (
                <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/80 space-y-3 text-xs shadow-lg">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="font-bold text-pink-400 flex items-center space-x-1.5 uppercase text-[11px]">
                      <span>Instagram Feed & WhatsApp Corporativo</span>
                    </span>
                    <button
                      onClick={() =>
                        copyToClipboard(
                          `${generatedResult.instagramPost.headline}\n\n${generatedResult.instagramPost.caption}`,
                          'instagram'
                        )
                      }
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium inline-flex items-center space-x-1 cursor-pointer"
                    >
                      {copiedItem === 'instagram' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar Legenda</span>
                        </>
                      )}
                    </button>
                  </div>

                  <p className="font-bold text-white text-xs">
                    {generatedResult.instagramPost.headline}
                  </p>

                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 text-slate-300 whitespace-pre-line leading-relaxed">
                    {generatedResult.instagramPost.caption}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
