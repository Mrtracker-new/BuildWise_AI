import React, { useState } from 'react';
import type { AnalysisResponse, ReportRequestPayload } from '../services/types';
import { downloadPdfReport } from '../services/api';
import { Icon } from './Icon';

interface DownloadReportButtonProps {
  payload?: ReportRequestPayload;
  analysisData?: AnalysisResponse;
}

export const DownloadReportButton: React.FC<DownloadReportButtonProps> = ({ payload, analysisData }) => {
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
