/**
 * AnalysisRail.tsx — the mockup's right-hand analysis rail.
 * Two-column grid of glass cards, stagger-revealed once; each card is
 * dismissible via its ×, and a ghost "Restore cards" chip appears when
 * anything has been dismissed (no dead ends).
 */
import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { fadeRise, staggerParent, SPRING_SOFT } from '../motion';
import { SuitabilityCard } from './cards/SuitabilityCard';
import { SeismicCard } from './cards/SeismicCard';
import { FloodCard } from './cards/FloodCard';
import { CostCard } from './cards/CostCard';
import { VastuCard } from './cards/VastuCard';
import { BlueprintCard } from './cards/BlueprintCard';

const CARDS = [
  { id: 'suitability', Comp: SuitabilityCard },
  { id: 'seismic', Comp: SeismicCard },
  { id: 'flood', Comp: FloodCard },
  { id: 'cost', Comp: CostCard },
  { id: 'vastu', Comp: VastuCard },
  { id: 'blueprint', Comp: BlueprintCard },
] as const;

type CardId = (typeof CARDS)[number]['id'];

export const AnalysisRail: React.FC = () => {
  const [dismissed, setDismissed] = useState<ReadonlySet<CardId>>(new Set());
  const reduced = useReducedMotion();

  const dismiss = (id: CardId) => setDismissed((prev) => new Set(prev).add(id));
  const restoreAll = () => setDismissed(new Set());

  return (
    <div className="relative flex min-h-0 flex-col">
      <motion.div
        variants={reduced ? undefined : staggerParent(0.07, 0.15)}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.12 }}
        className="grid min-h-0 flex-1 grid-cols-1 content-start gap-3 @sm:grid-cols-2"
      >
        <AnimatePresence mode="popLayout">
          {CARDS.filter(({ id }) => !dismissed.has(id)).map(({ id, Comp }) => (
            <motion.div
              key={id}
              layout
              variants={reduced ? undefined : fadeRise}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.22 } }}
              transition={reduced ? { duration: 0.3 } : SPRING_SOFT}
              className="min-h-0"
            >
              <Comp onClose={() => dismiss(id)} />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
        {dismissed.size > 0 && (
          <motion.button
            type="button"
            onClick={restoreAll}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute -bottom-1 left-1/2 z-10 -translate-x-1/2 rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold text-[#0b1220] transition-transform duration-150 hover:scale-[1.03] active:scale-[0.97]"
            style={{
              background: 'rgba(255,255,255,0.92)',
              border: '1px solid rgba(11,18,32,0.10)',
              boxShadow: '0 6px 16px -6px rgba(11,18,32,0.25)',
            }}
          >
            Restore {dismissed.size} card{dismissed.size > 1 ? 's' : ''}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};
