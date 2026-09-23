import React, { useState, useEffect } from 'react';
import { Icon } from './Icon';

interface CoordinatesInputProps {
  latitude: number | null;
  longitude: number | null;
  formattedAddress?: string;
  onCoordinatesChange: (lat: number, lon: number) => void;
  onClear: () => void;
}

export const CoordinatesInput: React.FC<CoordinatesInputProps> = ({
  latitude,
  longitude,
  formattedAddress,
  onCoordinatesChange,
  onClear,
}) => {
  const [latInput, setLatInput] = useState<string>('');
  const [lonInput, setLonInput] = useState<string>('');
  const [inputError, setInputError] = useState<string | null>(null);

  useEffect(() => {
    if (latitude !== null) setLatInput(latitude.toFixed(5));
    else setLatInput('');
    if (longitude !== null) setLonInput(longitude.toFixed(5));
    else setLonInput('');
    setInputError(null);
  }, [latitude, longitude]);

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(latInput);
    const lon = parseFloat(lonInput);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      setInputError('Latitude must be between -90.0 and +90.0 degrees.');
      return;
    }
    if (isNaN(lon) || lon < -180 || lon > 180) {
      setInputError('Longitude must be between -180.0 and +180.0 degrees.');
      return;
    }

    setInputError(null);
    onCoordinatesChange(lat, lon);
  };

  return (
    <div className="space-y-3.5 w-full min-w-0">
      {/* Section Header */}
      <div className="flex items-center justify-between border-b border-[var(--hairline)] pb-2.5 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="map-pin" size={15} className="text-[var(--text-2)] shrink-0" />
          <h2 className="text-[15px] font-semibold text-[var(--text-1)] tracking-tight">
            Site Coordinates
          </h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]">
            WGS84
          </span>
          {latitude !== null && longitude !== null && (
            <button
              type="button"
              onClick={onClear}
              className="text-[12px] text-[var(--text-2)] hover:text-[var(--semantic-red)] flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded-[6px]"
              title="Clear coordinates"
            >
              <Icon name="x" size={12} />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      <form onSubmit={handleApply} className="space-y-3 min-w-0">
        <div className="grid grid-cols-2 gap-2.5 min-w-0">
          <div className="min-w-0">
            <label
              htmlFor="lat-input"
              className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)] mb-1"
            >
              Latitude
            </label>
            <input
              id="lat-input"
              type="text"
              value={latInput}
              onChange={(e) => setLatInput(e.target.value)}
              placeholder="e.g. 12.9716"
              className="w-full bg-[var(--fill)] border-0 rounded-[10px] px-3 py-2 text-[13px] font-medium text-[var(--text-1)] outline-none focus:ring-[3px] focus:ring-[var(--accent)]/25 transition-all placeholder:text-[var(--text-3)]"
            />
          </div>
          <div className="min-w-0">
            <label
              htmlFor="lon-input"
              className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)] mb-1"
            >
              Longitude
            </label>
            <input
              id="lon-input"
              type="text"
              value={lonInput}
              onChange={(e) => setLonInput(e.target.value)}
              placeholder="e.g. 77.5946"
              className="w-full bg-[var(--fill)] border-0 rounded-[10px] px-3 py-2 text-[13px] font-medium text-[var(--text-1)] outline-none focus:ring-[3px] focus:ring-[var(--accent)]/25 transition-all placeholder:text-[var(--text-3)]"
            />
          </div>
        </div>

        {inputError && (
          <p className="text-[12px] text-[var(--semantic-red)] font-medium leading-snug">{inputError}</p>
        )}

        {/* Update Pin Action: flat --accent, white 13px/600, radius 12, height 36, full width; press = brightness(0.95) */}
        <button
          type="submit"
          className="w-full h-9 bg-[var(--accent)] text-white text-[13px] font-semibold rounded-[12px] transition-all duration-200 hover:brightness-[0.98] active:brightness-95 flex items-center justify-center gap-1.5 shadow-sm"
        >
          <span>Update Pin</span>
        </button>
      </form>

      {formattedAddress && (
        <div className="pt-2 border-t border-[var(--hairline)] flex items-start gap-2 min-w-0">
          <Icon name="crosshair" size={14} className="text-[var(--text-3)] mt-0.5 shrink-0" />
          <p className="text-[13px] text-[var(--text-2)] leading-[1.5] min-w-0 flex-1">
            {formattedAddress}
          </p>
        </div>
      )}
    </div>
  );
};
