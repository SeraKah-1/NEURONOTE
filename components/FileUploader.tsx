
import React, { useRef, useState } from 'react';
import { Upload, X, FileText, File as FileIcon, Image as ImageIcon, AlertTriangle, FileType, CheckCircle2 } from 'lucide-react';
import { UploadedFile } from '../types';

interface FileUploaderProps {
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
}

const FileUploader: React.FC<FileUploaderProps> = ({ files, onFilesChange }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pptWarning, setPptWarning] = useState(false);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(Array.from(e.target.files));
    }
  };

  const processFiles = async (fileList: File[]) => {
    const newFiles: UploadedFile[] = [];
    let hasPpt = false;

    for (const file of fileList) {
      // 1. Soft Check for PPT/PPTX
      if (file.name.match(/\.(ppt|pptx)$/i) || file.type.includes('presentation')) {
        hasPpt = true;
        continue; // Skip processing, but trigger warning UI
      }

      try {
        const base64Data = await readFileAsBase64(file);
        
        let mimeType = file.type;
        const ext = file.name.split('.').pop()?.toLowerCase();

        // Manual overrides for text-based files to ensure compatibility
        if (ext === 'md' || ext === 'txt') {
            mimeType = 'text/plain';
        } else if (!mimeType) {
            // Default fallback
            mimeType = 'application/octet-stream';
        }

        newFiles.push({
          name: file.name,
          mimeType: mimeType,
          data: base64Data
        });
      } catch (err) {
        console.error(`Failed to read file ${file.name}`, err);
      }
    }
    
    if (hasPpt) {
      setPptWarning(true);
      // Auto-dismiss warning after 10 seconds so it doesn't annoy forever
      setTimeout(() => setPptWarning(false), 10000); 
    }

    if (newFiles.length > 0) {
      onFilesChange([...files, ...newFiles]);
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const removeFile = (index: number) => {
    const updated = files.filter((_, i) => i !== index);
    onFilesChange(updated);
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('pdf')) return <FileText size={16} className="text-red-400" />;
    if (mimeType.includes('image')) return <ImageIcon size={16} className="text-purple-400" />;
    if (mimeType.includes('text')) return <FileText size={16} className="text-gray-400" />;
    return <FileIcon size={16} className="text-blue-400" />;
  };

  return (
    <div className="w-full space-y-3">
      <div 
        onClick={() => inputRef.current?.click()}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative overflow-hidden rounded-xl border-2 border-dashed p-6 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 group
          ${isDragging 
            ? 'border-neuro-primary bg-neuro-primary/10 scale-[1.02] shadow-[0_0_30px_rgba(99,102,241,0.2)]' 
            : 'border-gray-700 bg-gray-900/30 hover:bg-gray-800/50 hover:border-gray-500'
          }
        `}
      >
        <div className={`transition-transform duration-300 ${isDragging ? 'scale-110 -translate-y-1' : 'group-hover:-translate-y-1'}`}>
          <Upload className={`mb-3 transition-colors ${isDragging ? 'text-neuro-primary' : 'text-gray-500 group-hover:text-neuro-primary'}`} size={32} />
        </div>
        
        <p className="text-sm text-gray-300 font-medium text-center">
          {isDragging ? "Drop files to analyze" : "Click or Drag files here"}
        </p>
        
        <p className="text-[10px] text-gray-500 mt-2 text-center leading-relaxed max-w-[220px]">
          We support <span className="text-gray-300 font-bold">PDF, Images, & Text</span>.
          <br/>
          <span className="opacity-70">For Slides, please export as PDF.</span>
        </p>

        <input 
          type="file" 
          ref={inputRef} 
          onChange={handleFileChange} 
          className="hidden" 
          multiple 
          accept=".pdf,.md,.txt,.jpg,.jpeg,.png,.webp,.ppt,.pptx" 
        />
      </div>

      {/* --- Cognitive Feedback: PPT Warning --- */}
      {pptWarning && (
        <div className="bg-amber-900/20 border border-amber-500/30 p-3 rounded-lg flex items-start gap-3 animate-slide-up">
          <div className="bg-amber-500/20 p-1.5 rounded-full shrink-0">
             <AlertTriangle size={14} className="text-amber-500" />
          </div>
          <div className="flex-1">
             <h4 className="text-xs font-bold text-amber-200 mb-0.5">PowerPoint File Detected</h4>
             <p className="text-[10px] text-amber-200/70 leading-relaxed">
               Direct PPT upload isn't supported yet. To get the best results (including reading charts/images on slides), please <strong>Save As PDF</strong> and upload that instead.
             </p>
          </div>
          <button onClick={() => setPptWarning(false)} className="text-amber-500/50 hover:text-amber-500"><X size={14}/></button>
        </div>
      )}

      {/* --- File List --- */}
      {files.length > 0 && (
        <div className="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
          {files.map((file, idx) => (
            <div key={idx} className="flex items-center justify-between bg-gray-800/50 border border-gray-700/50 p-2.5 rounded-lg group hover:border-gray-600 transition-all animate-slide-up">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="p-1.5 bg-gray-900 rounded-md shrink-0">
                   {getFileIcon(file.mimeType)}
                </div>
                <div className="flex flex-col min-w-0">
                   <span className="text-gray-300 text-xs font-medium truncate">{file.name}</span>
                   <span className="text-[9px] text-gray-500 uppercase">{file.mimeType.split('/')[1] || 'FILE'}</span>
                </div>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                className="text-gray-500 hover:text-red-400 p-1.5 rounded-md hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileUploader;
