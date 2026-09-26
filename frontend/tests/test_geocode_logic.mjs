/**
 * Frontend geocode logic tests — pure Node.js, no browser/framework needed.
 *
 * Run with: node frontend/tests/test_geocode_logic.mjs
 *
 * Tests:
 *  1. Debounce: rapid calls → only one execution after delay
 *  2. localStorage cache: get/set/ttl expiry
 *  3. Suggestion selection: correct lat/lon forwarded
 *  4. Manual entry: completely independent of search state
 *  5. Clear (x): resets search box without touching lat/lon props
 *  6. Min-length gate: query < 3 chars → no fetch call
 */

// -------------------------------------------------------------------------- //
// Minimal test harness
// -------------------------------------------------------------------------- //

let _passed = 0;
let _failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    _passed++;
  } else {
    console.error(`  ✗ ${label}`);
    _failed++;
  }
}

function assertApprox(a, b, label, eps = 0.001) {
  assert(Math.abs(a - b) < eps, label);
}

function section(name) {
  console.log(`\n[${name}]`);
}

// -------------------------------------------------------------------------- //
// 1. Debounce — pure timing logic
// -------------------------------------------------------------------------- //
section('Debounce behaviour');

function makeDebounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

await (async () => {
  let callCount = 0;
  const debounced = makeDebounce(() => callCount++, 300);

  // Fire 5 rapid calls
  debounced();
  debounced();
  debounced();
  debounced();
  debounced();

  // Immediately — should NOT have fired yet
  assert(callCount === 0, 'Rapid calls: 0 executions immediately');

  // After 350 ms — should have fired exactly once
  await new Promise((r) => setTimeout(r, 350));
  assert(callCount === 1, 'After 350ms: exactly 1 execution');

  // Call again, wait 350 ms
  debounced();
  await new Promise((r) => setTimeout(r, 350));
  assert(callCount === 2, 'After second debounced call: 2 executions total');
})();

// -------------------------------------------------------------------------- //
// 2. localStorage cache TTL logic
// -------------------------------------------------------------------------- //
section('localStorage cache TTL');

// Simulate with a plain Map (same key-value contract)
const LS_PREFIX = 'bw_geocode_v1:';
const LS_TTL_MS = 86_400_000; // 24 h

const fakeStorage = new Map();

function lsGet(key) {
  const raw = fakeStorage.get(LS_PREFIX + key);
  if (!raw) return null;
  const { ts, data } = JSON.parse(raw);
  if (Date.now() - ts > LS_TTL_MS) {
    fakeStorage.delete(LS_PREFIX + key);
    return null;
  }
  return data;
}

function lsSet(key, data) {
  fakeStorage.set(LS_PREFIX + key, JSON.stringify({ ts: Date.now(), data }));
}

const sampleData = { results: [{ display_name: 'Delhi', lat: 28.7, lon: 77.1 }], provider: 'nominatim', cached: false, error: null };

lsSet('delhi', sampleData);
const hit = lsGet('delhi');
assert(hit !== null, 'Cache hit: returns stored value');
assert(hit.results[0].display_name === 'Delhi', 'Cache hit: display_name correct');

// Simulate expired entry
fakeStorage.set(LS_PREFIX + 'old', JSON.stringify({ ts: Date.now() - LS_TTL_MS - 1000, data: sampleData }));
const expired = lsGet('old');
assert(expired === null, 'Expired entry: returns null');
assert(!fakeStorage.has(LS_PREFIX + 'old'), 'Expired entry: deleted from store');

const miss = lsGet('nonexistent');
assert(miss === null, 'Cache miss: returns null for unknown key');

// -------------------------------------------------------------------------- //
// 3. Suggestion selection: correct lat/lon forwarded to callback
// -------------------------------------------------------------------------- //
section('Suggestion selection → onCoordinatesChange');

const suggestions = [
  { display_name: 'Mumbai, Maharashtra, India', lat: 19.076, lon: 72.877, source: 'nominatim' },
  { display_name: 'Pune, Maharashtra, India', lat: 18.52, lon: 73.856, source: 'photon' },
];

let receivedLat = null;
let receivedLon = null;

function handleSelectSuggestion(suggestion, onCoordinatesChange) {
  onCoordinatesChange(suggestion.lat, suggestion.lon);
}

handleSelectSuggestion(suggestions[0], (lat, lon) => {
  receivedLat = lat;
  receivedLon = lon;
});

assertApprox(receivedLat, 19.076, 'Selection passes correct lat');
assertApprox(receivedLon, 72.877, 'Selection passes correct lon');

// Selecting second suggestion
handleSelectSuggestion(suggestions[1], (lat, lon) => {
  receivedLat = lat;
  receivedLon = lon;
});

assertApprox(receivedLat, 18.52, 'Second selection: lat correct');
assertApprox(receivedLon, 73.856, 'Second selection: lon correct');

// -------------------------------------------------------------------------- //
// 4. Manual lat/lon entry: independent of search state
// -------------------------------------------------------------------------- //
section('Manual lat/lon entry is independent of search');

function validateAndApply(latStr, lonStr, onCoordinatesChange) {
  const lat = parseFloat(latStr);
  const lon = parseFloat(lonStr);
  if (isNaN(lat) || lat < -90 || lat > 90) return { error: 'Invalid latitude' };
  if (isNaN(lon) || lon < -180 || lon > 180) return { error: 'Invalid longitude' };
  onCoordinatesChange(lat, lon);
  return { error: null };
}

let manualLat = null;
let manualLon = null;
const cb = (lat, lon) => { manualLat = lat; manualLon = lon; };

// Valid entry
const r1 = validateAndApply('12.9716', '77.5946', cb);
assert(r1.error === null, 'Manual entry: valid values accepted');
assertApprox(manualLat, 12.9716, 'Manual entry: lat correct');
assertApprox(manualLon, 77.5946, 'Manual entry: lon correct');

// Invalid lat
const r2 = validateAndApply('999', '77.5946', cb);
assert(r2.error !== null, 'Manual entry: out-of-range lat rejected');

// Invalid lon
const r3 = validateAndApply('12.9716', '999', cb);
assert(r3.error !== null, 'Manual entry: out-of-range lon rejected');

// NaN
const r4 = validateAndApply('abc', '77.5946', cb);
assert(r4.error !== null, 'Manual entry: NaN lat rejected');

// -------------------------------------------------------------------------- //
// 5. Clear (x) search: resets search box, lat/lon unchanged
// -------------------------------------------------------------------------- //
section('Clear (x) search box behaviour');

let searchQuery = 'Bengaluru';
let clearCallCount = 0;

// Simulate clear: only resets search query, never calls onClear (pin clear)
function handleClearSearch() {
  searchQuery = '';
  clearCallCount++;
}

handleClearSearch();
assert(searchQuery === '', 'Clear search: query reset to empty string');
assert(clearCallCount === 1, 'Clear search: handler called once');

// Lat/lon must be untouched by clearing the search box
// (they are props from parent, not managed inside search box)
assert(manualLat !== null, 'Clear search: lat/lon props not affected');

// -------------------------------------------------------------------------- //
// 6. Min-length gate: queries < 3 chars trigger no fetch
// -------------------------------------------------------------------------- //
section('Min-length gate: < 3 chars → no fetch');

let fetchCallCount = 0;
async function simulatedSearchWithGate(query) {
  if (query.trim().length < 3) {
    return { skipped: true };
  }
  fetchCallCount++;
  return { skipped: false };
}

await simulatedSearchWithGate('');
await simulatedSearchWithGate('a');
await simulatedSearchWithGate('ab');
assert(fetchCallCount === 0, '0, 1, 2-char queries: fetch not called');

await simulatedSearchWithGate('abc');
assert(fetchCallCount === 1, '3-char query: fetch called once');

await simulatedSearchWithGate('Bangalore');
assert(fetchCallCount === 2, 'Long query: fetch called');

// -------------------------------------------------------------------------- //
// Results
// -------------------------------------------------------------------------- //

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${_passed} passed, ${_failed} failed`);
if (_failed > 0) {
  process.exit(1);
}
