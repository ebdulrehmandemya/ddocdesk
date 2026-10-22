"use client";
import { useState, useEffect } from "react";
import { apiDownload } from "@/lib/api";

interface DocumentViewerProps {
  workspaceId: string;
  documentId: string;
  fileName: string;
  mimeType: string;
  onClose: () => void;
}

export default function DocumentViewer({
  workspaceId,
  documentId,
  fileName,
  mimeType,
  onClose,
}: DocumentViewerProps) {
  const previewUrl = `/api/backend/workspaces/${workspaceId}/documents/${documentId}/preview`;
  const isPdf = mimeType === "application/pdf";
  const isAudio = mimeType?.startsWith("audio/") || 
    fileName.endsWith(".mp3") || 
    fileName.endsWith(".wav") || 
    fileName.endsWith(".m4a") ||
    fileName.endsWith(".ogg") ||
    fileName.endsWith(".flac");
  const isVideo = mimeType?.startsWith("video/") || 
    fileName.endsWith(".mp4") || 
    fileName.endsWith(".webm");

  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isPdf && !isAudio && !isVideo);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (isPdf || isAudio || isVideo) return;

    let isActive = true;
    
    fetch(previewUrl)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load preview (${res.status})`);
        return res.text();
      })
      .then(text => {
        if (isActive) {
          setTextContent(text);
          setLoading(false);
        }
      })
      .catch(err => {
        if (isActive) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [previewUrl, isPdf, isAudio, isVideo]);

  // Fetch transcription for audio files
  useEffect(() => {
    if (!isAudio) return;

    let isActive = true;
    
    fetch(previewUrl)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load transcription (${res.status})`);
        return res.text();
      })
      .then(text => {
        if (isActive && text && text.length > 0) {
          setTextContent(text);
        }
      })
      .catch(() => {
        // Transcription might not be available yet
      });

    return () => {
      isActive = false;
    };
  }, [previewUrl, isAudio]);

  const fileIcon = isPdf ? "📕" : isAudio ? "🎙️" : isVideo ? "🎬" : mimeType?.includes("wordprocessing") ? "📘" : "📄";
  const fileTypeLabel = isPdf ? "PDF" : isAudio ? "Audio File" : isVideo ? "Video File" : mimeType?.includes("wordprocessing") ? "Word Document" : "Text File";

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-[92vw] h-[92vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-2xl shrink-0">{fileIcon}</span>
            <div className="min-w-0">
              <h2 className="font-semibold text-slate-900 dark:text-white truncate text-sm">
                {fileName}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{fileTypeLabel}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => apiDownload(
                `/workspaces/${workspaceId}/documents/${documentId}/download`,
                fileName
              )}
              className="p-2 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              title="Download original file"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              title="Close (Esc)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden bg-slate-100 dark:bg-slate-950">
          {isPdf ? (
            <iframe
              src={previewUrl}
              className="w-full h-full border-0"
              title={fileName}
            />
          ) : isAudio ? (
            <div className="flex flex-col items-center justify-center h-full gap-6 p-8 overflow-auto">
              <div className="text-6xl">🎙️</div>
              <p className="text-lg font-medium text-slate-700 dark:text-slate-300 text-center">{fileName}</p>
              <audio controls className="w-full max-w-md" src={previewUrl}>
                Your browser does not support the audio element.
              </audio>
              {textContent && (
                <div className="w-full max-w-2xl mt-6">
                  <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase mb-3">Transcription</h3>
                  <div className="max-h-64 overflow-y-auto p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                    <pre className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
                      {textContent}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          ) : isVideo ? (
            <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
              <div className="text-6xl">🎬</div>
              <p className="text-lg font-medium text-slate-700 dark:text-slate-300 text-center">{fileName}</p>
              <video controls className="w-full max-w-2xl rounded-xl" src={previewUrl}>
                Your browser does not support the video element.
              </video>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading preview…
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-red-500 dark:text-red-400 font-medium mb-2">Failed to load preview</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{error}</p>
              </div>
            </div>
          ) : (
            <div className="h-full overflow-auto p-6">
              <pre className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono leading-relaxed max-w-4xl mx-auto">
                {textContent}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
