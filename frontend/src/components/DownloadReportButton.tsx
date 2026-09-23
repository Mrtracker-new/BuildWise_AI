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
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleDownload}
        disabled={isDownloading}
        className={`w-full h-11 px-4 rounded-md font-medium text-sm flex items-center justify-center gap-2 border transition-all ${
          isDownloading
            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
            : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300 shadow-sm hover:border-slate-400'
        }`}
      >
        {isDownloading ? (
          <>
            <Icon name="loader" size={16} />
            <span>Compiling Technical Vector PDF...</span>
          </>
        ) : (
          <>
            <Icon name="download" size={16} />
            <span>Download Engineering Feasibility Report (PDF)</span>
          </>
        )}
      </button>

      {downloadError && (
        <p className="text-xs text-rose-600 font-medium text-center">
          {downloadError}
        </p>
      )}
    </div>
  );
};
