import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * Logo do Grupo Aguero (arquivos em public/brand, gerados da arte oficial).
 * - Tamanhos pequenos (sm, md): símbolo ao lado do nome, para caber em barras e cabeçalhos.
 * - Tamanhos grandes (lg, xl): logo completo, nome embaixo do símbolo.
 * - Modo escuro usa a versão clara; impressão sempre sai na cor original (papel branco).
 */
interface BrandLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  layout?: 'horizontal' | 'stacked';
  /** Fundo da área onde o logo fica: 'auto' segue o tema; 'dark' força a versão clara. */
  background?: 'auto' | 'light' | 'dark';
  showSubtitle?: boolean;
  subtitleText?: string;
}

const SRC = {
  full: '/brand/grupo-aguero',
  symbol: '/brand/grupo-aguero-simbolo',
  name: '/brand/grupo-aguero-nome',
};

const HEIGHTS = {
  horizontal: { sm: 'h-8', md: 'h-10', lg: 'h-12', xl: 'h-16' },
  stacked: { sm: 'h-12', md: 'h-16', lg: 'h-20 sm:h-24', xl: 'h-28 sm:h-32' },
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  className = '',
  size = 'md',
  layout,
  background = 'auto',
  showSubtitle = false,
  subtitleText = 'SOLUÇÕES & GESTÃO',
}) => {
  const { isDark } = useTheme();
  const shape = layout || (size === 'lg' || size === 'xl' ? 'stacked' : 'horizontal');
  const light = background === 'dark' || (background === 'auto' && isDark);
  const h = HEIGHTS[shape][size];

  // Uma imagem na tela (cor do tema) e outra só na impressão (sempre a cor original).
  const img = (base: string, cls: string, alt: string) => (
    <>
      <img src={`${base}${light ? '-claro' : ''}.png`} alt={alt} className={`${cls} w-auto select-none print:hidden`} draggable={false} />
      <img src={`${base}.png`} alt="" aria-hidden="true" className={`${cls} w-auto select-none hidden print:block`} draggable={false} />
    </>
  );

  return (
    <div className={`inline-flex flex-col items-start ${className}`}>
      {shape === 'stacked' ? (
        img(SRC.full, h, 'Grupo Aguero')
      ) : (
        <div className={`flex items-center gap-2.5 ${h}`}>
          {img(SRC.symbol, 'h-full', 'Grupo Aguero')}
          {/* Nome mais baixo que o símbolo, alinhado ao centro, como na arte */}
          {img(SRC.name, 'h-[78%]', '')}
        </div>
      )}
      {showSubtitle && (
        <span className="text-[10px] font-semibold tracking-[0.2em] text-[#6E6E73] dark:text-[#98989D] mt-1 uppercase">
          {subtitleText}
        </span>
      )}
    </div>
  );
};
