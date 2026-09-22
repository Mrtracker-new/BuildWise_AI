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
    <div className="@container bg-white rounded-lg border border-slate-200 p-4 @sm:p-5 shadow-sm space-y-3.5 min-w-0 w-full">
      <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="map-pin" size={16} className="text-slate-700 shrink-0" />
          <h2 className="text-[15px] font-semibold text-slate-900 tracking-tight whitespace-normal break-words">
            Site Coordinates
          </h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs uppercase tracking-wider font-semibold text-slate-500 font-mono">
            WGS84
          </span>
          {latitude !== null && longitude !== null && (
            <button
              type="button"
              onClick={onClear}
              className="text-xs text-slate-500 hover:text-rose-600 flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded"
            >
              <Icon name="x" size={13} />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      <form onSubmit={handleApply} className="space-y-3 min-w-0">
        <div className="grid grid-cols-1 @xs:grid-cols-2 gap-3 min-w-0">
          <div className="min-w-0">
            <label htmlFor="lat-input" className="block text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1 whitespace-normal break-words">
              Latitude
            </label>
            <input
              id="lat-input"
              type="text"
              value={latInput}
              onChange={(e) => setLatInput(e.target.value)}
              placeholder="e.g. 12.9716"
              className="w-full h-10 text-sm font-mono px-3 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 transition-colors"
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="lon-input" className="block text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1 whitespace-normal break-words">
              Longitude
            </label>
            <input
              id="lon-input"
              type="text"
              value={lonInput}
              onChange={(e) => setLonInput(e.target.value)}
              placeholder="e.g. 77.5946"
              className="w-full h-10 text-sm font-mono px-3 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 transition-colors"
            />
          </div>
        </div>

        {inputError && (
          <p className="text-xs text-rose-600 font-medium whitespace-normal break-words">{inputError}</p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 min-w-0">
          <span className="text-xs text-slate-400 whitespace-normal break-words">
            Click map or enter manually
          </span>
          <button
            type="submit"
            className="h-10 px-4 text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded transition-colors shrink-0"
          >
            Update Pin
          </button>
        </div>
      </form>

      {formattedAddress && (
        <div className="pt-2.5 border-t border-slate-100 flex items-start gap-2 min-w-0">
          <Icon name="crosshair" size={14} className="text-slate-400 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-600 leading-snug whitespace-normal break-words min-w-0 flex-1">
            {formattedAddress}
          </p>
        </div>
      )}
    </div>
  );
};
