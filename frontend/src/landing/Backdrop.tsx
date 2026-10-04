/**
 * Backdrop.tsx — the landing's ambient page layer.
 * A fixed, pointer-transparent backdrop that turns the empty gutters at
 * wide viewports into part of the composition: a faint architectural
 * blueprint grid, accent glows echoing the palette, a giant outline
 * compass rose, and surveyor-style coordinate annotations. Sections
 * render transparent above it; the hero's photo sits opaque on top.
 */
export const Backdrop: React.FC = () => (
  <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
    {/* Blueprint grid — masked toward the center so the mockup stays clean */}
    <div
      className="absolute inset-0"
      style={{
        backgroundImage:
          'linear-gradient(rgba(47,111,237,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(47,111,237,0.055) 1px, transparent 1px)',
        backgroundSize: '56px 56px',
        maskImage: 'radial-gradient(1200px 800px at 50% 42%, transparent 38%, black 78%)',
        WebkitMaskImage: 'radial-gradient(1200px 800px at 50% 42%, transparent 38%, black 78%)',
      }}
    />

    {/* Accent glows */}
    <div
      className="absolute -left-40 top-[16%] h-[560px] w-[560px] rounded-full"
      style={{ background: 'radial-gradient(closest-side, rgba(47,111,237,0.10), transparent)' }}
    />
    <div
      className="absolute -right-48 top-[46%] h-[640px] w-[640px] rounded-full"
      style={{ background: 'radial-gradient(closest-side, rgba(106,166,255,0.12), transparent)' }}
    />
    <div
      className="absolute left-[14%] bottom-[-180px] h-[520px] w-[520px] rounded-full"
      style={{ background: 'radial-gradient(closest-side, rgba(31,169,85,0.07), transparent)' }}
    />

    {/* Giant outline compass rose — right gutter */}
    <svg
      viewBox="0 0 400 400"
      className="absolute right-[-150px] top-[34%] hidden h-[420px] w-[420px] 2xl:block"
      style={{ opacity: 0.1 }}
    >
      <g fill="none" stroke="#2f6fed" strokeWidth="1.4">
        <circle cx="200" cy="200" r="188" />
        <circle cx="200" cy="200" r="146" strokeDasharray="3 6" />
        {Array.from({ length: 72 }, (_, i) => {
          const a = (i * Math.PI) / 36;
          const inner = i % 6 === 0 ? 158 : 176;
          return (
            <line
              key={i}
              x1={200 + inner * Math.sin(a)}
              y1={200 - inner * Math.cos(a)}
              x2={200 + 188 * Math.sin(a)}
              y2={200 - 188 * Math.cos(a)}
              strokeWidth={i % 18 === 0 ? 2 : 1}
            />
          );
        })}
        <polygon points="200,38 216,200 200,362 184,200" fill="rgba(47,111,237,0.08)" />
        <polygon points="38,200 200,184 362,200 200,216" fill="rgba(47,111,237,0.05)" />
      </g>
      <text x="200" y="26" textAnchor="middle" fontSize="19" fontWeight="700" fill="#2f6fed" fontFamily="Inter, sans-serif">N</text>
    </svg>

    {/* Surveyor coordinate annotations — left gutter */}
    <div className="absolute left-8 top-[38%] hidden flex-col gap-5 font-mono text-[10.5px] font-medium text-[#2f6fed] 2xl:flex" style={{ opacity: 0.32 }}>
      <div>
        <p>LAT 12.9716° N</p>
        <p className="text-[#8a93a3]">LON 77.5946° E</p>
      </div>
      <div>
        <p>PLOT 2,450 m²</p>
        <p className="text-[#8a93a3]">ZONE III · IS 1893</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="h-px w-10 bg-[#2f6fed]" style={{ opacity: 0.5 }} />
        <span>0.61 AC</span>
      </div>
    </div>
    <div className="absolute bottom-[12%] right-10 hidden flex-col items-end gap-3 font-mono text-[10.5px] font-medium text-[#2f6fed] 2xl:flex" style={{ opacity: 0.3 }}>
      <span>SCALE 1 : 500</span>
      <span className="text-[#8a93a3]">DATUM WGS 84</span>
    </div>
  </div>
);
