import React, { useId } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

interface GatLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
  subtitleText?: string;
}

export const GatLogo: React.FC<GatLogoProps> = ({
  className = '',
  size = 'md',
  showSubtitle = false,
  subtitleText = 'SOLUÇÕES & GESTÃO',
}) => {
  const { isDark } = useTheme();
  const uid = useId().replace(/:/g, '');

  const heightClasses = {
    sm: 'h-6 sm:h-7',
    md: 'h-8 sm:h-10',
    lg: 'h-11 sm:h-12',
    xl: 'h-14 sm:h-16',
  }[size];

  return (
    <div className={`inline-flex flex-col items-start ${className}`}>
      <div className={`relative flex items-center ${heightClasses}`}>
        <svg
          viewBox="0 0 460 190"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-auto select-none"
        >
          <defs>
            <linearGradient id={`gat-blue-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={isDark ? '#38BDF8' : '#0A84FF'} />
              <stop offset="45%" stopColor="#0071E3" />
              <stop offset="100%" stopColor="#0055B3" />
            </linearGradient>

            <linearGradient id={`gat-ink-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
              {isDark ? (
                <>
                  <stop offset="0%" stopColor="#FFFFFF" />
                  <stop offset="70%" stopColor="#E5E5EA" />
                  <stop offset="100%" stopColor="#AEAEB2" />
                </>
              ) : (
                <>
                  <stop offset="0%" stopColor="#1D1D1F" />
                  <stop offset="65%" stopColor="#2C2C2E" />
                  <stop offset="100%" stopColor="#48484A" />
                </>
              )}
            </linearGradient>

            <filter id={`gat-shadow-${uid}`} x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow
                dx="0"
                dy="2"
                stdDeviation="3"
                floodColor={isDark ? '#0071E3' : '#000000'}
                floodOpacity={isDark ? '0.32' : '0.08'}
              />
            </filter>
          </defs>

          <g filter={`url(#gat-shadow-${uid})`}>
            {/* G Outer loop */}
            <path
              d="M 175 42 L 135 42 C 92 42 58 72 58 112 C 58 152 92 182 135 182 C 178 182 192 154 192 132 L 120 132 L 120 102 L 188 102 C 190 112 192 122 192 132 C 192 165 162 198 125 198 C 72 198 32 160 32 112 C 32 64 72 26 135 26 L 185 26 Z"
              fill={`url(#gat-blue-${uid})`}
            />
            {/* G horizontal dynamic cut */}
            <path d="M 94 102 L 158 102 L 148 122 L 94 122 Z" fill={isDark ? '#38BDF8' : '#0A84FF'} />

            {/* A Left Leg */}
            <path
              d="M 226 26 L 198 26 L 134 182 L 168 182 L 202 96 L 236 26 Z"
              fill={`url(#gat-ink-${uid})`}
            />
            {/* A Right Leg */}
            <path
              d="M 226 26 L 260 26 L 328 182 L 294 182 L 264 114 L 226 26 Z"
              fill={`url(#gat-ink-${uid})`}
            />
            {/* A Flowing Blue Ribbon */}
            <path
              d="M 174 122 C 204 122 222 108 252 108 L 308 182 L 274 182 C 254 152 236 132 202 132 C 184 132 170 137 156 146 Z"
              fill={`url(#gat-blue-${uid})`}
            />

            {/* T Top Horizontal Bar */}
            <path
              d="M 252 26 L 418 26 L 382 66 L 282 66 Z"
              fill={`url(#gat-blue-${uid})`}
            />
            {/* T Vertical Stem */}
            <path
              d="M 324 66 L 358 66 L 328 182 L 294 182 Z"
              fill={`url(#gat-ink-${uid})`}
            />
          </g>
        </svg>
      </div>

      {showSubtitle && (
        <span className="text-[10px] font-semibold tracking-[0.2em] text-[#6E6E73] dark:text-[#98989D] mt-1 uppercase">
          {subtitleText}
        </span>
      )}
    </div>
  );
};
