/**
 * Navbar.tsx — floating glass pill navigation.
 * Drops in on a spring; condenses (shorter, deeper blur, stronger shadow)
 * after 24px of scroll; links grow underlines from center; collapses into
 * a glass sheet menu below md with a spring transition.
 */
import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'framer-motion';
import { EASE_APPLE, SPRING_SOFT } from './motion';
import { scrollToId } from './scroll';
import { APP_PATH, navigate } from './router';
import { Icon } from '../components/Icon';
import { LANDING } from './theme';
import logoUrl from '../assets/BuildWise_logo_square.png';

const LINKS: ReadonlyArray<{ label: string; target: string }> = [
  { label: 'Platform', target: 'platform' },
  { label: 'Analysis', target: 'analysis' },
  { label: 'Blueprint', target: 'blueprint' },
  { label: 'Reports', target: 'reports' },
  { label: 'Docs', target: 'footer' },
];

/**
 * MenuIcon — three-line hamburger that morphs into an ×.
 * Integer-pixel geometry only (16px box, 2px lines, 4px gaps): fractional
 * offsets snap differently at each device pixel ratio and render as uneven
 * spacing, so every value here stays on the whole-pixel grid.
 */
const MenuIcon: React.FC<{ open: boolean }> = ({ open }) => (
  <span aria-hidden className="flex h-4 w-4 flex-col items-center justify-center gap-[4px]">
    {/* Top line → upper-right arm of the × (drops 6px, rotates 45°) */}
    <motion.span
      className="block h-[2px] w-full rounded-full bg-current"
      initial={false}
      animate={open ? { rotate: 45, y: 6 } : { rotate: 0, y: 0 }}
      transition={{ duration: 0.22, ease: EASE_APPLE }}
    />
    {/* Middle line → fades away as the × takes shape */}
    <motion.span
      className="block h-[2px] w-full rounded-full bg-current"
      initial={false}
      animate={open ? { opacity: 0, x: -2 } : { opacity: 1, x: 0 }}
      transition={{ duration: 0.15, ease: EASE_APPLE }}
    />
    {/* Bottom line → lower-right arm of the × (rises 6px, rotates −45°) */}
    <motion.span
      className="block h-[2px] w-full rounded-full bg-current"
      initial={false}
      animate={open ? { rotate: -45, y: -6 } : { rotate: 0, y: 0 }}
      transition={{ duration: 0.22, ease: EASE_APPLE }}
    />
  </span>
);

export const Navbar: React.FC = () => {
  const [condensed, setCondensed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pressed, setPressed] = useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, 'change', (v) => setCondensed(v > 24));

  // Escape closes the mobile glass sheet.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const go = (target: string) => {
    setMenuOpen(false);
    scrollToId(target);
  };

  const pill: React.CSSProperties = {
    // Identical whether the menu is open or closed — the scrim now lives
    // outside the header, so opening the menu never restyles the pill.
    // Condensed drops backdrop-filter entirely: the page spends ~95% of its
    // scroll condensed, the pill is near-opaque there anyway, and a full-
    // width blur re-running every frame is the nav's whole perf cost.
    background: condensed ? 'rgba(255,255,255,0.94)' : 'rgba(255,255,255,0.88)',
    backdropFilter: condensed ? 'none' : LANDING.glass.blur,
    WebkitBackdropFilter: condensed ? 'none' : LANDING.glass.blur,
    border: `1px solid ${LANDING.glass.hairline}`,
    boxShadow: `${LANDING.glass.topLight}, ${condensed ? LANDING.shadow.float : LANDING.shadow.card}`,
    transition:
      'background 350ms var(--bw-ease-apple), box-shadow 350ms var(--bw-ease-apple), padding 350ms var(--bw-ease-apple)',
  };

  // Mobile: single row must always fit — tight paddings + no nested chrome.
  const pillPad: React.CSSProperties = condensed
    ? { paddingLeft: 8, paddingRight: 6, paddingTop: 6, paddingBottom: 6 }
    : { paddingLeft: 12, paddingRight: 6, paddingTop: 9, paddingBottom: 9 };

  return (
    <>
      <motion.header
        initial={{ y: -84, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24, mass: 1 }}
        className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4"
      >
      <nav
        aria-label="Primary"
        className="relative flex w-full max-w-3xl items-center gap-1 rounded-full sm:gap-2"
        style={{ ...pill, ...pillPad }}
      >
        {/* Brand */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            go('top');
          }}
          className="flex shrink-0 items-center gap-2 rounded-full pr-2"
          aria-label="BuildWise AI — back to top"
        >
          <img
            src={logoUrl}
            alt=""
            width={30}
            height={30}
            className="rounded-[9px] shadow-sm"
            decoding="async"
          />
          {/* Below 420px the wordmark yields so brand + CTA + menu fit one row */}
          <span className="text-[15px] font-bold tracking-[-0.02em] text-[#0b1220] max-[420px]:hidden">
            BuildWise AI
          </span>
        </a>

        <span aria-hidden className="hidden h-5 w-px shrink-0 bg-[rgba(11,18,32,0.10)] md:block" />

        {/* Links (desktop) */}
        <ul className="hidden flex-1 items-center justify-center gap-6 md:flex">
          {LINKS.map((l) => (
            <li key={l.label}>
              <a
                href={`#${l.target}`}
                onClick={(e) => {
                  e.preventDefault();
                  go(l.target);
                }}
                className="bw-nav-link text-[13.5px] font-medium text-[#3c4757] transition-colors duration-200 hover:text-[#0b1220]"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        {/* CTA */}
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <button
            type="button"
            onClick={() => navigate(APP_PATH)}
            className="group inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-white px-3 text-[13px] font-semibold text-[#0b1220] transition-[transform,box-shadow] duration-200 hover:shadow-md active:scale-[0.97] sm:px-4 sm:text-[13.5px]"
            style={{ border: '1px solid rgba(11,18,32,0.08)', boxShadow: LANDING.shadow.card }}
          >
            Try BuildWise
            <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-1"><Icon name="arrow-up-right" size={14} className="inline-block -rotate-45" /></span>
          </button>

          {/* Mobile menu button — one calm circle: gentle press, no flicker,
              and it visually merges with the pill instead of stacking on it. */}
          <motion.button
            type="button"
            onClick={() => setMenuOpen((p) => !p)}
            onPointerDown={() => setPressed(true)}
            onPointerUp={() => setPressed(false)}
            onPointerLeave={() => setPressed(false)}
            onPointerCancel={() => setPressed(false)}
            aria-expanded={menuOpen}
            aria-controls="bw-mobile-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#0b1220] md:hidden"
            animate={{ scale: pressed ? 0.92 : 1, backgroundColor: menuOpen || pressed ? 'rgba(255,255,255,0)' : 'rgba(255,255,255,0.92)' }}
            transition={{ duration: 0.18, ease: EASE_APPLE }}
            style={{ border: '1px solid rgba(11,18,32,0.10)', boxShadow: 'none' }}
          >
            <MenuIcon open={menuOpen} />
          </motion.button>
        </div>

        {/* Mobile glass sheet */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              id="bw-mobile-menu"
              initial={{ opacity: 0, y: -12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.97 }}
              transition={SPRING_SOFT}
              style={{
                transformOrigin: 'top center',
                background: 'rgba(255,255,255,0.97)',
                backdropFilter: LANDING.glass.blurDeep,
                WebkitBackdropFilter: LANDING.glass.blurDeep,
                border: `1px solid ${LANDING.glass.hairline}`,
                boxShadow: LANDING.shadow.float,
              }}
              className="absolute inset-x-0 top-[calc(100%+10px)] rounded-[22px] p-2 md:hidden"
            >
              <ul className="flex flex-col">
                {LINKS.map((l) => (
                  <li key={l.label}>
                    <a
                      href={`#${l.target}`}
                      onClick={(e) => {
                        e.preventDefault();
                        go(l.target);
                      }}
                      className="flex items-center justify-between rounded-2xl px-4 py-3 text-[15px] font-medium text-[#0b1220] transition-colors duration-200 hover:bg-[rgba(11,18,32,0.05)]"
                    >
                      {l.label}
                      <span aria-hidden className="text-[#8a93a3]"><Icon name="arrow-up-right" size={13} className="inline-block -rotate-45" /></span>
                    </a>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
      </motion.header>

      {/* Scrim — a sibling of the header (z-40 under the header's z-50).
          It must never live inside <nav>: nav has backdrop-filter, which
          makes it a stacking context, so a negative-z child painted OVER
          the pill's background and greyed the whole navbar when open. */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            key="bw-menu-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={() => setMenuOpen(false)}
            aria-hidden
            className="fixed inset-0 z-40 md:hidden"
            style={{
              background: 'rgba(11,18,32,0.22)',
              backdropFilter: 'blur(3px)',
              WebkitBackdropFilter: 'blur(3px)',
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
};
