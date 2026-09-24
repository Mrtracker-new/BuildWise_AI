import React, { useState } from 'react';
import type { AnalysisResponse, ReportRequestPayload } from '../services/types';
import { downloadPdfReport } from '../services/api';
import { Icon } from './Icon';

interface DownloadReportButtonProps {
  payload?: ReportRequestPayload;
  analysisData?: AnalysisResponse;
  variant?: 'primary' | 'compact';
}

export const DownloadReportButton: React.FC<DownloadReportButtonProps> = ({
  payload,
  analysisData,
  variant = 'primary',
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownload = async () => {
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const dataToDownload = payload || analysisData;
      if (!dataToDownload) {
        throw new Error('No analysis data available to compile report.');
      }
      await downloadPdfReport(dataToDownload);
    } catch (err: any) {
      setDownloadError(err.message || 'Failed to generate PDF report.');
    } finally {
      setIsDownloading(false);
    }
  };

  if (variant === 'compact') {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={handleDownload}
          disabled={isDownloading}
          title="Download complete PDF report"
          className={`h-8 px-3 rounded-[10px] text-[12px] font-medium flex items-center gap-1.5 transition-all select-none shadow-sm ${
            isDownloading
              ? 'bg-[var(--fill)] text-[var(--text-3)] cursor-not-allowed'
              : 'bg-[var(--accent)] text-white hover:brightness-[0.98] active:brightness-95 cursor-pointer'
          }`}
        >
          {isDownloading ? (
            <>
              <Icon name="loader" size={13} className="animate-spin" />
              <span className="hidden sm:inline">Generating PDF...</span>
            </>
          ) : (
            <>
              <Icon name="download" size={13} />
              <span>Download PDF</span>
            </>
          )}
        </button>
        {downloadError && (
          <div className="absolute right-0 top-full mt-1.5 w-48 p-2 rounded-[8px] bg-[var(--surface)] border border-[var(--semantic-red)]/40 shadow-lg text-[11px] text-[var(--semantic-red)] z-50">
            {downloadError}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-2">
      <button
        type="button"
        onClick={handleDownload}
        disabled={isDownloading}
        className={`w-full h-10 px-4 rounded-[12px] font-semibold text-[13px] flex items-center justify-center gap-2 transition-all duration-200 select-none shadow-sm ${
          isDownloading
            ? 'bg-[var(--fill)] text-[var(--text-3)] cursor-not-allowed'
            : 'bg-[var(--accent)] text-white hover:brightness-[0.98] active:brightness-95 cursor-pointer'
        }`}
      >
        {isDownloading ? (
          <>
            <Icon name="loader" size={15} className="animate-spin" />
            <span>Compiling Technical Vector PDF...</span>
          </>
        ) : (
          <>
            <Icon name="download" size={15} />
            <span>Download Engineering Feasibility Report (PDF)</span>
          </>
        )}
      </button>

      {downloadError && (
        <p className="text-[12px] text-[var(--semantic-red)] font-medium text-center">
          {downloadError}
        </p>
      )}
    </div>
  );
};
