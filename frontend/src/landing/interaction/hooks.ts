/**
 * interaction/hooks.ts — the React bindings for P1–P7.
 *
 * WHY THE PURE HALVES ARE SEPARATE (`./springs`, `./capability`, `./pointer`,
 * `./scrub`, `./stage`, `./geometry`, `./drag`). This repository runs its unit
 * tests as plain node scripts with type stripping (`test:map-controls`,
 * `test-boundary-pipeline`, and now `test:interaction-primitives`). A module that
 * imports framer-motion or touches the DOM at import time cannot be loaded there,
 * so the maths that decides how the page behaves lives in files that import
 * nothing, and this file keeps the part that genuinely needs React.
 *
 * THE ONE RULE EVERY HOOK HERE OBEYS: a pointer or scroll event must not cause a
 * React render. Pointer state lives in `MotionValue`s, which framer writes to the
 * element's transform; React re-renders only when a *state* changes (a drag
 * starting, the rung changing, the beat index crossing), never per frame.
 * `scripts/interaction_probe.cjs` [4] asserts the observable consequence: a
 * 100-move pointer sweep produces no structural mutation of the stage.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMotionValue, useSpring, type MotionValue } from 'framer-motion';
import { resolveCapability, type Capability, type CapabilityInput } from './capability';
import { SPRING_POSE, SPRING_SNAPPY, dampedFollow, type SpringPreset } from './springs';
import { normalizePointer, parallaxTarget, tiltFromOrientation, type Frame } from './pointer';
import { ENTRY_BAND, progressFromRect, type Band } from './scrub';
import type { Bounds, ViewBox } from './geometry';
import { draggedPoint, moveVertex, nudgeVertex, stepFor } from './drag';
import type { Vertex } from '../../services/boundaryIO';

/* ------------------------------------------------------------------ */
/* P7 · capability gate                                                */
/* ------------------------------------------------------------------ */

const matches = (query: string): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia(query).matches;

/** Read the environment once, as plain values. */
export function readCapabilityInput(): CapabilityInput {
  const nav = (typeof navigator !== 'undefined' ? navigator : undefined) as
    | (Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number })
    | undefined;
  return {
    reducedMotion: matches('(prefers-reduced-motion: reduce)'),
    saveData: nav?.connection?.saveData === true,
    deviceMemory: typeof nav?.deviceMemory === 'number' ? nav.deviceMemory : undefined,
    coarsePointer: matches('(pointer: coarse)'),
    devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
  };
}

/**
 * The capability gate, kept current.
 *
 * `deviceMemory` and `saveData` cannot change mid-session; the motion PREFERENCE
 * can, and does — a reader who turns on "reduce motion" while the page is open
 * should see the page settle rather than keep animating. So only that one is
 * subscribed, through a media-query listener rather than a poll.
 */
export function useCapability(): Capability {
  const [input, setInput] = useState<CapabilityInput>(readCapabilityInput);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setInput(readCapabilityInput());
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  return useMemo(() => resolveCapability(input), [input]);
}

/* ------------------------------------------------------------------ */
/* Shared: on-screen gate (the "idle = no work" contract)              */
/* ------------------------------------------------------------------ */

/**
 * True while the element is (or is about to be) on screen.
 *
 * This is the landing's version of "frameloop: demand". Rather than a bespoke
 * render loop, a stage that is off screen registers no pointer or scrub work at
 * all, so an idle page costs nothing per frame and the compositor can discard the
 * layers. `scripts/interaction_probe.cjs` [1] asserts the consequence: scroll the
 * stage out of view and the primitives' window listeners drop to zero.
 */
export function useOnScreen(ref: React.RefObject<HTMLElement | null>, rootMargin = '25% 0px'): boolean {
  const [onScreen, setOnScreen] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setOnScreen(entry.isIntersecting);
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);

  return onScreen;
}

/* ------------------------------------------------------------------ */
/* P1 · springs                                                        */
/* ------------------------------------------------------------------ */

/**
 * A spring toward a boolean state, returned as 0 → 1 so a caller can interpolate
 * any number of values from ONE spring instead of paying for one spring per
 * value. (The hero interpolates its rest tilt with it: 30° at 0, flat at 1.)
 */
export function useStateSpring(active: boolean, spring: SpringPreset = SPRING_SNAPPY): MotionValue<number> {
  const target = useMotionValue(active ? 1 : 0);
  useEffect(() => {
    target.set(active ? 1 : 0);
  }, [active, target]);
  return useSpring(target, spring);
}

/* ------------------------------------------------------------------ */
/* P2 · pointer parallax, with the touch/gyro equivalent               */
/* ------------------------------------------------------------------ */

export interface Offset {
  x: MotionValue<number>;
  y: MotionValue<number>;
}

/**
 * Pointer parallax: the normalized pointer position scaled by `amplitude` and
 * followed by a damped spring.
 *
 * Every listener registered here is removed on cleanup, and NOTHING is registered
 * when `enabled` is false — which is how a reduced-motion or coarse-pointer page
 * ends up with zero pointer listeners rather than with handlers that happen to do
 * nothing. `pointerType === 'touch'` is ignored too: a touch is not a hover, and
 * treating it as one makes a phone's assembly jump under the finger.
 *
 * TWO RESET LINES, AND WHICH ONE ACTUALLY FIRES, MEASURED. `pointerleave` on
 * `window` and `blur` both return the pose to centre, and they are not equivalent:
 * moving a trusted pointer right out of the viewport — to (-4,-4) and to
 * (1600,1000) — fires `pointerout` and NEVER `pointerleave` on `window` in Chrome
 * (measured by `scripts/interaction_probe.cjs`, recorded in its report as
 * `pointerOutOfViewport`), while a focus change does fire `blur`, and the pose then
 * returns to its rest value exactly (deflection 0.09 matrix units → residual 0).
 * Both are kept because the two routes fail on different platforms — but the blur
 * line is the one this page has been able to prove works, and a reader who has
 * scrolled away and left the tab is the case it covers.
 */
export function usePointerParallax(amplitude: { x: number; y: number }, enabled: boolean): Offset {
  /* The two numbers are destructured rather than depended on as an object: a
     caller passing an inline literal (`usePointerParallax({ x: 7, y: 4 }, …)`)
     creates a NEW object every render, so an effect keyed on it would tear down and
     re-register its listeners on every parent render. Depending on the numbers is
     both the behaviour the page wants and the dependency list the lint asks for. */
  const ampX = amplitude.x;
  const ampY = amplitude.y;
  const targetX = useMotionValue(0);
  const targetY = useMotionValue(0);
  const x = useSpring(targetX, SPRING_POSE);
  const y = useSpring(targetY, SPRING_POSE);

  useEffect(() => {
    if (!enabled) {
      /* Return to centre rather than freezing wherever the pointer last was: a
         disabled gate must not leave a half-turned assembly on screen. */
      targetX.set(0);
      targetY.set(0);
      return;
    }
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const frame: Frame = { width: window.innerWidth, height: window.innerHeight };
      const target = parallaxTarget(normalizePointer(event.clientX, event.clientY, frame), { x: ampX, y: ampY });
      targetX.set(target.x);
      targetY.set(target.y);
    };
    const onLeave = () => {
      targetX.set(0);
      targetY.set(0);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
    };
  }, [enabled, ampX, ampY, targetX, targetY]);

  return { x, y };
}

/**
 * The touch equivalent of the pointer: the device's own tilt.
 *
 * TWO LIMITS RECORDED RATHER THAN HIDDEN. On iOS 13+ the API must be granted from
 * a user gesture, and a marketing hero will not spend the reader's first tap on a
 * permission dialog — so the hero opts in only where events arrive without a
 * prompt. And `absolute` orientation is preferred where the browser provides it,
 * so the pose is relative to the ground rather than to however the phone happened
 * to be held when the page opened. If no events ever arrive, the offsets stay at
 * centre and the hero holds its rest pose — the same composed frame the
 * reduced-motion rung uses, which is a real design rather than an error state.
 */
export function useDeviceTilt(amplitude: { x: number; y: number }, enabled: boolean): Offset {
  const ampX = amplitude.x;
  const ampY = amplitude.y; /* destructured for the same reason as the pointer hook */
  const targetX = useMotionValue(0);
  const targetY = useMotionValue(0);
  const x = useSpring(targetX, SPRING_POSE);
  const y = useSpring(targetY, SPRING_POSE);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
      targetX.set(0);
      targetY.set(0);
      return;
    }
    const onOrient = (event: DeviceOrientationEvent) => {
      if (event.gamma === null && event.beta === null) return;
      const target = tiltFromOrientation(event.gamma, event.beta, { x: ampX, y: ampY });
      targetX.set(target.x);
      targetY.set(target.y);
    };
    const type = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(type, onOrient as EventListener);
    return () => window.removeEventListener(type, onOrient as EventListener);
  }, [enabled, ampX, ampY, targetX, targetY]);

  return { x, y };
}

/* ------------------------------------------------------------------ */
/* P4 · damped scroll scrub                                            */
/* ------------------------------------------------------------------ */

export interface ScrubOptions {
  band?: Band;
  /** Time constant of the damped follow, in seconds. */
  tau?: number;
  /** Monotone: the value only ever builds (a set piece must not un-build). */
  latch?: boolean;
  /** Disable the loop entirely — an off-screen stage then pays nothing. */
  enabled?: boolean;
}

/**
 * A scrubbed value: the element's position across its band, followed with damping.
 *
 * Reads its own geometry once per animation frame (one `getBoundingClientRect`,
 * the same cost framer's `useScroll` pays per target) and writes only to a
 * `MotionValue` — never to React state. Under reduced motion it reports the
 * settled END, so consumers render their finished state and nothing animates.
 *
 * No layout, no opinion: a frame in which the element has zero height is ignored
 * and the value holds. The failure that guard exists for is recorded in scrub.ts
 * (a plan that latched itself "finished" before anyone saw it).
 */
export function useDampedScrub(
  ref: React.RefObject<HTMLElement | null>,
  options: ScrubOptions = {},
): MotionValue<number> {
  const { band = ENTRY_BAND, tau = 0.09, latch: shouldLatch = false, enabled = true } = options;
  const value = useMotionValue(0);
  /* Read per render rather than cached: the media query is cheap, and a rung
     change elsewhere on the page re-renders this consumer anyway. */
  const reduced = matches('(prefers-reduced-motion: reduce)');

  useEffect(() => {
    if (reduced) {
      value.set(1);
      return;
    }
    const el = ref.current;
    if (!el || !enabled || typeof window === 'undefined') return;

    let raf = 0;
    let last = 0;
    let current = value.get();

    const frame = (now: number) => {
      const dt = last === 0 ? 1 / 60 : (now - last) / 1000;
      last = now;
      const rect = el.getBoundingClientRect();
      const target = progressFromRect({ top: rect.top, height: rect.height }, window.innerHeight, band);
      if (target !== null) {
        const next = dampedFollow(current, target, dt, tau);
        current = shouldLatch ? Math.max(current, next) : next;
        value.set(current);
      }
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [ref, band, tau, shouldLatch, enabled, value, reduced]);

  return value;
}

/* ------------------------------------------------------------------ */
/* P5 · ring drag plumbing                                             */
/* ------------------------------------------------------------------ */

export interface RingDragOptions {
  /** The ring as captured — the base a new draft starts from. */
  captured: ReadonlyArray<Vertex>;
  bounds: Bounds;
  viewBox: ViewBox;
  /** The box the drawing lives in; measured once per gesture, never per frame. */
  boxRef: React.RefObject<HTMLElement | null>;
  /** Metres of snapping; 0 keeps the drag at the capture's own precision. */
  precisionM?: number;
  /**
   * Words the announcement for a ring the hook has just produced.
   *
   * The hook owns the *state* of the message and the consumer owns its *wording*,
   * because wording a measurement means asking the shipped module
   * (`services/siteBoundary.metricsFor`) for a verdict, and pure plumbing should
   * not know about a statutory gate. Passing a ring in — rather than letting the
   * consumer read the hook's draft — is also what keeps this hook free of the
   * dependency cycle that would otherwise exist between a draft and the metrics
   * computed from it.
   */
  describe?: (ring: ReadonlyArray<Vertex>) => string;
}

export interface RingDrag {
  dragIndex: number | null;
  /** The edited ring, or null when the capture is untouched. */
  draft: Vertex[] | null;
  onHandleDown: (index: number) => (event: React.PointerEvent<HTMLButtonElement>) => void;
  onHandleMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onHandleUp: () => void;
  /** Arrow keys nudge a focused corner; Shift steps a whole metre. */
  onHandleKey: (index: number) => (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  reset: () => void;
  /** The live announcement (polite, not assertive — it changes per drag step). */
  message: string;
}

/**
 * The drag plumbing: pointer capture, a single layout read per gesture, and a
 * draft ring that is an OVERRIDE rather than a copy (`draft === null` means "the
 * captured ring, untouched"), so switching samples cannot leave a stale draft
 * behind and Reset is one assignment.
 *
 * All the coordinate maths lives in `./drag` and `./pointer`; this hook only
 * decides when it runs. Pointer capture is a convenience, not a requirement:
 * `setPointerCapture` throws for a pointer id the browser does not consider
 * active, which an evidence harness driving the page can produce, and a drag that
 * died because capture failed would be a real defect.
 */
export function useRingDrag(options: RingDragOptions): RingDrag {
  const { captured, bounds, viewBox, boxRef, precisionM = 0, describe } = options;
  const [draft, setDraft] = useState<Vertex[] | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  const grab = useRef<{ index: number; client: { x: number; y: number }; plane: Vertex } | null>(null);
  const metresPerPx = useRef(1);

  /** The ring the gesture edits: the draft if there is one, else a copy of the capture. */
  const source = useCallback(
    (): Vertex[] => (draft ?? captured).map((vertex) => ({ x: vertex.x, y: vertex.y })),
    [draft, captured],
  );

  const onHandleDown = useCallback(
    (index: number) => (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const box = boxRef.current;
      if (!box) return;
      /* ONE layout read, at the start of the gesture, on a box that is never
         transformed — so screen pixels → plane metres is exact and stable for the
         whole drag, and nothing below touches layout. */
      const rect = box.getBoundingClientRect();
      metresPerPx.current = viewBox.w / Math.max(1, rect.width);
      /* The origin is the vertex as the reader sees it NOW — the draft if there is
         one, otherwise the capture — which is why this reads through `source()`
         rather than from a ring passed in at render time. */
      const origin = source()[index];
      if (!origin) return;
      grab.current = { index, client: { x: event.clientX, y: event.clientY }, plane: { ...origin } };
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* pointer had no active capture target — the drag proceeds on the button */
      }
      setDragIndex(index);
    },
    [boxRef, source, viewBox.w],
  );

  const onHandleMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const start = grab.current;
      if (!start) return;
      const point = draggedPoint(
        start.plane,
        event.clientX - start.client.x,
        event.clientY - start.client.y,
        metresPerPx.current,
      );
      setDraft(moveVertex(source(), start.index, point, bounds, precisionM));
    },
    [bounds, precisionM, source],
  );

  const onHandleUp = useCallback(() => {
    const start = grab.current;
    grab.current = null;
    setDragIndex(null);
    /* Announce against the ring the gesture produced, which is the current draft
       (a drag writes one per move, so this is the settled value). */
    if (start && describe) setMessage(describe(source()));
  }, [describe, source]);

  const onHandleKey = useCallback(
    (index: number) => (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const result = nudgeVertex(source(), index, event.key, stepFor(event.shiftKey), bounds, precisionM);
      if (!result) return;
      event.preventDefault();
      setDraft(result);
      if (describe) setMessage(describe(result));
    },
    [bounds, precisionM, source, describe],
  );

  const reset = useCallback(() => {
    setDraft(null);
    setMessage('');
  }, []);

  return { dragIndex, draft, onHandleDown, onHandleMove, onHandleUp, onHandleKey, reset, message };
}

/* NOTE: no re-exports of the cores' types here on purpose. This module is
   re-exported wholesale by `./index`, and a second export of `Capability`,
   `BeatPosition` or `Bounds` would be an ambiguous star export — the barrel would
   silently drop the name instead of resolving it. Import a type from its own
   module. */
