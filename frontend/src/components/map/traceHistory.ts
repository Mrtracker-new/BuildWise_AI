/**
 * traceHistory.ts — history stack for the premium boundary tracing session.
 * ======================================================================
 * PURE logic (no map, no React): every accepted mutation of the vertex ring
 * — place, drag, insert, delete, reset, import, preset — is recorded here so
 * ⌘Z / ⇧⌘Z can walk the ring back to the exact spec'd state (undo pops with
 * NO UI lag: undo/redo are synchronous array swaps, not re-derivation).
 *
 * The stack stores FULL ring snapshots (vertex rings are tiny — dozens of {x,y}
 * pairs), which makes undo/redo O(1) and immune to interleaved mutations.
 */

import type { Vertex } from '../../services/boundaryIO';

const MAX_HISTORY = 128;

export class TraceHistory {
  private past: Vertex[][] = [];
  private future: Vertex[][] = [];

  constructor(initial: Vertex[] = []) {
    // The committed/current ring is implicit in the caller; history starts
    // empty so the first mutation has something to undo.
    void initial;
  }

  /** Record the state that existed BEFORE a new mutation is applied. */
  push(snapshotBefore: Vertex[]): void {
    this.past.push([...snapshotBefore]);
    if (this.past.length > MAX_HISTORY) this.past.shift();
    // A new action kills the redo branch (standard editor behavior).
    this.future = [];
  }

  /** Undo: returns the previous ring, or null when nothing to undo. */
  undo(current: Vertex[]): Vertex[] | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push([...current]);
    return prev;
  }

  /** Redo: returns the ring that was undone, or null when nothing to redo. */
  redo(current: Vertex[]): Vertex[] | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push([...current]);
    return next;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}
