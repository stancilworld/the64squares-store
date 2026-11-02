type P = { className?: string }

export const SearchIcon = ({ className }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <circle cx="10.5" cy="10.5" r="7" />
    <path d="M16 16l5 5" />
  </svg>
)

export const UserIcon = ({ className }: P) => (
  <svg className={className} viewBox="0 0 40 42" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" aria-hidden="true">
    <circle cx="20" cy="11" r="8" />
    <path d="M4 39v-3a12 12 0 0 1 12-12h8a12 12 0 0 1 12 12v3" />
  </svg>
)

export const CartIcon = ({ className }: P) => (
  <svg className={className} viewBox="0 0 42 40" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 3h6l5 24h22l4-17H11" />
    <circle cx="15" cy="35" r="2.6" fill="currentColor" />
    <circle cx="32" cy="35" r="2.6" fill="currentColor" />
  </svg>
)

export const ChevronDown = ({ className }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 9l7 7 7-7" />
  </svg>
)

export const ChevronLeftThin = ({ className }: P) => (
  <svg className={className} viewBox="0 0 36 58" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M33 2L3 29l30 27" />
  </svg>
)

export const ChevronRightThin = ({ className }: P) => (
  <svg className={className} viewBox="0 0 36 58" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 2l30 27L3 56" />
  </svg>
)

export const ArrowRight = ({ className }: P) => (
  <svg className={className} viewBox="0 0 48 16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1 8h44M38 1l7 7-7 7" />
  </svg>
)

export const MenuIcon = ({ className }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
    <path d="M3 6h18M3 12h18M3 18h18" />
  </svg>
)

export const CloseIcon = ({ className }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d="M5 5l14 14M19 5L5 19" />
  </svg>
)

export const FacebookIcon = ({ className }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.6 1.6-1.6h1.7V4.4c-.3 0-1.3-.1-2.5-.1-2.5 0-4.1 1.5-4.1 4.2v2.3H7.4V14h2.8v8h3.3z" />
  </svg>
)

export const InstagramIcon = ({ className }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
    <circle cx="12" cy="12" r="4.4" />
    <circle cx="17.6" cy="6.4" r="1.1" fill="currentColor" stroke="none" />
  </svg>
)

export const LinkedInIcon = ({ className }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M19 2H5a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V5a3 3 0 0 0-3-3zM8.3 18.5H5.6V9.8h2.7v8.7zM6.9 8.6a1.6 1.6 0 1 1 0-3.1 1.6 1.6 0 0 1 0 3.1zm11.6 9.9h-2.7v-4.2c0-1 0-2.3-1.4-2.3s-1.6 1.1-1.6 2.2v4.3h-2.7V9.8H13v1.2c.4-.7 1.3-1.4 2.6-1.4 2.8 0 3.3 1.8 3.3 4.2v4.7z" />
  </svg>
)

export const YouTubeIcon = ({ className }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8zM9.7 15.1V8.9l5.8 3.1-5.8 3.1z" />
  </svg>
)

export const WhatsAppIcon = ({ className }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 1.5A10.4 10.4 0 0 0 3 17.2L1.6 22.5l5.4-1.4A10.4 10.4 0 1 0 12 1.5zm0 19a8.6 8.6 0 0 1-4.4-1.2l-.3-.2-3.2.8.9-3.1-.2-.3A8.6 8.6 0 1 1 12 20.5zm4.7-6.4c-.3-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.6.1a7 7 0 0 1-2.1-1.3 7.8 7.8 0 0 1-1.4-1.8c-.2-.3 0-.4.1-.6l.4-.5.3-.4v-.5l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 2.9 2.9 0 0 0-.9 2.2 5.1 5.1 0 0 0 1 2.7 11.6 11.6 0 0 0 4.5 4c.6.3 1.1.4 1.5.5a3.6 3.6 0 0 0 1.6.1 2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.6-.3z" />
  </svg>
)

export const ArrowLeftLong = ({ className }: P) => (
  <svg className={className} viewBox="0 0 40 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M39 5H1m0 0l4-4M1 5l4 4" />
  </svg>
)

export const HeartIcon = ({ className, filled = false }: P & { filled?: boolean }) => (
  <svg className={className} viewBox="0 0 44 40" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="4.5" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 37S3 25.5 3 13.2C3 7.4 7.5 3 13 3c3.8 0 7 2 9 5.2C24 5 27.2 3 31 3c5.5 0 10 4.4 10 10.2C41 25.5 22 37 22 37z" />
  </svg>
)

// Contact page (outline icons, same weight as the rest of the site).
const outline = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }

export const MailIcon = ({ className }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...outline} aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="M4 7l8 6 8-6" />
  </svg>
)

export const PhoneIcon = ({ className }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...outline} aria-hidden="true">
    <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
    <path d="M11 18.5h2" />
  </svg>
)

export const ClockIcon = ({ className }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...outline} aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)

export const PinIcon = ({ className }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...outline} aria-hidden="true">
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
)

export const LinkIcon = ({ className }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...outline} aria-hidden="true">
    <path d="M10 14a4.5 4.5 0 006.4 0l3-3a4.5 4.5 0 00-6.4-6.4l-1 1" />
    <path d="M14 10a4.5 4.5 0 00-6.4 0l-3 3a4.5 4.5 0 006.4 6.4l1-1" />
  </svg>
)

export const InfoIcon = ({ className }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...outline} aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
)

export const SendIcon = ({ className }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...outline} aria-hidden="true">
    <path d="M3 11.5L21 3l-6.5 18-3-7.5L3 11.5z" />
    <path d="M11.5 13.5L21 3" />
  </svg>
)

export const ChatIcon = ({ className }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...outline} aria-hidden="true">
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A2.5 2.5 0 0 1 4 13.5v-8z" />
    <path d="M8.5 9.5h.01M12 9.5h.01M15.5 9.5h.01" />
  </svg>
)
