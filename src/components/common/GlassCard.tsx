import React from 'react';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  hoverEffect?: boolean;
  padding?: string;
}

export function GlassCard({
  children,
  className = '',
  hoverEffect = false,
  padding = 'p-6',
  ...rest
}: GlassCardProps) {
  return (
    <div
      {...rest}
      className={`relative rounded-3xl bg-white/80 dark:bg-[#18191D]/80 backdrop-blur-xl border border-neutral-200/80 dark:border-white/10 shadow-[0_8px_30px_rgba(10, 77, 168,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.4)] ${padding} ${
        hoverEffect
          ? 'transition-all duration-300 hover:shadow-[0_16px_40px_rgba(10, 77, 168,0.08)] dark:hover:shadow-[0_16px_40px_rgb(0,0,0,0.6)] hover:-translate-y-0.5 hover:border-[#0A4DA8]/25 dark:hover:border-[#4DA3FF]/30'
          : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}
