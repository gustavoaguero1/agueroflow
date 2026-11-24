import React, { useState, useEffect } from 'react';
import { useAuth, MASTER_EMAIL } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { BrandLogo } from '../components/common/BrandLogo';
import {
  ShieldCheck,
  Lock,
  AlertCircle,
  KeyRound,
  Laptop,
  CheckCircle2,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  Sun,
  Moon,
  ChevronLeft,
} from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess: (isMaster?: boolean) => void;
}

type AuthFlowState =
  | 'idle'
  | 'authenticating'
  | 'first_access'
  | 'first_access_saving'
  | 'change_password'
  | 'change_password_saving'
  | 'change_password_success'
  | 'mfa_required'
  | 'mfa_verifying';

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const {
    user,
    signInWithGoogleAutoResolve,
    signInWithCredentials,
    setupFirstAccessPassword,
    changeUserPassword,
    isDeviceTrusted,
    confirmMfaAndTrustDevice,
    authError,
  } = useAuth();
  const { theme, toggleTheme } = useTheme();

  // Streamlined Login Fields (NO manual company field — auto-routed by email!)
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(true);

  // First Access State
  const [firstAccessData, setFirstAccessData] = useState<{
    memberId: string;
    memberName: string;
    memberEmail: string;
    orgId: string;
    orgName: string;
  } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Change Password State
  const [changeUser, setChangeUser] = useState('');
  const [changeCurrentPass, setChangeCurrentPass] = useState('');
  const [changeNewPass, setChangeNewPass] = useState('');
  const [changeConfirmPass, setChangeConfirmPass] = useState('');
  const [showChangeCurrentPass, setShowChangeCurrentPass] = useState(false);
  const [showChangeNewPass, setShowChangeNewPass] = useState(false);
  const [changeSuccessMessage, setChangeSuccessMessage] = useState<string | null>(null);

  const [flowState, setFlowState] = useState<AuthFlowState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isMasterInput = userName.toLowerCase().trim() === MASTER_EMAIL;

  useEffect(() => {
    try {
      const savedUser = localStorage.getItem('gat_saved_username');
      if (savedUser) setUserName(savedUser);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const handleCredentialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanName = userName.trim();
    const cleanPass = password.trim();

    if (!cleanName) {
      setErrorMessage('Informe seu e-mail corporativo ou nome cadastrado.');
      return;
    }

    try {
      if (rememberEmail) {
        localStorage.setItem('gat_saved_username', cleanName);
      } else {
        localStorage.removeItem('gat_saved_username');
      }
    } catch {
      // Ignore
    }

    setFlowState('authenticating');

    try {
      const res = await signInWithCredentials(cleanName, cleanPass);

      if (res.isFirstAccess && res.memberId && res.orgId) {
        setFirstAccessData({
          memberId: res.memberId,
          memberName: res.memberName || cleanName,
          memberEmail: res.memberEmail || cleanName,
          orgId: res.orgId,
          orgName: res.orgName || 'Sua Empresa',
        });
        if (cleanPass) {
          setNewPassword(cleanPass);
          setConfirmPassword(cleanPass);
        }
        setFlowState('first_access');
        return;
      }

      if (!res.success) {
        setFlowState('idle');
        setErrorMessage(res.error || 'Não foi possível validar suas credenciais.');
        return;
      }

      if (res.isMaster) {
        onLoginSuccess(true);
        return;
      }

      if (!isDeviceTrusted) {
        setFlowState('mfa_required');
      } else {
        onLoginSuccess(false);
      }
    } catch (err: any) {
      setFlowState('idle');
      setErrorMessage(err?.message || 'Falha ao autenticar. Tente novamente.');
    }
  };

  const handleGoogleSubmit = async () => {
    setErrorMessage(null);
    setFlowState('authenticating');

    try {
      const res = await signInWithGoogleAutoResolve();
      if (!res.authorized) {
        setFlowState('idle');
        if (res.error) setErrorMessage(res.error);
        return;
      }

      if (res.isMaster) {
        onLoginSuccess(true);
        return;
      }

      if (!isDeviceTrusted) {
        setFlowState('mfa_required');
      } else {
        onLoginSuccess(false);
      }
    } catch (err: any) {
      setFlowState('idle');
      setErrorMessage(err?.message || 'Falha ao autenticar com o Google.');
    }
  };

  const handleInitiateFirstAccess = async () => {
    setErrorMessage(null);
    const cleanName = userName.trim();
    if (!cleanName) {
      setErrorMessage('Informe seu e-mail cadastrado no campo acima para iniciar o primeiro acesso.');
      return;
    }

    setFlowState('authenticating');
    try {
      const res = await signInWithCredentials(cleanName, '');
      if (res.isFirstAccess && res.memberId && res.orgId) {
        setFirstAccessData({
          memberId: res.memberId,
          memberName: res.memberName || cleanName,
          memberEmail: res.memberEmail || cleanName,
          orgId: res.orgId,
          orgName: res.orgName || 'Sua Empresa',
        });
        setFlowState('first_access');
      } else if (res.success) {
        onLoginSuccess(Boolean(res.isMaster));
      } else {
        setFlowState('idle');
        setErrorMessage(
          res.error || 'Este usuário já possui senha definida ou não está cadastrado. Informe sua senha para entrar.'
        );
      }
    } catch (err: any) {
      setFlowState('idle');
      setErrorMessage(err?.message || 'Erro ao verificar primeiro acesso.');
    }
  };

  const handleSetupFirstAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstAccessData) return;
    setErrorMessage(null);

    if (!newPassword || newPassword.length < 6) {
      setErrorMessage('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('As senhas digitadas não conferem.');
      return;
    }

    setFlowState('first_access_saving');
    try {
      const res = await setupFirstAccessPassword(
        firstAccessData.memberId,
        firstAccessData.orgId,
        newPassword
      );
      if (!res.success) {
        setFlowState('first_access');
        setErrorMessage(res.error || 'Não foi possível cadastrar a senha.');
        return;
      }
      onLoginSuccess(false);
    } catch (err: any) {
      setFlowState('first_access');
      setErrorMessage(err?.message || 'Erro ao salvar senha.');
    }
  };

  const handleOpenChangePassword = () => {
    setErrorMessage(null);
    setChangeSuccessMessage(null);
    setChangeUser(userName.trim());
    setChangeCurrentPass('');
    setChangeNewPass('');
    setChangeConfirmPass('');
    setFlowState('change_password');
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setChangeSuccessMessage(null);

    if (!changeUser.trim()) {
      setErrorMessage('Informe seu e-mail ou nome cadastrado.');
      return;
    }
    if (!changeCurrentPass.trim()) {
      setErrorMessage('Informe sua senha atual ou provisória.');
      return;
    }
    if (!changeNewPass.trim() || changeNewPass.trim().length < 6) {
      setErrorMessage('A nova senha deve conter no mínimo 6 caracteres.');
      return;
    }
    if (changeNewPass.trim() !== changeConfirmPass.trim()) {
      setErrorMessage('A confirmação da nova senha não confere.');
      return;
    }

    setFlowState('change_password_saving');
    try {
      const res = await changeUserPassword(
        changeUser.trim(),
        '',
        changeCurrentPass.trim(),
        changeNewPass.trim()
      );
      if (!res.success) {
        setFlowState('change_password');
        setErrorMessage(res.error || 'Falha ao alterar senha.');
        return;
      }

      setUserName(changeUser.trim());
      setPassword(changeNewPass.trim());
      setChangeSuccessMessage('Senha atualizada com sucesso. Você já pode entrar com sua nova senha.');
      setFlowState('change_password_success');
    } catch (err: any) {
      setFlowState('change_password');
      setErrorMessage(err?.message || 'Erro ao processar alteração de senha.');
    }
  };

  const handleConfirmMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setFlowState('mfa_verifying');
    setErrorMessage(null);
    try {
      const ok = await confirmMfaAndTrustDevice();
      if (ok) {
        onLoginSuccess(false);
      } else {
        setFlowState('mfa_required');
        setErrorMessage('Não foi possível registrar este dispositivo. Tente novamente.');
      }
    } catch (err: any) {
      setFlowState('mfa_required');
      setErrorMessage(err?.message || 'Erro na verificação do dispositivo.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#0B0C10] text-[#1D1D1F] dark:text-[#F5F5F7] flex flex-col justify-between selection:bg-[#0071E3] selection:text-white">
      {/* Minimal Apple Top Bar */}
      <header className="w-full max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <BrandLogo size="sm" />

        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'light' ? 'Alternar para Modo Escuro' : 'Alternar para Modo Claro'}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white/80 dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.10] text-[#424245] dark:text-[#AEAEB2] hover:text-[#1D1D1F] dark:hover:text-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors cursor-pointer"
        >
          {theme === 'light' ? (
            <>
              <Moon className="w-3.5 h-3.5 text-[#6E6E73]" />
              <span>Modo Escuro</span>
            </>
          ) : (
            <>
              <Sun className="w-3.5 h-3.5 text-[#FF9F0A]" />
              <span>Modo Claro</span>
            </>
          )}
        </button>
      </header>

      {/* Centered Serene Apple Login Card */}
      <main className="flex-1 flex items-center justify-center px-4 py-6 sm:py-10">
        <div className="w-full max-w-[432px] bg-white dark:bg-[#1C1C1E] rounded-[28px] border border-black/[0.08] dark:border-white/[0.10] shadow-[0_2px_8px_rgba(0,0,0,0.04),0_20px_50px_rgba(0,0,0,0.06)] p-7 sm:p-10">
          {/* Brand Heading */}
          <div className="text-center mb-7">
            <div className="inline-flex justify-center mb-4">
              <BrandLogo size="md" />
            </div>
            <h1 className="text-2xl font-bold tracking-[-0.025em] text-[#1D1D1F] dark:text-[#F5F5F7]">
              {flowState === 'first_access' || flowState === 'first_access_saving'
                ? 'Criar senha de acesso'
                : flowState === 'change_password' ||
                  flowState === 'change_password_saving' ||
                  flowState === 'change_password_success'
                ? 'Alterar senha'
                : flowState === 'mfa_required' || flowState === 'mfa_verifying'
                ? 'Confirmar dispositivo'
                : 'Acesso Corporativo'}
            </h1>
            <p className="text-[13px] text-[#6E6E73] dark:text-[#98989D] mt-1.5 leading-relaxed">
              {flowState === 'first_access' || flowState === 'first_access_saving'
                ? 'Defina sua senha pessoal para acessar sua empresa.'
                : flowState === 'change_password' || flowState === 'change_password_saving'
                ? 'Substitua sua senha atual ou provisória por uma nova.'
                : flowState === 'mfa_required' || flowState === 'mfa_verifying'
                ? 'Autorize este navegador para manter o acesso protegido.'
                : 'Entre com seu e-mail para acessar diretamente a sua empresa.'}
            </p>
          </div>

          {/* Inline Error Alert */}
          {(errorMessage || authError) && (
            <div className="mb-5 p-3.5 rounded-2xl bg-[#FFECEF] dark:bg-[#FF453A]/15 border border-[#D70015]/15 text-[#D70015] dark:text-[#FF6961] text-xs flex items-start space-x-2.5 leading-relaxed">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage || authError}</span>
            </div>
          )}

          {/* STATE: MFA */}
          {(flowState === 'mfa_required' || flowState === 'mfa_verifying') && (
            <form onSubmit={handleConfirmMfa} className="space-y-4">
              <div className="p-4 rounded-2xl bg-[#F5F5F7] dark:bg-[#2C2C2E] text-xs space-y-1.5">
                <div className="flex items-center space-x-2 font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                  <Laptop className="w-4 h-4 text-[#0071E3] dark:text-[#0A84FF]" />
                  <span>Novo navegador detectado</span>
                </div>
                <p className="text-[#6E6E73] dark:text-[#98989D] leading-relaxed">
                  Confirme este terminal para a conta <strong className="text-[#1D1D1F] dark:text-white">{user?.email || userName}</strong>. A autorização vale por 30 dias.
                </p>
              </div>

              <button
                type="submit"
                disabled={flowState === 'mfa_verifying'}
                className="w-full py-3 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white font-semibold text-sm transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 apple-solid-btn"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>
                  {flowState === 'mfa_verifying' ? 'Confirmando...' : 'Confiar neste dispositivo'}
                </span>
              </button>
            </form>
          )}

          {/* STATE: FIRST ACCESS */}
          {(flowState === 'first_access' || flowState === 'first_access_saving') &&
            firstAccessData && (
              <form onSubmit={handleSetupFirstAccess} className="space-y-4">
                <div className="p-4 rounded-2xl bg-[#F5F5F7] dark:bg-[#2C2C2E] text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[#6E6E73] dark:text-[#98989D]">Empresa</span>
                    <span className="font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                      {firstAccessData.orgName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#6E6E73] dark:text-[#98989D]">Colaborador</span>
                    <span className="font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                      {firstAccessData.memberName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#6E6E73] dark:text-[#98989D]">E-mail</span>
                    <span className="font-mono text-[#0071E3] dark:text-[#409CFF]">
                      {firstAccessData.memberEmail}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#424245] dark:text-[#AEAEB2] mb-1.5">
                    Nova senha (mínimo 6 caracteres)
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Digite sua nova senha"
                      className="w-full pl-10 pr-10 py-3 rounded-xl bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-black/[0.10] dark:border-white/[0.12] text-sm"
                    />
                    <Lock className="w-4 h-4 text-[#86868B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#86868B] hover:text-[#1D1D1F] dark:hover:text-white cursor-pointer"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#424245] dark:text-[#AEAEB2] mb-1.5">
                    Confirmar nova senha
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repita a nova senha"
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-black/[0.10] dark:border-white/[0.12] text-sm"
                    />
                    <Lock className="w-4 h-4 text-[#86868B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={flowState === 'first_access_saving'}
                  className="w-full py-3 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white font-semibold text-sm transition-all cursor-pointer disabled:opacity-50 apple-solid-btn"
                >
                  {flowState === 'first_access_saving' ? 'Salvando senha...' : 'Salvar e Entrar'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFlowState('idle');
                    setErrorMessage(null);
                  }}
                  className="w-full py-2 text-xs font-medium text-[#6E6E73] hover:text-[#1D1D1F] dark:hover:text-white inline-flex items-center justify-center space-x-1 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Voltar ao login</span>
                </button>
              </form>
            )}

          {/* STATE: CHANGE PASSWORD */}
          {(flowState === 'change_password' ||
            flowState === 'change_password_saving' ||
            flowState === 'change_password_success') && (
            <div className="space-y-4">
              {changeSuccessMessage ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-[#E8F8EE] dark:bg-[#30D158]/15 text-[#1E7E34] dark:text-[#30D158] text-xs flex items-start space-x-2.5 leading-relaxed">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{changeSuccessMessage}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFlowState('idle');
                      setChangeSuccessMessage(null);
                    }}
                    className="w-full py-3 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white font-semibold text-sm cursor-pointer apple-solid-btn"
                  >
                    Ir para o login
                  </button>
                </div>
              ) : (
                <form onSubmit={handleChangePasswordSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-medium text-[#424245] dark:text-[#AEAEB2] mb-1">
                      E-mail ou Nome cadastrado
                    </label>
                    <input
                      type="text"
                      required
                      value={changeUser}
                      onChange={(e) => setChangeUser(e.target.value)}
                      placeholder="seu@email.com.br"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-black/[0.10] dark:border-white/[0.12] text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#424245] dark:text-[#AEAEB2] mb-1">
                      Senha atual ou provisória
                    </label>
                    <div className="relative">
                      <input
                        type={showChangeCurrentPass ? 'text' : 'password'}
                        required
                        value={changeCurrentPass}
                        onChange={(e) => setChangeCurrentPass(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-black/[0.10] dark:border-white/[0.12] text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowChangeCurrentPass(!showChangeCurrentPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86868B] cursor-pointer"
                      >
                        {showChangeCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#424245] dark:text-[#AEAEB2] mb-1">
                      Nova senha (mínimo 6 caracteres)
                    </label>
                    <div className="relative">
                      <input
                        type={showChangeNewPass ? 'text' : 'password'}
                        required
                        minLength={6}
                        value={changeNewPass}
                        onChange={(e) => setChangeNewPass(e.target.value)}
                        placeholder="Nova senha"
                        className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-black/[0.10] dark:border-white/[0.12] text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowChangeNewPass(!showChangeNewPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86868B] cursor-pointer"
                      >
                        {showChangeNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#424245] dark:text-[#AEAEB2] mb-1">
                      Confirmar nova senha
                    </label>
                    <input
                      type={showChangeNewPass ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={changeConfirmPass}
                      onChange={(e) => setChangeConfirmPass(e.target.value)}
                      placeholder="Confirme a nova senha"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-black/[0.10] dark:border-white/[0.12] text-sm"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={flowState === 'change_password_saving'}
                    className="w-full py-3 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white font-semibold text-sm cursor-pointer disabled:opacity-50 apple-solid-btn mt-1"
                  >
                    {flowState === 'change_password_saving' ? 'Salvando...' : 'Atualizar Senha'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFlowState('idle');
                      setErrorMessage(null);
                    }}
                    className="w-full py-2 text-xs font-medium text-[#6E6E73] hover:text-[#1D1D1F] dark:hover:text-white inline-flex items-center justify-center space-x-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Voltar ao login</span>
                  </button>
                </form>
              )}
            </div>
          )}

          {/* STATE: MAIN STREAMLINED LOGIN */}
          {(flowState === 'idle' || flowState === 'authenticating') && (
            <div className="space-y-5">
              {isMasterInput && (
                <div className="px-3.5 py-2.5 rounded-2xl bg-[#EBF5FF] dark:bg-[#0A84FF]/15 text-[#0066CC] dark:text-[#409CFF] text-xs flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span className="font-medium">
                    Conta Master · Acesso ao Painel Seletivo de Empresas
                  </span>
                </div>
              )}

              <form onSubmit={handleCredentialSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#424245] dark:text-[#AEAEB2] mb-1.5">
                    E-mail ou Usuário
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      autoComplete="username"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      placeholder="nome@empresa.com.br"
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-black/[0.10] dark:border-white/[0.12] text-sm text-[#1D1D1F] dark:text-[#F5F5F7] placeholder:text-[#86868B]"
                    />
                    <Mail className="w-4 h-4 text-[#86868B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-[#424245] dark:text-[#AEAEB2]">
                      Senha
                    </label>
                    <button
                      type="button"
                      onClick={handleOpenChangePassword}
                      className="text-xs font-medium text-[#0071E3] dark:text-[#409CFF] hover:underline cursor-pointer"
                    >
                      Alterar senha
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-10 py-3 rounded-xl bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-black/[0.10] dark:border-white/[0.12] text-sm text-[#1D1D1F] dark:text-[#F5F5F7] placeholder:text-[#86868B]"
                    />
                    <Lock className="w-4 h-4 text-[#86868B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#86868B] hover:text-[#1D1D1F] dark:hover:text-white cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-0.5">
                  <label className="inline-flex items-center space-x-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberEmail}
                      onChange={(e) => setRememberEmail(e.target.checked)}
                      className="rounded border-black/20 text-[#0071E3] focus:ring-0 cursor-pointer"
                    />
                    <span className="text-xs text-[#6E6E73] dark:text-[#98989D]">Lembrar e-mail</span>
                  </label>

                  <button
                    type="button"
                    onClick={handleInitiateFirstAccess}
                    className="text-xs font-medium text-[#6E6E73] dark:text-[#98989D] hover:text-[#0071E3] dark:hover:text-[#409CFF] inline-flex items-center space-x-1 cursor-pointer transition-colors"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Primeiro acesso</span>
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={flowState === 'authenticating'}
                  className="w-full py-3 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] active:scale-[0.99] text-white font-semibold text-sm shadow-[0_2px_8px_rgba(0,113,227,0.28)] transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 apple-solid-btn"
                >
                  {flowState === 'authenticating' ? (
                    <span>Entrando...</span>
                  ) : (
                    <>
                      <span>Continuar</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Clean Apple Divider */}
              <div className="relative flex items-center justify-center my-2">
                <div className="border-t border-black/[0.08] dark:border-white/[0.10] w-full" />
                <span className="px-3 text-xs text-[#86868B] bg-white dark:bg-[#1C1C1E] shrink-0">
                  ou
                </span>
                <div className="border-t border-black/[0.08] dark:border-white/[0.10] w-full" />
              </div>

              {/* Google SSO */}
              <button
                type="button"
                onClick={handleGoogleSubmit}
                disabled={flowState === 'authenticating'}
                className="w-full py-3 px-4 rounded-xl bg-white dark:bg-[#2C2C2E] hover:bg-[#F5F5F7] dark:hover:bg-[#3A3A3C] border border-black/[0.12] dark:border-white/[0.14] text-[#1D1D1F] dark:text-[#F5F5F7] font-medium text-sm transition-all flex items-center justify-center space-x-2.5 cursor-pointer disabled:opacity-50 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continuar com Google</span>
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Quiet Footer */}
      <footer className="w-full max-w-6xl mx-auto px-6 py-5 text-center text-xs text-[#86868B]">
        GAT — Gestão Operacional Corporativa · Direcionamento automático por empresa
      </footer>
    </div>
  );
};
