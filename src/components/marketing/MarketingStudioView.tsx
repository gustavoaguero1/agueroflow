import React, { useState, useRef } from 'react';
import {
  Palette,
  Sparkles,
  Download,
  Copy,
  Check,
  Type,
  Maximize2,
  Sliders,
  Layers,
  Save,
  Trash2,
  Plus,
  RefreshCw,
  Eye,
  FileImage,
  Wand2,
  CheckCircle2,
  Presentation,
  FileDown,
  Building,
  ChevronLeft,
  ChevronRight,
  Target,
  ListChecks,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import {
  CreativeAsset,
  CreativeFormat,
  CREATIVE_DIMENSIONS,
  CreativeLayer,
  CreativeVariation,
  CorporatePresentationSlide,
  ToneOfVoice,
  MarketingAudience,
  BrandIdentityConfig,
} from '../../types/marketing';
import { MarketingService } from '../../services/marketingService';

interface MarketingStudioViewProps {
  assets: CreativeAsset[];
  onSaveAsset: (asset: CreativeAsset) => void;
  currentOrgId: string;
  brand?: BrandIdentityConfig;
}

export const MarketingStudioView: React.FC<MarketingStudioViewProps> = ({
  assets,
  onSaveAsset,
  currentOrgId,
  brand,
}) => {
  // Mode: 'peca_grafica' (Social/Banner/Poster) vs 'apresentacao_corporativa' (Slides)
  const [studioMode, setStudioMode] = useState<'peca_grafica' | 'apresentacao_corporativa'>('peca_grafica');

  // Media Graphic State
  const [selectedFormat, setSelectedFormat] = useState<CreativeFormat>('post_quadrado');
  const [themeInput, setThemeInput] = useState('Segurança em Soldagem TIG e Uso de EPIs');
  const [audience, setAudience] = useState<MarketingAudience>('interno_colaboradores');
  const [toneOfVoice, setToneOfVoice] = useState<ToneOfVoice>('motivacional');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [selectedVariationId, setSelectedVariationId] = useState<string>('var_1');

  // Corporate Presentation State
  const [presentationTopic, setPresentationTopic] = useState('Excelência em Caldeiraria & Tubulações Sanitárias 316L');
  const [presentationAudience, setPresentationAudience] = useState('Diretoria Industrial e Compradores B2B');
  const [presentationSlidesCount, setPresentationSlidesCount] = useState<number>(5);
  const [presentationCompanyProfile, setPresentationCompanyProfile] = useState<'industria' | 'servicos'>('industria');
  const [activeSlideIndex, setActiveSlideIndex] = useState<number>(0);
  const [isGeneratingPresentation, setIsGeneratingPresentation] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Default Corporate Presentation Slides
  const [presentationSlides, setPresentationSlides] = useState<CorporatePresentationSlide[]>([
    {
      id: 'sl_1',
      slideNumber: 1,
      layoutType: 'title_cover',
      badge: 'APRESENTAÇÃO EXECUTIVA · 2026',
      title: 'Excelência em Caldeiraria & Tubulações Sanitárias 316L',
      subtitle: `${brand?.tradingName || 'Aguero Inox'} · Engenharia de Precisão e Montagens Industriais`,
      topicPoints: [
        'Capacidade instalada para caldeiraria leve, média e pesada em aços nobres',
        'Processos certificados segundo ASME Seção IX e normas sanitárias ASME BPE',
        'Rastreabilidade total de matéria-prima e ensaios não destrutivos (END)',
      ],
      highlightMetric: '100%',
      metricLabel: 'Rigor Técnico & Conformidade',
      footerTag: 'Engenharia em Inox',
      themeGradient: 'linear-gradient(135deg, #090D16 0%, #0369A1 100%)',
      accentColor: brand?.accentColor || '#38BDF8',
    },
    {
      id: 'sl_2',
      slideNumber: 2,
      layoutType: 'split_metric',
      badge: 'EFICIÊNCIA & RESULTADOS',
      title: 'Otimização de Paradas de Manutenção',
      subtitle: 'Montagem de redes de fluidos sem interrupção desnecessária da planta',
      topicPoints: [
        'Pré-fabricação de spools e curvas em oficina com testes prévios de estanqueidade',
        'Soldagem orbital automatizada e manual com purga de argônio 99,99%',
        'Minimização do tempo de parada crítica com cronograma físico 24/7',
      ],
      highlightMetric: '0 Atrasos',
      metricLabel: 'Pontualidade de Parada Fabril',
      footerTag: 'Confiabilidade B2B',
      themeGradient: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%)',
      accentColor: '#60A5FA',
    },
    {
      id: 'sl_3',
      slideNumber: 3,
      layoutType: 'bullets_highlights',
      badge: 'CONTROLE DE QUALIDADE',
      title: 'Procedimentos de Inspeção & Rugosidade',
      subtitle: 'Atendimento às exigências das indústrias farmacêutica, química e alimentícia',
      topicPoints: [
        'Rugosidade superficial interna Ra ≤ 0.4 µm com polimento mecânico e eletrolítico',
        '100% de ensaio em líquido penetrante (LP) por inspetor qualificado SNQC',
        'Teste hidrostático a 1.5x a pressão de projeto e decapagem/passivação química',
        'Emissão de Data Book completo contendo certificados de corrida e relatórios de ensaio',
      ],
      highlightMetric: 'Ra ≤ 0.4 µm',
      metricLabel: 'Padrão Sanitário Controlado',
      footerTag: 'Norma ASME BPE',
      themeGradient: 'linear-gradient(135deg, #022C22 0%, #0F172A 100%)',
      accentColor: '#34D399',
    },
    {
      id: 'sl_4',
      slideNumber: 4,
      layoutType: 'timeline_steps',
      badge: 'METODOLOGIA DE PROJETO',
      title: 'Fluxo Integrado: do Isométrico ao Comissionamento',
      subtitle: 'Acompanhamento etapa por etapa com supervisão de engenharia',
      topicPoints: [
        'Fase 1: Levantamento de campo em 3D, isométricos e validação de BOM (Lista de Materiais)',
        'Fase 2: Corte a laser, calandragem e soldagem qualificada em ambiente controlado',
        'Fase 3: Transporte e montagem estrutural no cliente com equipe própria e ART',
        'Fase 4: Teste de estanqueidade, partida assistida e entrega de relatórios finais',
      ],
      highlightMetric: '4 Fases',
      metricLabel: 'Gestão Ágil de Engenharia',
      footerTag: 'Garantia de Entrega',
      themeGradient: 'linear-gradient(135deg, #1E1B4B 0%, #0F172A 100%)',
      accentColor: '#A78BFA',
    },
    {
      id: 'sl_5',
      slideNumber: 5,
      layoutType: 'quote_closing',
      badge: 'PARCERIA ESTRATÉGICA',
      title: 'Construa seu Próximo Projeto com a Aguero Inox',
      subtitle: 'Soluções personalizadas em caldeiraria e tubulações industriais',
      topicPoints: [
        'Equipe técnica multidisciplinar com engenheiro dedicado ao seu contrato',
        'Flexibilidade para implantações de novas plantas e paradas programadas',
        'Garantia sólida de fabricação e suporte contínuo pós-entrega',
      ],
      highlightMetric: 'B2B',
      metricLabel: 'Parceria de Longo Prazo',
      footerTag: 'Aguero Inox & Caldeiraria',
      themeGradient: 'linear-gradient(135deg, #090D16 0%, #0284C7 100%)',
      accentColor: brand?.accentColor || '#38BDF8',
    },
  ]);

  // Active Graphic Asset being edited
  const [currentAsset, setCurrentAsset] = useState<CreativeAsset>(() => {
    return assets[0] || {
      id: `ast_${Date.now()}`,
      organizationId: currentOrgId,
      title: 'Campanha de Segurança na Caldeiraria',
      format: 'post_quadrado',
      dimensions: CREATIVE_DIMENSIONS.post_quadrado,
      category: 'seguranca_sipat',
      theme: 'Segurança e NRs',
      targetAudience: 'interno_colaboradores',
      toneOfVoice: 'motivacional',
      backgroundColor: '#0F172A',
      backgroundGradient: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%)',
      layers: [
        {
          id: 'ly_1',
          type: 'badge',
          text: 'SEGURANÇA EM PRIMEIRO LUGAR',
          xPercent: 8,
          yPercent: 12,
          backgroundColor: '#16A34A',
          fontColor: '#FFFFFF',
          bold: true,
        },
        {
          id: 'ly_2',
          type: 'text_title',
          text: 'Rigor Técnico & Zero Acidentes',
          fontSize: 30,
          fontColor: '#FFFFFF',
          xPercent: 8,
          yPercent: 24,
          bold: true,
        },
        {
          id: 'ly_3',
          type: 'text_body',
          text: 'Na caldeiraria e tubulações de aço inox, cada detalhe conta. Use os EPIs recomendados e proteja você e sua equipe.',
          fontSize: 15,
          fontColor: '#CBD5E1',
          xPercent: 8,
          yPercent: 44,
          widthPercent: 84,
        },
        {
          id: 'ly_4',
          type: 'button_cta',
          text: 'AGUERO INOX · QUALIDADE & SEGURANÇA',
          xPercent: 8,
          yPercent: 80,
          backgroundColor: '#0284C7',
          fontColor: '#FFFFFF',
          bold: true,
        },
      ],
      variations: [
        {
          id: 'var_1',
          name: 'Variação 1: Rigor Técnico & Qualidade',
          headline: 'Rigor Técnico & Zero Acidentes',
          subheadline: 'Compromisso com cada cordão de solda e cada colaborador',
          bodyText: 'Na caldeiraria e tubulações de aço inox, cada detalhe conta. Use os EPIs recomendados e proteja você e sua equipe.',
          callToAction: 'AGUERO INOX · QUALIDADE & SEGURANÇA',
          badgeText: 'SEGURANÇA EM PRIMEIRO LUGAR',
          badgeColor: '#16A34A',
          backgroundColor: '#0F172A',
          backgroundGradient: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%)',
          accentColor: '#38BDF8',
          socialCaption: 'Segurança não é opção, é o pilar que sustenta cada metro de tubulação montado pela nossa equipe. #AgueroInox #SegurancaDoTrabalho #Caldeiraria',
          hashtags: ['#AgueroInox', '#SegurancaIndustrial', '#AcoInox', '#SoldaTIG'],
        },
        {
          id: 'var_2',
          name: 'Variação 2: Cuidado Humano & Retorno Seguro',
          headline: 'Sua Vida em Primeiro Lugar',
          subheadline: 'Sua família espera por você ao final de cada jornada',
          bodyText: 'Nenhuma entrega operacional justifica negligenciar o travamento, o cinto em altura ou a máscara respiratória. Trabalhe consciente.',
          callToAction: 'VOLTE COM SEGURANÇA PARA QUEM AMA',
          badgeText: 'VALORIZAÇÃO DA VIDA',
          badgeColor: '#0284C7',
          backgroundColor: '#064E3B',
          backgroundGradient: 'linear-gradient(135deg, #064E3B 0%, #0F172A 100%)',
          accentColor: '#4ADE80',
          socialCaption: 'A verdadeira maestria na caldeiraria se comprova quando a precisão técnica caminha lado a lado com a proteção de vidas. #CuidadoAtivo #AgueroInox',
          hashtags: ['#SegurancaEmPrimeiroLugar', '#ZeroAcidentes', '#CaldeirariaIndustrial'],
        },
      ],
      generatedCopy: {
        headline: 'Rigor Técnico & Zero Acidentes na Aguero Inox',
        bodyText: 'A segurança operacional é nosso valor primordial. Soldar e montar estruturas com padrão sanitário exige foco absoluto.',
        callToAction: 'Trabalhe seguro, volte bem para casa.',
        socialCaption: 'Segurança não é opção, é o pilar que sustenta cada metro de tubulação montado pela nossa equipe. #AgueroInox #SegurancaDoTrabalho #Caldeiraria',
        hashtags: ['#AgueroInox', '#SegurancaIndustrial', '#AcoInox', '#SoldaTIG'],
      },
      status: 'aprovado',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });

  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Handle format change
  const handleFormatChange = (fmt: CreativeFormat) => {
    setSelectedFormat(fmt);
    setCurrentAsset((prev) => ({
      ...prev,
      format: fmt,
      dimensions: CREATIVE_DIMENSIONS[fmt],
    }));
  };

  // Apply visual variation
  const handleApplyVariation = (variation: CreativeVariation) => {
    setSelectedVariationId(variation.id);
    setCurrentAsset((prev) => {
      const updatedLayers = prev.layers.map((ly) => {
        if (ly.type === 'badge' && variation.badgeText) {
          return {
            ...ly,
            text: variation.badgeText,
            backgroundColor: variation.badgeColor || ly.backgroundColor,
          };
        }
        if (ly.type === 'text_title') {
          return { ...ly, text: variation.headline };
        }
        if (ly.type === 'text_body') {
          return { ...ly, text: variation.bodyText };
        }
        if (ly.type === 'button_cta' && variation.callToAction) {
          return {
            ...ly,
            text: variation.callToAction.toUpperCase(),
            backgroundColor: variation.accentColor || ly.backgroundColor,
          };
        }
        return ly;
      });

      return {
        ...prev,
        title: variation.headline,
        backgroundColor: variation.backgroundColor || prev.backgroundColor,
        backgroundGradient: variation.backgroundGradient || prev.backgroundGradient,
        layers: updatedLayers,
        generatedCopy: {
          headline: variation.headline,
          subheadline: variation.subheadline,
          bodyText: variation.bodyText,
          callToAction: variation.callToAction,
          socialCaption: variation.socialCaption,
          hashtags: variation.hashtags,
        },
      };
    });
  };

  // AI Generation for Graphic Media
  const handleGenerateAi = async () => {
    if (!themeInput.trim()) return;
    setIsGenerating(true);

    try {
      const res = await fetch('/api/marketing/generate-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme: themeInput,
          audience,
          toneOfVoice,
          format: CREATIVE_DIMENSIONS[selectedFormat].label,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const variations: CreativeVariation[] = Array.isArray(data.variations) && data.variations.length > 0
          ? data.variations
          : [
              {
                id: 'var_1',
                name: 'Conceito 1: Rigor & Precisão',
                headline: data.headline || themeInput,
                subheadline: data.subheadline || '',
                bodyText: data.bodyText || '',
                callToAction: data.callToAction || 'SAIBA MAIS',
                badgeText: 'DESTAQUE INDUSTRIAL',
                badgeColor: '#0284C7',
                backgroundGradient: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%)',
                socialCaption: data.socialCaption || '',
                hashtags: data.hashtags || [],
              },
            ];

        const firstVar = variations[0];
        setSelectedVariationId(firstVar.id);

        setCurrentAsset((prev) => {
          const updatedLayers = prev.layers.map((ly) => {
            if (ly.type === 'badge' && firstVar.badgeText) {
              return { ...ly, text: firstVar.badgeText, backgroundColor: firstVar.badgeColor || '#0284C7' };
            }
            if (ly.type === 'text_title' && firstVar.headline) {
              return { ...ly, text: firstVar.headline };
            }
            if (ly.type === 'text_body' && firstVar.bodyText) {
              return { ...ly, text: firstVar.bodyText };
            }
            if (ly.type === 'button_cta' && firstVar.callToAction) {
              return { ...ly, text: firstVar.callToAction.toUpperCase() };
            }
            return ly;
          });

          return {
            ...prev,
            title: firstVar.headline || prev.title,
            backgroundGradient: firstVar.backgroundGradient || prev.backgroundGradient,
            layers: updatedLayers,
            variations,
            generatedCopy: {
              headline: firstVar.headline,
              subheadline: firstVar.subheadline,
              bodyText: firstVar.bodyText,
              callToAction: firstVar.callToAction,
              socialCaption: firstVar.socialCaption,
              hashtags: firstVar.hashtags,
            },
          };
        });
      }
    } catch (err) {
      console.error('Falha ao gerar com IA no Estúdio:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  // AI Generation for Corporate Presentation Slides
  const handleGeneratePresentation = async () => {
    if (!presentationTopic.trim()) return;
    setIsGeneratingPresentation(true);

    try {
      const res = await fetch('/api/marketing/generate-presentation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: presentationTopic,
          targetAudience: presentationAudience,
          slidesCount: presentationSlidesCount,
          companyProfile: presentationCompanyProfile,
          brandColors: {
            primaryColor: brand?.primaryColor || '#0284C7',
            accentColor: brand?.accentColor || '#38BDF8',
            darkColor: brand?.darkColor || '#090D16',
          },
          companyName: brand?.tradingName || 'Aguero Inox',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.slides) && data.slides.length > 0) {
          setPresentationSlides(data.slides);
          setActiveSlideIndex(0);
        }
      }
    } catch (err) {
      console.error('Falha ao gerar apresentação corporativa com IA:', err);
    } finally {
      setIsGeneratingPresentation(false);
    }
  };

  // Export Presentation to PDF using jsPDF
  const handleExportPresentationPdf = () => {
    try {
      setIsExportingPdf(true);
      // Landscape 16:9 presentation PDF (297mm x 167mm or standard A4 Landscape 297x210)
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4', // 297 x 210 mm
      });

      const totalSlides = presentationSlides.length;

      presentationSlides.forEach((slide, idx) => {
        if (idx > 0) {
          doc.addPage('a4', 'landscape');
        }

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // 1. Dark Background
        doc.setFillColor(15, 23, 42); // slate-900
        doc.rect(0, 0, pageWidth, pageHeight, 'F');

        // 2. Header banner accent line
        doc.setFillColor(2, 132, 199); // blue-600
        doc.rect(0, 0, pageWidth, 4, 'F');

        // 3. Slide Badge
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(56, 189, 248); // cyan-400
        doc.text(slide.badge.toUpperCase(), 20, 20);

        // 4. Slide Number Indicator
        doc.setFontSize(9);
        doc.setTextColor(148, 163, 184); // slate-400
        doc.text(`SLIDE ${slide.slideNumber} / ${totalSlides}`, pageWidth - 45, 20);

        // 5. Title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.setTextColor(255, 255, 255);
        const splitTitle = doc.splitTextToSize(slide.title, pageWidth - 40);
        doc.text(splitTitle, 20, 32);

        // 6. Subtitle
        if (slide.subtitle) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(11);
          doc.setTextColor(147, 197, 253); // blue-300
          doc.text(slide.subtitle, 20, 44);
        }

        // 7. Divider Line
        doc.setDrawColor(51, 65, 85);
        doc.setLineWidth(0.5);
        doc.line(20, 50, pageWidth - 20, 50);

        // 8. Key Metric Callout Box (Right Side)
        const metricBoxX = pageWidth - 90;
        const metricBoxY = 60;
        doc.setFillColor(30, 41, 59); // slate-800
        doc.roundedRect(metricBoxX, metricBoxY, 70, 40, 3, 3, 'F');
        doc.setDrawColor(2, 132, 199);
        doc.setLineWidth(0.8);
        doc.roundedRect(metricBoxX, metricBoxY, 70, 40, 3, 3, 'D');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.setTextColor(56, 189, 248);
        doc.text(slide.highlightMetric || '100%', metricBoxX + 10, metricBoxY + 18);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(203, 213, 225);
        const splitMetricLabel = doc.splitTextToSize(slide.metricLabel || 'Resultado Comprovado', 50);
        doc.text(splitMetricLabel, metricBoxX + 10, metricBoxY + 28);

        // 9. Topic Points (Left Column)
        let pointY = 65;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.setTextColor(241, 245, 249); // slate-100

        slide.topicPoints.forEach((point, pIdx) => {
          // Bullet dot
          doc.setFillColor(2, 132, 199);
          doc.circle(23, pointY - 1.5, 1.5, 'F');

          // Bullet text
          const splitPoint = doc.splitTextToSize(point, metricBoxX - 35);
          doc.text(splitPoint, 28, pointY);
          pointY += splitPoint.length * 6 + 4;
        });

        // 10. Footer Brand Indicator
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(
          `${brand?.companyName || 'AGUERO INOX & CALDEIRARIA INDUSTRIAL'} · ${slide.footerTag || 'SOLUÇÕES INDUSTRIAIS'}`,
          20,
          pageHeight - 12
        );
      });

      // Save PDF to downloads
      const cleanFileName = (presentationTopic || 'Apresentacao_Corporativa')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .slice(0, 35);
      doc.save(`${cleanFileName}_aguero_inox.pdf`);
    } catch (err) {
      console.error('Falha ao exportar apresentação para PDF:', err);
      alert('Erro ao gerar PDF da apresentação.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Save Asset
  const handleSave = () => {
    onSaveAsset(currentAsset);
    alert('Peça gráfica salva com sucesso no Estúdio Criativo!');
  };

  // Copy caption
  const handleCopyCaption = () => {
    if (!currentAsset.generatedCopy?.socialCaption) return;
    navigator.clipboard.writeText(currentAsset.generatedCopy.socialCaption);
    setCopiedCaption(true);
    setTimeout(() => setCopiedCaption(false), 2500);
  };

  // Layer editing helpers
  const updateLayerText = (id: string, text: string) => {
    setCurrentAsset((prev) => ({
      ...prev,
      layers: prev.layers.map((ly) => (ly.id === id ? { ...ly, text } : ly)),
    }));
  };

  const updateLayerColor = (id: string, fontColor: string) => {
    setCurrentAsset((prev) => ({
      ...prev,
      layers: prev.layers.map((ly) => (ly.id === id ? { ...ly, fontColor } : ly)),
    }));
  };

  const updateLayerBg = (id: string, backgroundColor: string) => {
    setCurrentAsset((prev) => ({
      ...prev,
      layers: prev.layers.map((ly) => (ly.id === id ? { ...ly, backgroundColor } : ly)),
    }));
  };

  const updateLayerSize = (id: string, fontSize: number) => {
    setCurrentAsset((prev) => ({
      ...prev,
      layers: prev.layers.map((ly) => (ly.id === id ? { ...ly, fontSize } : ly)),
    }));
  };

  const handleAddTextLayer = () => {
    const newLy: CreativeLayer = {
      id: `ly_${Date.now()}`,
      type: 'text_body',
      text: 'Novo texto editável',
      fontSize: 16,
      fontColor: '#FFFFFF',
      xPercent: 15,
      yPercent: 60,
      widthPercent: 70,
    };
    setCurrentAsset((prev) => ({
      ...prev,
      layers: [...prev.layers, newLy],
    }));
    setActiveLayerId(newLy.id);
  };

  const handleDeleteLayer = (id: string) => {
    setCurrentAsset((prev) => ({
      ...prev,
      layers: prev.layers.filter((ly) => ly.id !== id),
    }));
    if (activeLayerId === id) setActiveLayerId(null);
  };

  const dim = CREATIVE_DIMENSIONS[selectedFormat];
  const aspectClass =
    selectedFormat === 'post_quadrado'
      ? 'aspect-square'
      : selectedFormat === 'post_vertical'
      ? 'aspect-[4/5]'
      : selectedFormat === 'story'
      ? 'aspect-[9/16]'
      : selectedFormat === 'banner_horizontal'
      ? 'aspect-video'
      : 'aspect-[1/1.41]';

  const currentCorporateSlide = presentationSlides[activeSlideIndex] || presentationSlides[0];

  return (
    <div className="space-y-6">
      {/* Studio Mode Selector (Peças Gráficas vs Apresentações Corporativas) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center space-x-2">
            <Palette className="w-5 h-5 text-purple-400" />
            <span>Estúdio Criativo Corporativo</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Crie peças para redes sociais, cartazes de fábrica ou **apresentações corporativas completas com exportação em PDF**.
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800 text-xs font-medium">
          <button
            onClick={() => setStudioMode('peca_grafica')}
            className={`px-3 py-1.5 rounded-md transition cursor-pointer flex items-center space-x-1.5 ${
              studioMode === 'peca_grafica' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Peças Gráficas & Redes</span>
          </button>
          <button
            onClick={() => setStudioMode('apresentacao_corporativa')}
            className={`px-3 py-1.5 rounded-md transition cursor-pointer flex items-center space-x-1.5 ${
              studioMode === 'apresentacao_corporativa'
                ? 'bg-purple-600 text-white shadow'
                : 'text-purple-400 hover:text-white'
            }`}
          >
            <Presentation className="w-3.5 h-3.5" />
            <span>Apresentações Corporativas (IA + PDF)</span>
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MODE 1: APRESENTAÇÃO CORPORATIVA (SLIDES TEMÁTICOS & EXPORTAÇÃO PDF) */}
      {/* ==================================================================== */}
      {studioMode === 'apresentacao_corporativa' && (
        <div className="space-y-6">
          {/* Top Presentation AI Generator Bar */}
          <div className="p-5 rounded-2xl border border-purple-500/40 bg-gradient-to-r from-slate-900 via-purple-950/30 to-slate-900 space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <span className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center space-x-1.5">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  <span>Gerador de Apresentações Corporativas Estruturadas por IA</span>
                </span>
                <p className="text-xs text-slate-300">
                  Estrutura conteúdo em tópicos profissionais, aplica a identidade visual da empresa ({brand?.tradingName || 'Aguero Inox'}) e exporta slides prontos em PDF.
                </p>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <button
                  type="button"
                  disabled={isGeneratingPresentation}
                  onClick={handleGeneratePresentation}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs transition shadow-lg shadow-purple-600/30 cursor-pointer disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <Wand2 className="w-4 h-4" />
                  <span>{isGeneratingPresentation ? 'Gerando com IA...' : 'Gerar Apresentação com Gemini'}</span>
                </button>

                <button
                  type="button"
                  disabled={isExportingPdf || presentationSlides.length === 0}
                  onClick={handleExportPresentationPdf}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition shadow-lg shadow-emerald-600/30 cursor-pointer disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <FileDown className="w-4 h-4" />
                  <span>{isExportingPdf ? 'Exportando...' : 'Exportar em PDF'}</span>
                </button>
              </div>
            </div>

            {/* Input Parameters Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs pt-2 border-t border-slate-800">
              <div className="sm:col-span-2">
                <label className="text-[11px] text-slate-400 font-semibold block mb-1">
                  Tema ou Objetivo da Apresentação *
                </label>
                <input
                  type="text"
                  value={presentationTopic}
                  onChange={(e) => setPresentationTopic(e.target.value)}
                  placeholder="Ex: Resultados de Segurança e Caldeiraria 2026, Proposta de Parada..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 font-semibold block mb-1">
                  Público Alvo
                </label>
                <input
                  type="text"
                  value={presentationAudience}
                  onChange={(e) => setPresentationAudience(e.target.value)}
                  placeholder="Ex: Diretoria Executiva, Clientes B2B..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 font-semibold block mb-1">
                  Perfil de Atuação
                </label>
                <select
                  value={presentationCompanyProfile}
                  onChange={(e) => setPresentationCompanyProfile(e.target.value as any)}
                  className="w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs cursor-pointer"
                >
                  <option value="industria">Indústria & Caldeiraria (Fabricação)</option>
                  <option value="servicos">Serviços & Montagens (Campo)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Active Presentation Slide Canvas Preview & Controls */}
          <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/90 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-white text-sm">
                  Slide {activeSlideIndex + 1} de {presentationSlides.length}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  · Layout: {currentCorporateSlide.layoutType.replace('_', ' ')}
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setActiveSlideIndex((idx) => Math.max(0, idx - 1))}
                  disabled={activeSlideIndex === 0}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 cursor-pointer"
                  title="Slide anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setActiveSlideIndex((idx) => Math.min(presentationSlides.length - 1, idx + 1))}
                  disabled={activeSlideIndex === presentationSlides.length - 1}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 cursor-pointer"
                  title="Próximo slide"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Slide Presentation Canvas (16:9 widescreen) */}
            <div
              className="w-full aspect-[16/9] rounded-xl p-8 sm:p-12 flex flex-col justify-between relative overflow-hidden border border-slate-700 shadow-2xl transition-all"
              style={{
                background: currentCorporateSlide.themeGradient || 'linear-gradient(135deg, #090D16 0%, #0369A1 100%)',
              }}
            >
              {/* Background Glow */}
              <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
              <div className="absolute right-6 bottom-4 text-[90px] font-black font-mono text-white/5 pointer-events-none select-none">
                0{currentCorporateSlide.slideNumber}
              </div>

              {/* Top Row: Badge & Brand Logo Indicator */}
              <div className="flex items-center justify-between relative z-10">
                <span
                  className="px-3.5 py-1 rounded-md text-[11px] font-bold tracking-widest uppercase shadow"
                  style={{
                    backgroundColor: `${currentCorporateSlide.accentColor || '#38BDF8'}25`,
                    color: currentCorporateSlide.accentColor || '#38BDF8',
                    border: `1px solid ${currentCorporateSlide.accentColor || '#38BDF8'}60`,
                  }}
                >
                  {currentCorporateSlide.badge}
                </span>

                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/70 px-2.5 py-1 rounded bg-black/40 border border-white/10">
                    {brand?.tradingName || 'AGUERO INOX'}
                  </span>
                  <span className="text-[10px] font-mono text-cyan-400 px-2 py-1 rounded bg-slate-900/60 border border-cyan-800/40">
                    {currentCorporateSlide.footerTag || 'INDUSTRIAL'}
                  </span>
                </div>
              </div>

              {/* Center: Title, Subtitle and Topic Points Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center relative z-10 my-3">
                <div className="lg:col-span-8 space-y-3">
                  <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">
                    {currentCorporateSlide.title}
                  </h3>
                  {currentCorporateSlide.subtitle && (
                    <p
                      className="text-xs sm:text-sm font-semibold tracking-wide"
                      style={{ color: currentCorporateSlide.accentColor || '#38BDF8' }}
                    >
                      {currentCorporateSlide.subtitle}
                    </p>
                  )}

                  {/* Topic Points with Bullets */}
                  <div className="space-y-2 pt-2">
                    {currentCorporateSlide.topicPoints.map((point, pIdx) => (
                      <div key={pIdx} className="flex items-start space-x-2.5">
                        <span
                          className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                          style={{ backgroundColor: currentCorporateSlide.accentColor || '#38BDF8' }}
                        />
                        <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                          {point}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Key Metric Card on Slide */}
                <div className="lg:col-span-4 p-5 rounded-2xl bg-black/40 border border-white/10 backdrop-blur-sm text-center space-y-1">
                  <span
                    className="text-3xl sm:text-4xl font-black tracking-tight block"
                    style={{ color: currentCorporateSlide.accentColor || '#38BDF8' }}
                  >
                    {currentCorporateSlide.highlightMetric || '100%'}
                  </span>
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider block">
                    {currentCorporateSlide.metricLabel || 'Rigor Operacional'}
                  </span>
                  <span className="text-[10px] text-slate-400 block pt-1">
                    Garantia de conformidade & prazos
                  </span>
                </div>
              </div>

              {/* Bottom: Footer Info */}
              <div className="flex items-center justify-between pt-3 border-t border-white/10 relative z-10 text-[10px] text-slate-400">
                <span>{brand?.companyName || 'Aguero Inox & Caldeiraria Industrial'}</span>
                <span className="font-mono text-cyan-400">
                  Slide {currentCorporateSlide.slideNumber} / {presentationSlides.length}
                </span>
              </div>
            </div>

            {/* Slide Thumbnails Selector Ribbon */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2">
              {presentationSlides.map((s, idx) => (
                <button
                  key={s.id || idx}
                  onClick={() => setActiveSlideIndex(idx)}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between space-y-1 ${
                    activeSlideIndex === idx
                      ? 'bg-purple-950/50 border-purple-500 ring-1 ring-purple-500 shadow-md'
                      : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-purple-400 font-bold">
                      Slide #{s.slideNumber}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 truncate max-w-[80px]">
                      {s.highlightMetric}
                    </span>
                  </div>
                  <h4 className="text-[11px] font-bold text-white line-clamp-1">{s.title}</h4>
                  <span className="text-[9px] text-slate-400 line-clamp-1">{s.badge}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODE 2: PEÇAS GRÁFICAS & REDES SOCIAIS (FORMATOS 1:1, 9:16, A4, A3)  */}
      {/* ==================================================================== */}
      {studioMode === 'peca_grafica' && (
        <div className="space-y-6">
          {/* Format Selector Bar */}
          <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/80 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400 font-semibold text-[11px] mr-1">Seletor de Formato:</span>
            {(
              [
                'post_quadrado',
                'post_vertical',
                'story',
                'banner_horizontal',
                'cartaz_a4',
                'cartaz_a3',
              ] as CreativeFormat[]
            ).map((fmtKey) => {
              const f = CREATIVE_DIMENSIONS[fmtKey];
              const isSelected = selectedFormat === fmtKey;
              return (
                <button
                  key={fmtKey}
                  onClick={() => handleFormatChange(fmtKey)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${
                    isSelected
                      ? 'bg-purple-600 text-white border-purple-500 font-semibold shadow'
                      : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  <span>{f.label}</span>
                  <span className="text-[10px] opacity-75 ml-1.5">
                    ({f.width}x{f.height})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Main Studio Work Area (2 Columns) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Side: Canvas Preview (5 Cols) */}
            <div className="lg:col-span-5 flex flex-col items-center">
              <div className="w-full max-w-sm space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold text-slate-300">Prévia Visual Interativa</span>
                  <span className="font-mono text-[11px]">
                    {dim.width} × {dim.height} px ({dim.aspectRatio})
                  </span>
                </div>

                {/* Simulated Graphic Canvas */}
                <div
                  ref={canvasRef}
                  className={`w-full ${aspectClass} rounded-2xl relative overflow-hidden border-2 border-slate-700/80 shadow-2xl p-6 flex flex-col justify-between transition-all select-none`}
                  style={{
                    background: currentAsset.backgroundGradient || currentAsset.backgroundColor,
                  }}
                >
                  {/* Layers Rendered */}
                  {currentAsset.layers.map((ly) => {
                    const isSelected = activeLayerId === ly.id;

                    if (ly.type === 'badge') {
                      return (
                        <div
                          key={ly.id}
                          onClick={() => setActiveLayerId(ly.id)}
                          className={`cursor-pointer transition-all ${
                            isSelected ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-slate-900' : ''
                          }`}
                          style={{
                            position: 'absolute',
                            left: `${ly.xPercent}%`,
                            top: `${ly.yPercent}%`,
                          }}
                        >
                          <span
                            className="px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider inline-block shadow"
                            style={{
                              backgroundColor: ly.backgroundColor || '#16A34A',
                              color: ly.fontColor || '#FFFFFF',
                            }}
                          >
                            {ly.text}
                          </span>
                        </div>
                      );
                    }

                    if (ly.type === 'text_title') {
                      return (
                        <div
                          key={ly.id}
                          onClick={() => setActiveLayerId(ly.id)}
                          className={`cursor-pointer transition-all ${
                            isSelected ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-slate-900 rounded' : ''
                          }`}
                          style={{
                            position: 'absolute',
                            left: `${ly.xPercent}%`,
                            top: `${ly.yPercent}%`,
                            width: ly.widthPercent ? `${ly.widthPercent}%` : '85%',
                          }}
                        >
                          <h2
                            className="font-bold tracking-tight leading-tight"
                            style={{
                              fontSize: `${ly.fontSize ? Math.min(ly.fontSize * 0.75, 26) : 22}px`,
                              color: ly.fontColor || '#FFFFFF',
                            }}
                          >
                            {ly.text}
                          </h2>
                        </div>
                      );
                    }

                    if (ly.type === 'text_body') {
                      return (
                        <div
                          key={ly.id}
                          onClick={() => setActiveLayerId(ly.id)}
                          className={`cursor-pointer transition-all ${
                            isSelected ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-slate-900 rounded' : ''
                          }`}
                          style={{
                            position: 'absolute',
                            left: `${ly.xPercent}%`,
                            top: `${ly.yPercent}%`,
                            width: ly.widthPercent ? `${ly.widthPercent}%` : '85%',
                          }}
                        >
                          <p
                            className="leading-relaxed opacity-90"
                            style={{
                              fontSize: `${ly.fontSize ? Math.min(ly.fontSize * 0.8, 14) : 12}px`,
                              color: ly.fontColor || '#E2E8F0',
                            }}
                          >
                            {ly.text}
                          </p>
                        </div>
                      );
                    }

                    if (ly.type === 'button_cta') {
                      return (
                        <div
                          key={ly.id}
                          onClick={() => setActiveLayerId(ly.id)}
                          className={`cursor-pointer transition-all ${
                            isSelected ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-slate-900' : ''
                          }`}
                          style={{
                            position: 'absolute',
                            left: `${ly.xPercent}%`,
                            top: `${ly.yPercent}%`,
                          }}
                        >
                          <span
                            className="px-3.5 py-1.5 rounded-lg text-[10px] font-bold tracking-wider inline-block shadow-lg"
                            style={{
                              backgroundColor: ly.backgroundColor || '#0284C7',
                              color: ly.fontColor || '#FFFFFF',
                            }}
                          >
                            {ly.text}
                          </span>
                        </div>
                      );
                    }

                    return null;
                  })}

                  <div className="absolute right-4 bottom-4 text-[9px] font-bold uppercase tracking-widest text-white/40 pointer-events-none">
                    {brand?.tradingName || 'AGUERO INOX'}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <button
                    onClick={handleAddTextLayer}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium inline-flex items-center space-x-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Adicionar Camada</span>
                  </button>
                  <button
                    onClick={handleSave}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium inline-flex items-center space-x-1 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Salvar Peça</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Side: AI Generator & Variações Visuais (7 Cols) */}
            <div className="lg:col-span-7 space-y-5">
              {/* AI Generator Box */}
              <div className="p-4 rounded-xl border border-blue-500/30 bg-gradient-to-r from-slate-900 to-blue-950/40 space-y-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center space-x-1.5">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <span>Gerar Variações Visuais por IA</span>
                  </span>
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={handleGenerateAi}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition shadow cursor-pointer disabled:opacity-50"
                  >
                    {isGenerating ? 'Criando Variações...' : 'Gerar com Gemini'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div className="sm:col-span-3">
                    <label className="text-[11px] text-slate-400 block mb-1">Tema da Comunicação *</label>
                    <input
                      type="text"
                      value={themeInput}
                      onChange={(e) => setThemeInput(e.target.value)}
                      placeholder="Ex: Abril Verde, Solda TIG em Inox 316L, SIPAT 2026..."
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Público-Alvo</label>
                    <select
                      value={audience}
                      onChange={(e) => setAudience(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs cursor-pointer"
                    >
                      <option value="interno_colaboradores">Colaboradores da Fábrica</option>
                      <option value="interno_lideranca">Liderança e Supervisores</option>
                      <option value="externo_clientes">Clientes Industriais (B2B)</option>
                      <option value="externo_parceiros">Parceiros e Fornecedores</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Tom de Voz</label>
                    <select
                      value={toneOfVoice}
                      onChange={(e) => setToneOfVoice(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs cursor-pointer"
                    >
                      <option value="profissional">Profissional & Técnico</option>
                      <option value="motivacional">Motivacional & Cuidado</option>
                      <option value="institucional">Institucional</option>
                      <option value="comercial">Comercial / Vendas</option>
                      <option value="descontraido">Descontraído / Comemoração</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Gradiente de Fundo</label>
                    <select
                      onChange={(e) =>
                        setCurrentAsset((prev) => ({ ...prev, backgroundGradient: e.target.value }))
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs cursor-pointer"
                    >
                      <option value="linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%)">Azul Industrial / Marinho</option>
                      <option value="linear-gradient(135deg, #064E3B 0%, #0F172A 100%)">Abril Verde / Floresta</option>
                      <option value="linear-gradient(135deg, #4C0519 0%, #0F172A 100%)">Vermelho / Alerta Técnico</option>
                      <option value="linear-gradient(135deg, #0284C7 0%, #090D16 100%)">Cyan Metálico Inox</option>
                      <option value="linear-gradient(135deg, #18181B 0%, #27272A 100%)">Monocromático Escuro</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Variações Visuais Geradas por IA */}
              {currentAsset.variations && currentAsset.variations.length > 0 && (
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                      <Wand2 className="w-4 h-4 text-purple-400" />
                      <span>Variações Visuais Geradas ({currentAsset.variations.length})</span>
                    </span>
                    <span className="text-[11px] text-slate-500">Clique para aplicar</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {currentAsset.variations.map((v) => {
                      const isSelected = selectedVariationId === v.id;
                      return (
                        <div
                          key={v.id}
                          onClick={() => handleApplyVariation(v)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer text-xs space-y-2 flex flex-col justify-between ${
                            isSelected
                              ? 'bg-blue-950/40 border-blue-500 ring-1 ring-blue-500 shadow-md'
                              : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span
                                className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase truncate"
                                style={{
                                  backgroundColor: v.badgeColor || '#0284C7',
                                  color: '#FFFFFF',
                                }}
                              >
                                {v.badgeText || 'CONCEITO'}
                              </span>
                              {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />}
                            </div>
                            <h4 className="font-bold text-white text-[11px] line-clamp-1">{v.name}</h4>
                            <p className="text-[10px] text-slate-300 font-medium line-clamp-1">"{v.headline}"</p>
                          </div>

                          <div
                            className="w-full h-3 rounded-md shadow-inner"
                            style={{ background: v.backgroundGradient || v.backgroundColor || '#0F172A' }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Layer Inspector & Text Editor */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                    <Layers className="w-4 h-4 text-blue-400" />
                    <span>Camadas de Conteúdo ({currentAsset.layers.length})</span>
                  </span>
                  {activeLayerId && (
                    <button
                      onClick={() => handleDeleteLayer(activeLayerId)}
                      className="text-xs text-rose-400 hover:text-rose-300 inline-flex items-center space-x-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Excluir Camada</span>
                    </button>
                  )}
                </div>

                <div className="space-y-2.5">
                  {currentAsset.layers.map((ly, idx) => {
                    const isSelected = activeLayerId === ly.id;

                    return (
                      <div
                        key={ly.id}
                        onClick={() => setActiveLayerId(ly.id)}
                        className={`p-3 rounded-lg border transition text-xs space-y-2 ${
                          isSelected
                            ? 'bg-blue-950/30 border-blue-500/70'
                            : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-blue-400 uppercase font-mono">
                            #{idx + 1} {ly.type.replace('_', ' ')}
                          </span>
                        </div>

                        <textarea
                          rows={2}
                          value={ly.text || ''}
                          onChange={(e) => updateLayerText(ly.id, e.target.value)}
                          placeholder="Texto da camada..."
                          className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
