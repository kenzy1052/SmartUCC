import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext.tsx';

interface ThemeToggleProps {
  showLabel?: boolean;
  className?: string;
}

export function ThemeToggle({ showLabel = false, className = '' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`min-h-[44px] min-w-[44px] px-3 rounded-xl border border-neutral-200 dark:border-white/15 bg-[#FDFDFD] dark:bg-[#1C1D21] text-[#1D1D1F] dark:text-[#FDFDFD] hover:border-[#0A4DA8] dark:hover:border-[#4DA3FF] inline-flex items-center justify-center gap-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A4DA8] dark:focus-visible:ring-[#4DA3FF] whitespace-nowrap ${className}`}
    >
      {isDark ? (
        <Sun className="w-4 h-4 text-[#4DA3FF] shrink-0" />
      ) : (
        <Moon className="w-4 h-4 text-[#0A4DA8] shrink-0" />
      )}
      {showLabel && <span>{isDark ? 'Light' : 'Dark'}</span>}
    </button>
  );
}
