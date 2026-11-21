// The Prism mark: a prism that catches a thread of starlight and lets it out as three soft rays.
// The prism takes currentColor; the light keeps the painting's colours (starlight, rose, cobalt) on any ground,
// thinning out as it leaves the prism.
import { useId } from 'react';

export function LogoMark({ size = 28, className }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}f`} x1="19" x2="31.6" y1="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.2" />
        </linearGradient>
        <mask id={`${id}m`}><rect width="32" height="32" fill={`url(#${id}f)`} /></mask>
      </defs>
      <path d="M1.6 21.2 9.8 17.6" stroke="var(--logo-beam, #e9c460)" strokeWidth="1.7" strokeLinecap="round" />
      <g mask={`url(#${id}m)`}>
        <path d="M19.6 14.2 31 8.4v3.2L19.6 15.2Z" fill="#e9c460" />
        <path d="M19.8 15.9 31.2 14.6v3.2l-11.4-.9Z" fill="#dc8f84" />
        <path d="M19.9 17.6 31 20.8V24l-11.1-5.4Z" fill="#86a5da" />
      </g>
      <path d="M15.2 4.4 26.4 25.6H4Z" fill="var(--logo-prism, currentColor)" stroke="var(--logo-prism, currentColor)" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M15.2 4.4 18.4 25.6h8Z" fill="var(--logo-facet, rgba(255,255,255,.16))" />
    </svg>
  );
}

export function Logo({ size = 26, className, wordmark = true }) {
  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.36) }}>
      <LogoMark size={size} />
      {wordmark && (
        <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 720, fontSize: Math.round(size * 0.68), letterSpacing: '-0.025em', lineHeight: 1 }}>
          Prism
        </span>
      )}
    </span>
  );
}
