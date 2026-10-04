/**
 * landing/theme.ts — BuildWise AI marketing-site tokens.
 * Mirrors the macOS-premium language of the app (design/tokens.ts) at
 * display scale: porcelain sky, ink, accent gradient, Apple easing curves.
 * All values are landing-local; nothing here overrides the app's tokens.
 */

export const LANDING = {
  color: {
    porcelain1: '#eef2f7',
    porcelain2: '#dfe7f0',
    ink: '#0b1220',
    slate: '#4b5768',
    slateSoft: '#6b7787',
    accentA: '#2f6fed',
    accentB: '#6aa6ff',
    green: '#1fa955',
    greenSoft: '#31c465',
    amber: '#e8960c',
    white: '#ffffff',
  },
  /** Material recipes (strings are consumed inline for single-use surfaces) */
  glass: {
    blur: 'blur(20px) saturate(180%)',
    blurDeep: 'blur(32px) saturate(180%)',
    fill: 'rgba(255, 255, 255, 0.55)',
    fillStrong: 'rgba(255, 255, 255, 0.72)',
    hairline: 'rgba(255, 255, 255, 0.18)',
    topLight: 'inset 0 1px 0 rgba(255, 255, 255, 0.25)',
  },
  shadow: {
    /** Tight contact + wide ambient, the landing's default card shadow */
    card: '0 1px 2px rgba(11, 18, 32, 0.05), 0 12px 32px -8px rgba(11, 18, 32, 0.14)',
    /** Floating elements: nav pill, mockup shell */
    float:
      '0 2px 6px rgba(11, 18, 32, 0.06), 0 24px 60px -12px rgba(11, 18, 32, 0.22), 0 60px 120px -24px rgba(47, 111, 237, 0.18)',
    /** Hero mockup shadow bloom (final resting state) */
    mockup:
      '0 4px 10px rgba(11, 18, 32, 0.07), 0 40px 80px -20px rgba(11, 18, 32, 0.28), 0 90px 180px -40px rgba(47, 111, 237, 0.22)',
    dark: '0 8px 24px -6px rgba(11, 18, 32, 0.45), 0 2px 6px rgba(11, 18, 32, 0.3)',
  },
  radius: {
    card: 20,
    cardLg: 24,
    shell: 28,
    pill: 999,
  },
  type: {
    hero: 'clamp(2.75rem, 6.5vw, 5.5rem)',
    sectionTitle: 'clamp(1.9rem, 3.4vw, 3rem)',
    trackingHero: '-0.035em',
    trackingEyebrow: '0.35em',
  },
} as const;

/** Class for the display serif-free stack used across the landing. */
export const FONT_DISPLAY =
  "'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif";

/** Handwritten annotation font (hero note). */
export const FONT_HAND = "'Caveat', 'Segoe Script', cursive";
