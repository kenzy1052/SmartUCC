import React from 'react';

/**
 * College of Distance Education mark: an open book whose pages rise into a
 * mortarboard-like peak, sitting on the deep academic blue.
 */
export function BrandMark({ className = 'w-9 h-9' }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center shrink-0 ${className}`}>
      <svg
        viewBox="0 0 44 44"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
        role="img"
        aria-label="CDE Exams"
      >
        <rect width="44" height="44" rx="11" fill="#0A4DA8" />
        <path d="M22 11 7.5 17.5 22 24l14.5-6.5L22 11Z" fill="#FFFFFF" />
        <path
          d="M14 22.2v5.1c0 1.9 3.6 3.7 8 3.7s8-1.8 8-3.7v-5.1l-8 3.6-8-3.6Z"
          fill="#4DA3FF"
        />
        <path d="M36.5 18v8" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
        <circle cx="36.5" cy="27.8" r="1.6" fill="#FFFFFF" />
      </svg>
    </div>
  );
}
