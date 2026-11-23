import React, { useState } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  Clock,
  ArrowRight,
  Send,
  Sparkles,
  PhoneCall,
  Check,
  AlertCircle,
  HelpCircle,
  Zap,
  Target,
  FileCheck,
  ThumbsUp,
  Award,
  Users2,
  MessageSquare,
  Building,
  Home,
  Briefcase,
  Store,
  Sun,
  Moon,
} from "lucide-react";
import { GatLogo } from "../components/common/GatLogo";
import { useTheme } from "../contexts/ThemeContext";
import { apiFetch } from '../apiAuthFetch';

interface PublicLandingPageProps {
  onNavigateLogin: () => void;
  onRetestSecurity?: () => void;
}

export const PublicLandingPage: React.FC<PublicLandingPageProps> = ({
  onNavigateLogin,
  onRetestSecurity,
}) => {
  const { theme, toggleTheme } = useTheme();
  // Interactive Solution Explorer tab
  const [selectedSolution, setSelectedSolution] = useState<
    "urgente" | "preventiva" | "instalacao" | "continuo" | "vistoria"
  >("urgente");

  // Contact / Demand Form state
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    serviceType: "urgente",
    description: "",
  });
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    setFormSubmitting(true);

    try {
      const res = await apiFetch("/api/leads/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          phone: formData.phone,
          email: formData.email,
          company: "Demanda via Portal GAT",
          role: formData.serviceType,
          employees: "1-10",
          message: `[Tipo: ${formData.serviceType}] ${formData.description}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao registrar sua solicitação.");
      }

      setFormSuccess(
        "Solicitação recebida com sucesso! Nossa equipe técnica entrará em contato rapidamente para apresentar a solução ideal.",
      );
      setFormData({
        name: "",
        phone: "",
        email: "",
        serviceType: "urgente",
        description: "",
      });
    } catch (err: any) {
      setFormError(
        err.message ||
          "Falha ao registrar solicitação. Tente novamente em instantes.",
      );
    } finally {
      setFormSubmitting(false);
    }
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 font-sans selection:bg-blue-600 selection:text-white">
      {/* ==================== TOP NAVIGATION ==================== */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-[#070B14]/85 border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Logo GAT */}
          <div
            className="flex items-center space-x-3 cursor-pointer py-1"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <GatLogo size="md" />
            <div className="hidden sm:block border-l border-slate-700/80 pl-3">
              <span className="block text-xs font-bold tracking-wider text-white uppercase">
                Soluções & Atendimento
              </span>
              <span className="block text-[10px] text-cyan-400 font-medium">
                Gestão e Execução Especializada
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-7 text-xs sm:text-sm font-medium text-slate-300">
            <button
              onClick={() => scrollToSection("como-funciona")}
              className="hover:text-cyan-400 transition-colors cursor-pointer"
            >
              Como Funciona
            </button>
            <button
              onClick={() => scrollToSection("solucoes")}
              className="hover:text-cyan-400 transition-colors cursor-pointer"
            >
              Soluções
            </button>
            <button
              onClick={() => scrollToSection("para-quem")}
              className="hover:text-cyan-400 transition-colors cursor-pointer"
            >
              Para Quem É
            </button>
            <button
              onClick={() => scrollToSection("diferenciais")}
              className="hover:text-cyan-400 transition-colors cursor-pointer"
            >
              Diferenciais
            </button>
            <button
              onClick={() => scrollToSection("solicitar")}
              className="hover:text-cyan-400 transition-colors cursor-pointer"
            >
              Solicitar Atendimento
            </button>
          </nav>

          {/* Action CTAs */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Alternar para Modo Claro' : 'Alternar para Modo Escuro (Padrão)'}
              className="flex items-center space-x-1.5 text-xs px-2.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700/70 transition-all cursor-pointer shadow-sm"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-4 h-4 text-amber-400" />
                  <span className="hidden sm:inline text-xs font-medium text-slate-300">Claro</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-indigo-400" />
                  <span className="hidden sm:inline text-xs font-medium text-slate-200">Escuro</span>
                </>
              )}
            </button>

            <button
              onClick={() => scrollToSection("solicitar")}
              className="hidden lg:inline-flex text-xs font-semibold px-4 py-2.5 rounded-lg bg-gradient-to-r from-cyan-500/10 to-blue-600/10 hover:from-cyan-500/20 hover:to-blue-600/20 text-cyan-300 border border-cyan-500/30 transition-all cursor-pointer"
            >
              Pedir Solução
            </button>
            <button
              onClick={onNavigateLogin}
              className="inline-flex items-center space-x-2 text-xs sm:text-sm font-semibold px-4 sm:px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
            >
              <span>Acessar Plataforma</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ==================== HERO SECTION ==================== */}
      <section className="relative pt-16 sm:pt-24 pb-24 overflow-hidden">
        {/* Glow ambient backdrops matching GAT blue/cyan identity */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-blue-600/15 blur-[160px] pointer-events-none rounded-full" />
        <div className="absolute top-1/3 left-1/4 w-[450px] h-[300px] bg-cyan-500/15 blur-[140px] pointer-events-none rounded-full" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          {/* Badge */}
          <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-slate-900/90 border border-cyan-500/30 text-xs font-semibold text-cyan-300 mb-8 shadow-inner shadow-cyan-500/10">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              Você tem uma necessidade. A GAT entrega a solução completa.
            </span>
          </div>

          {/* Main Title - Universal & Problem-Solving */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-tight sm:leading-tight">
            Tem um problema para resolver?{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-400">
              A GAT cuida de tudo para você.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-base sm:text-lg lg:text-xl text-slate-300 max-w-3xl mx-auto leading-relaxed">
            De demandas imediatas a serviços contínuos, conectamos agilidade,
            profissionais qualificados e acompanhamento transparente do início
            ao fim. Sem complicação, sem retrabalho.
          </p>

          {/* Call to Actions */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => scrollToSection("solicitar")}
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-sm sm:text-base shadow-xl shadow-blue-600/30 transition-all flex items-center justify-center space-x-2 cursor-pointer"
            >
              <span>Quero Resolver Meu Problema</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => scrollToSection("como-funciona")}
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 font-semibold text-sm sm:text-base border border-slate-700/80 transition-all cursor-pointer"
            >
              Ver Como Funciona
            </button>
          </div>

          {/* Trust Highlights */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs sm:text-sm text-slate-400">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>Atendimento Rápido e Sem Burocracia</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>Acompanhamento em Tempo Real</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>Garantia de Qualidade e Conformidade</span>
            </div>
          </div>

          {/* Visual Showcase Card */}
          <div className="mt-16 max-w-5xl mx-auto">
            <div className="rounded-2xl border border-slate-800 bg-[#0E1424] p-3 sm:p-5 shadow-2xl relative overflow-hidden">
              {/* Demo Badge */}
              <div className="bg-cyan-950/40 border border-cyan-800/30 py-2.5 px-4 rounded-xl flex items-center justify-between text-xs font-medium text-cyan-300 mb-3">
                <span className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  <span>
                    Ambiente de Acompanhamento GAT — Transparência Total
                  </span>
                </span>
                <span className="text-slate-400 text-[11px] hidden sm:inline">
                  Visualização da jornada da sua solicitação
                </span>
              </div>

              {/* Mockup Experience */}
              <div className="bg-[#090D18] p-4 sm:p-6 rounded-xl border border-slate-800/80 text-left">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Step status 1 */}
                  <div className="p-4 rounded-xl bg-[#10172A] border border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        Sua Solicitação
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 font-semibold border border-emerald-800/50">
                        Confirmada
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-white">
                      Chamado de Atendimento #1042
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Demanda registrada e direcionada para a equipe
                      especializada.
                    </p>
                    <div className="mt-3 text-[11px] text-cyan-400 font-mono">
                      Tempo de resposta: imediato
                    </div>
                  </div>

                  {/* Step status 2 */}
                  <div className="p-4 rounded-xl bg-[#10172A] border border-blue-900/40 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-2 h-full bg-blue-500" />
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider">
                        Em Execução
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 font-semibold border border-blue-800/50">
                        Em Andamento
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-white">
                      Equipe Técnica Alocada
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Profissional responsável em atuação com checklist de
                      conformidade.
                    </p>
                    <div className="mt-3 text-[11px] text-slate-300 flex items-center space-x-1.5">
                      <Clock className="w-3.5 h-3.5 text-blue-400" />
                      <span>Previsão de entrega dentro do combinado</span>
                    </div>
                  </div>

                  {/* Step status 3 */}
                  <div className="p-4 rounded-xl bg-[#10172A] border border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        Entrega & Relatório
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold">
                        Garantia Ativa
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-white">
                      Validação e Encerramento
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Registro de evidências fotográficas, aprovação do cliente
                      e suporte contínuo.
                    </p>
                    <div className="mt-3 text-[11px] text-emerald-400 flex items-center space-x-1">
                      <Check className="w-3.5 h-3.5" />
                      <span>Satisfação 100% assegurada</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== DORES DO CLIENTE (O QUE A GAT RESOLVE) ==================== */}
      <section className="py-20 bg-[#0B0F1C] border-t border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-xs font-bold tracking-widest text-cyan-400 uppercase">
              O Que Costuma Travar o Seu Dia a Dia?
            </h2>
            <p className="mt-3 text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
              Contratar ou resolver serviços não precisa ser uma dor de cabeça
            </p>
            <p className="mt-4 text-sm sm:text-base text-slate-400 leading-relaxed">
              Você já passou pela frustração de pedir um serviço e não saber
              quem vai fazer, quando vai ficar pronto ou se o resultado vai
              durar? A GAT foi criada exatamente para mudar essa realidade.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-6 rounded-2xl bg-[#0E1424] border border-slate-800 hover:border-slate-700 transition-all">
              <div className="w-10 h-10 rounded-xl bg-red-950/60 border border-red-800/40 text-red-400 flex items-center justify-center mb-4">
                <AlertCircle className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">
                Demora e Falta de Retorno
              </h3>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                Mensagens perdidas em canais informais, orçamentos que nunca
                chegam e pedidos esquecidos.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#0E1424] border border-slate-800 hover:border-slate-700 transition-all">
              <div className="w-10 h-10 rounded-xl bg-amber-950/60 border border-amber-800/40 text-amber-400 flex items-center justify-center mb-4">
                <Clock className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">
                Incerteza Sobre Prazos
              </h3>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                Prazos combinados que não são cumpridos, gerando atrasos em
                cascata para sua rotina ou empresa.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#0E1424] border border-slate-800 hover:border-slate-700 transition-all">
              <div className="w-10 h-10 rounded-xl bg-purple-950/60 border border-purple-800/40 text-purple-400 flex items-center justify-center mb-4">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">
                Trabalho Sem Padrão
              </h3>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                Serviços feitos pela metade, sem método rigoroso, exigindo
                retrabalho e novos custos.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#0E1424] border border-slate-800 hover:border-slate-700 transition-all">
              <div className="w-10 h-10 rounded-xl bg-blue-950/60 border border-blue-800/40 text-blue-400 flex items-center justify-center mb-4">
                <FileCheck className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">
                Falta de Histórico e Comprovação
              </h3>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                Você não tem relatório do que foi executado, dificultando
                prestação de contas ou garantia.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== COMO A GAT RESOLVE (JORNADA EM 4 ETAPAS) ==================== */}
      <section id="como-funciona" className="py-20 bg-[#070B14]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-xs font-bold tracking-widest text-cyan-400 uppercase">
              Método Descomplicado
            </h2>
            <p className="mt-3 text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
              Como funciona a resolução com a GAT
            </p>
            <p className="mt-4 text-sm sm:text-base text-slate-400">
              Transformamos a sua necessidade em um serviço concluído com 4
              etapas transparentes:
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="p-6 rounded-2xl bg-[#0E1424] border border-slate-800 relative">
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 font-extrabold flex items-center justify-center text-sm mb-4">
                01
              </div>
              <h3 className="text-base font-bold text-white">
                Você Traz a Demanda
              </h3>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                Basta preencher nosso canal ou solicitar atendimento. Entendemos
                o que você precisa resolver sem formulários complicados.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#0E1424] border border-slate-800 relative">
              <div className="w-10 h-10 rounded-xl bg-cyan-600/20 border border-cyan-500/30 text-cyan-400 font-extrabold flex items-center justify-center text-sm mb-4">
                02
              </div>
              <h3 className="text-base font-bold text-white">
                Diagnóstico & Direcionamento
              </h3>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                Avaliamos o escopo, planejamos a melhor intervenção e
                mobilizamos os profissionais adequados com prazos definidos.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#0E1424] border border-slate-800 relative">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 font-extrabold flex items-center justify-center text-sm mb-4">
                03
              </div>
              <h3 className="text-base font-bold text-white">
                Execução com Excelência
              </h3>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                A equipe realiza o serviço seguindo critérios de qualidade, com
                você acompanhando cada atualização sem surpresas.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#0E1424] border border-slate-800 relative">
              <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 font-extrabold flex items-center justify-center text-sm mb-4">
                04
              </div>
              <h3 className="text-base font-bold text-white">
                Validação & Garantia
              </h3>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                Conferência final junto a você, registro de conclusão e suporte
                assegurado para sua total tranquilidade.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== SOLUÇÕES ABRANGENTES (PÚBLICO TOTAL) ==================== */}
      <section
        id="solucoes"
        className="py-20 bg-[#0B0F1C] border-t border-slate-800/80"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-xs font-bold tracking-widest text-cyan-400 uppercase">
              Soluções Completas
            </h2>
            <p className="mt-3 text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
              O que a GAT resolve para você?
            </p>
            <p className="mt-4 text-sm sm:text-base text-slate-400">
              Atendemos diferentes perfis de necessidades com a mesma dedicação
              e precisão técnica.
            </p>
          </div>

          {/* Interactive Selector Buttons */}
          <div className="mt-10 flex flex-wrap justify-center gap-2 sm:gap-3">
            {[
              { id: "urgente", label: "Atendimento Rápido & Corretivo" },
              { id: "preventiva", label: "Cuidados Periódicos & Preventivos" },
              { id: "instalacao", label: "Instalações & Melhorias" },
              { id: "continuo", label: "Gestão Contínua de Demandas" },
              { id: "vistoria", label: "Vistorias & Diagnósticos" },
            ].map((sol) => (
              <button
                key={sol.id}
                onClick={() => setSelectedSolution(sol.id as any)}
                className={`px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  selectedSolution === sol.id
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-500"
                    : "bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800"
                }`}
              >
                {sol.label}
              </button>
            ))}
          </div>

          {/* Solution Details Display */}
          <div className="mt-8 max-w-4xl mx-auto bg-[#0E1424] border border-slate-800 rounded-2xl p-6 sm:p-8">
            {selectedSolution === "urgente" && (
              <div className="space-y-4">
                <div className="flex items-center space-x-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
                  <Zap className="w-4 h-4" />
                  <span>Agilidade Máxima</span>
                </div>
                <h3 className="text-2xl font-bold text-white">
                  Resolução Imediata de Imprevistos e Falhas
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Para quando você se depara com um problema que não pode
                  esperar: parada de operação, falhas elétricas ou hidráulicas,
                  danos físicos ou necessidades urgentes. Mobilizamos nossa
                  equipe técnica para diagnosticar e solucionar com agilidade
                  prioritária.
                </p>
                <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-300">
                  <div className="flex items-center space-x-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>Priorização imediata de atendimento</span>
                  </div>
                  <div className="flex items-center space-x-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>Equipe pronta com instrumental necessário</span>
                  </div>
                </div>
              </div>
            )}

            {selectedSolution === "preventiva" && (
              <div className="space-y-4">
                <div className="flex items-center space-x-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Tranquilidade Programada</span>
                </div>
                <h3 className="text-2xl font-bold text-white">
                  Manutenção Preventiva para Evitar Paradas e Gastos Altos
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  O melhor jeito de resolver um problema é não deixar que ele
                  aconteça. Desenvolvemos rotinas de revisão, inspeção
                  preventiva e conservação para que você nunca seja pego de
                  surpresa por falhas graves.
                </p>
                <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-300">
                  <div className="flex items-center space-x-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Cronogramas sob medida para sua conveniência</span>
                  </div>
                  <div className="flex items-center space-x-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Redução drástica de despesas emergenciais</span>
                  </div>
                </div>
              </div>
            )}

            {selectedSolution === "instalacao" && (
              <div className="space-y-4">
                <div className="flex items-center space-x-2 text-blue-400 font-bold text-xs uppercase tracking-wider">
                  <Target className="w-4 h-4" />
                  <span>Projetos & Estruturação</span>
                </div>
                <h3 className="text-2xl font-bold text-white">
                  Instalações, Adequações e Melhorias de Espaços
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Precisa adaptar um espaço, instalar novos equipamentos,
                  modernizar instalações ou fazer adequações técnicas? Cuidamos
                  do projeto, da logística e da execução com acabamento
                  impecável.
                </p>
                <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-300">
                  <div className="flex items-center space-x-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                    <Check className="w-4 h-4 text-blue-400 shrink-0" />
                    <span>
                      Planejamento de escopo sem surpresas no orçamento
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                    <Check className="w-4 h-4 text-blue-400 shrink-0" />
                    <span>Profissionais experientes e supervisão ativa</span>
                  </div>
                </div>
              </div>
            )}

            {selectedSolution === "continuo" && (
              <div className="space-y-4">
                <div className="flex items-center space-x-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
                  <Briefcase className="w-4 h-4" />
                  <span>Operação Sem Preocupações</span>
                </div>
                <h3 className="text-2xl font-bold text-white">
                  Apoio Contínuo e Gestão de Demandas do Dia a Dia
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Para quem precisa de um parceiro fixo cuidando das rotinas e
                  serviços com canal direto e exclusivo. Centralizamos todos os
                  chamados da sua empresa, espaço ou unidade para que você foque
                  100% no seu negócio principal.
                </p>
                <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-300">
                  <div className="flex items-center space-x-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                    <Check className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>Canal dedicado para solicitações rápidas</span>
                  </div>
                  <div className="flex items-center space-x-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                    <Check className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>Relatórios mensais de atendimentos e melhorias</span>
                  </div>
                </div>
              </div>
            )}

            {selectedSolution === "vistoria" && (
              <div className="space-y-4">
                <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                  <FileCheck className="w-4 h-4" />
                  <span>Conformidade & Laudos</span>
                </div>
                <h3 className="text-2xl font-bold text-white">
                  Vistorias Técnicas, Diagnósticos e Checagem Geral
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Quer saber o real estado das suas instalações antes de alugar,
                  vender ou iniciar uma operação? Realizamos auditorias
                  detalhadas com registro fotográfico e checklist minucioso.
                </p>
                <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-300">
                  <div className="flex items-center space-x-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                    <Check className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      Relatório digital completo com recomendações práticas
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                    <Check className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Diagnóstico claro sem jargões confusos</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ==================== PARA QUEM É A GAT (PÚBLICO TOTAL) ==================== */}
      <section id="para-quem" className="py-20 bg-[#070B14]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-xs font-bold tracking-widest text-cyan-400 uppercase">
              Para Qualquer Perfil
            </h2>
            <p className="mt-3 text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
              Feito para quem valoriza tempo, qualidade e tranquilidade
            </p>
            <p className="mt-4 text-sm sm:text-base text-slate-400">
              Não importa o tamanho da sua necessidade, a GAT adapta o formato
              de atendimento:
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-6 rounded-2xl bg-[#0E1424] border border-slate-800">
              <div className="w-12 h-12 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mb-4">
                <Briefcase className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">
                Empresas & Negócios
              </h3>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                Mantenha seu escritório, filial ou sede operacional funcionando
                sem interrupções e sem desviar sua equipe do trabalho.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#0E1424] border border-slate-800">
              <div className="w-12 h-12 rounded-xl bg-cyan-600/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mb-4">
                <Building className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">
                Condomínios & Prédios
              </h3>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                Apoio ágil para síndicos e administradoras em manutenções
                prediais, vistorias e conservação de áreas comuns.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#0E1424] border border-slate-800">
              <div className="w-12 h-12 rounded-xl bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4">
                <Store className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">
                Comércio & Varejo
              </h3>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                Lojas e pontos de atendimento que exigem reparos rápidos e
                padronização visual para atender bem seus clientes.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#0E1424] border border-slate-800">
              <div className="w-12 h-12 rounded-xl bg-purple-600/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mb-4">
                <Home className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">
                Demandas Particulares
              </h3>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                Para quem busca profissionais de confiança, pontualidade
                rigorosa e serviço com garantia em seu espaço particular.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== DIFERENCIAIS DA GAT ==================== */}
      <section
        id="diferenciais"
        className="py-20 bg-[#0B0F1C] border-t border-slate-800/80"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-xs font-bold tracking-widest text-cyan-400 uppercase">
              Por Que Confiar na GAT
            </h2>
            <p className="mt-3 text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
              O que nos torna a escolha certa para a sua demanda
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-[#0E1424] border border-slate-800">
              <div className="w-10 h-10 rounded-xl bg-cyan-600/20 text-cyan-400 flex items-center justify-center mb-4">
                <PhoneCall className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">
                Canal Direto & Atendimento Humanizado
              </h3>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                Você fala com quem resolve. Nada de atendimentos robotizados sem
                solução prática ou espera desnecessária.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#0E1424] border border-slate-800">
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center mb-4">
                <Award className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">
                Profissionais Qualificados
              </h3>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                Equipes selecionadas e treinadas para agir com respeito ao seu
                espaço, normas técnicas e acabamento de alto nível.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#0E1424] border border-slate-800">
              <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center mb-4">
                <ThumbsUp className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">
                Garantia e Satisfação Assegurada
              </h3>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                Só consideramos o trabalho encerrado quando você valida o
                resultado. Garantia e compromisso com a sua tranquilidade.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== FORMULÁRIO DE SOLICITAÇÃO (CONVERSÃO DIRETA) ==================== */}
      <section id="solicitar" className="py-24 bg-[#070B14] relative">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="bg-[#0E1424] border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden">
            {/* Top gradient strip */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500" />

            <div className="text-center max-w-2xl mx-auto mb-8">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-800/40 text-cyan-400 text-xs font-semibold mb-3">
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Atendimento Rápido</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
                Conte para a GAT o que você precisa resolver
              </h2>
              <p className="mt-2 text-xs sm:text-sm text-slate-400 leading-relaxed">
                Preencha os campos abaixo com uma breve descrição da sua
                necessidade. Nossa equipe entrará em contato para apresentar a
                melhor solução.
              </p>
            </div>

            {formSuccess && (
              <div className="mb-6 p-4 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-xs sm:text-sm flex items-start space-x-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <span>{formSuccess}</span>
              </div>
            )}

            {formError && (
              <div className="mb-6 p-4 rounded-xl bg-red-950/60 border border-red-800/60 text-red-300 text-xs sm:text-sm flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleContactSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Seu Nome Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Como podemos te chamar?"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    WhatsApp ou Telefone *
                  </label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                    placeholder="(00) 00000-0000"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    E-mail para Contato
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    placeholder="seuemail@exemplo.com"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Tipo de Necessidade *
                  </label>
                  <select
                    value={formData.serviceType}
                    onChange={(e) =>
                      setFormData({ ...formData, serviceType: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-xs focus:outline-none focus:border-cyan-400 transition-colors cursor-pointer"
                  >
                    <option value="urgente">
                      Preciso de Atendimento Urgente / Imprevisto
                    </option>
                    <option value="preventiva">
                      Quero Prevenção / Cuidados Periódicos
                    </option>
                    <option value="instalacao">
                      Instalação, Reforma ou Adequação
                    </option>
                    <option value="continuo">
                      Apoio Contínuo para Meu Espaço ou Empresa
                    </option>
                    <option value="vistoria">
                      Vistoria Técnica ou Diagnóstico
                    </option>
                    <option value="outro">
                      Outra Necessidade / Falar com Especialista
                    </option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Conte um pouco sobre o problema ou demanda *
                </label>
                <textarea
                  rows={3}
                  required
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Ex: Estou com uma demanda na minha loja/empresa e preciso de uma equipe para resolver..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 transition-colors resize-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold text-xs sm:text-sm shadow-xl shadow-cyan-600/20 transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
                >
                  {formSubmitting ? (
                    <span>Registrando solicitação...</span>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Enviar Solicitação de Solução</span>
                    </>
                  )}
                </button>
              </div>

              <p className="text-[11px] text-slate-400 text-center pt-1">
                Seus dados serão utilizados exclusivamente para contato técnico
                e elaboração da proposta de atendimento.
              </p>
            </form>
          </div>
        </div>
      </section>

      {/* ==================== FOOTER ==================== */}
      <footer className="py-12 bg-[#050811] border-t border-slate-800 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center space-x-3">
              <GatLogo size="sm" />
              <span className="text-slate-400 text-xs">
                GAT — Soluções, Atendimento & Gestão Operacional
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
              <button
                onClick={() => scrollToSection("como-funciona")}
                className="hover:text-cyan-400 transition-colors cursor-pointer"
              >
                Como Funciona
              </button>
              <button
                onClick={() => scrollToSection("solucoes")}
                className="hover:text-cyan-400 transition-colors cursor-pointer"
              >
                Soluções
              </button>
              <button
                onClick={() => scrollToSection("solicitar")}
                className="hover:text-cyan-400 transition-colors cursor-pointer"
              >
                Fale Conosco
              </button>
              <button
                onClick={onNavigateLogin}
                className="text-cyan-400 hover:text-cyan-300 font-semibold transition-colors cursor-pointer"
              >
                Área do Cliente / Acesso à Plataforma
              </button>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-800/60 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 gap-4">
            <p>
              © {new Date().getFullYear()} GAT. Todos os direitos reservados.
            </p>
            <div className="flex items-center space-x-2 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                Conexão Segura HTTPS (SSL/TLS 256-bit) • Protegido por
                Cloudflare
              </span>
              {onRetestSecurity && (
                <button
                  type="button"
                  onClick={onRetestSecurity}
                  className="ml-2 text-slate-400 hover:text-cyan-400 underline transition-colors cursor-pointer text-[10px]"
                  title="Executar verificação de navegador novamente"
                >
                  Checar navegador
                </button>
              )}
            </div>
            <p>Atendimento especializado e gestão com padrão de excelência.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};
