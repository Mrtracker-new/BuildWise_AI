/**
 * numberFormat.ts — cached Intl formatters.
 * ========================================
 * `new Intl.NumberFormat(...)` is not cheap: it resolves locale data and
 * options on every construction. The report constructs one per money field per
 * render, and the CPU profile of a single 5 s report scroll attributed ~42 ms of
 * self time to `formatINR` alone — with several call sites that is the same
 * formatter being rebuilt hundreds of times.
 *
 * One instance per (locale + options shape), built on first use and reused.
 * Formatters are immutable, so a module-level cache is safe to share.
 */

const cache = new Map<string, Intl.NumberFormat>();

/** Options shape that identifies a formatter for caching purposes. */
function keyOf(locale: string, options: Intl.NumberFormatOptions): string {
  return [
    locale,
    options.style ?? '',
    options.currency ?? '',
    options.notation ?? '',
    options.maximumFractionDigits ?? '',
    options.minimumFractionDigits ?? '',
    options.signDisplay ?? '',
  ].join('|');
}

/** A shared Intl.NumberFormat for this locale + options shape. */
export function intlNumberFormat(
  locale: string,
  options: Intl.NumberFormatOptions = {}
): Intl.NumberFormat {
  const key = keyOf(locale, options);
  let formatter = cache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    cache.set(key, formatter);
  }
  return formatter;
}

/** ₹12,34,567 — Indian digit grouping, no paise. The report's money format. */
export function formatINR(value: number): string {
  return intlNumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Indian-grouped number, no currency symbol and no paise (2,450).
 *
 * This is the shared replacement for the raw `value.toLocaleString('en-IN')`
 * calls scattered through the report: each of those constructs a throwaway
 * formatter, and on integer input the output is identical.
 */
export function formatIN(value: number): string {
  return intlNumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value);
}

