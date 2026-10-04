/**
 * HeroScene.tsx — the hero's scenic background.
 * A real photograph (public/hero-scenic.jpg — misty forested ridge at
 * dusk) is color-graded into the porcelain palette, then layered with a
 * slow-drifting mist veil and a warm sun bloom so it sits *inside* the
 * page's material language instead of reading as a pasted stock photo.
 * The file is preloaded from index.html; the hero applies the parallax.
 */
import React, { useState } from 'react';
import { useMotionValueEvent, useScroll } from 'framer-motion';

export const HeroScene: React.FC = () => {
  // The mist veil loops forever; once the hero has scrolled away that is
  // pure compositor burn during the rest of the page scroll, so pause the
  // CSS animation until the hero is back in view.
  const { scrollY } = useScroll();
  const [mistPaused, setMistPaused] = useState(false);
  useMotionValueEvent(scrollY, 'change', (v) => {
    const next = v > window.innerHeight * 1.15;
    setMistPaused((prev) => (prev === next ? prev : next));
  });

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {/* Photograph — graded to sit inside the porcelain palette */}
      <img
        src="/hero-scenic.jpg"
        alt=""
        decoding="async"
        fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover"
        style={{
          objectPosition: '62% 36%',
          transform: 'scale(1.06)',
          filter: 'saturate(0.72) brightness(1.09) contrast(0.95)',
        }}
      />

      {/* Porcelain grade: cool the photo top-to-bottom into the page */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(238,242,247,0.32) 0%, rgba(238,242,247,0.08) 34%, rgba(223,231,240,0.10) 68%, rgba(238,242,247,0.44) 100%)',
        }}
      />
      {/* Warm sun bloom echoing the photo's dusk light */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(1200px 620px at 76% 16%, rgba(255,244,222,0.22), transparent 62%)',
        }}
      />

      {/* Drifting mist veil (60s loop; paused offscreen; disabled under reduced motion) */}
      <div
        className="bw-cloud-drift absolute inset-[-8%]"
        style={{ animationPlayState: mistPaused ? 'paused' : 'running' }}
      >
        <div
          className="absolute left-[8%] top-[30%] h-[220px] w-[720px] rounded-full"
          style={{
            background: 'radial-gradient(closest-side, rgba(244,248,252,0.50), rgba(255,255,255,0))',
            filter: 'blur(18px)',
          }}
        />
        <div
          className="absolute left-[42%] top-[52%] h-[180px] w-[640px] rounded-full"
          style={{
            background: 'radial-gradient(closest-side, rgba(238,242,247,0.42), rgba(255,255,255,0))',
            filter: 'blur(22px)',
          }}
        />
        <div
          className="absolute right-[2%] top-[10%] h-[200px] w-[560px] rounded-full"
          style={{
            background: 'radial-gradient(closest-side, rgba(255,255,255,0.35), rgba(255,255,255,0))',
            filter: 'blur(16px)',
          }}
        />
        <div
          className="absolute right-[20%] top-[64%] h-[160px] w-[520px] rounded-full"
          style={{
            background: 'radial-gradient(closest-side, rgba(240,246,251,0.34), rgba(255,255,255,0))',
            filter: 'blur(20px)',
          }}
        />
      </div>
    </div>
  );
};
