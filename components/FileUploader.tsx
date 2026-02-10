import React, { useRef } from 'react';
import { Upload, X, FileText, File as FileIcon, Image as ImageIcon } from 'lucide-react';
import { UploadedFile } from '../types';

interface FileUploaderProps {
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
}

const FileUploader: React.FC<FileUploaderProps> = ({ files, onFilesChange }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles: UploadedFile[] = [];
      const fileList: File[] = Array.from(e.target.files);

      for (const file of fileList) {
        try {
          const base64Data = await readFileAsBase64(file);
          newFiles.push({
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            data: base64Data
          });
        } catch (err) {
          console.error(`Failed to read file ${file.name}`, err);
        }
      }
      onFilesChange([...files, ...newFiles]);
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix (e.g., "data:image/png;base64,")
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
    if (mimeType.includes('pdf')) return <FileText size={14} className="text-red-400 shrink-0" />;
    if (mimeType.includes('image')) return <ImageIcon size={14} className="text-purple-400 shrink-0" />;
    return <FileIcon size={14} className="text-neuro-accent shrink-0" />;
  };

  return (
    <div className="w-full">
      <div 
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-gray-700 bg-gray-900/30 hover:bg-gray-800/50 hover:border-neuro-primary rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer transition-all group"
      >
        <Upload className="text-gray-500 group-hover:text-neuro-primary mb-2" size={24} />
        <p className="text-sm text-gray-400 font-medium group-hover:text-gray-300">
          Upload Context Materials
        </p>
        <p className="text-xs text-gray-600 mt-1 text-center">
          PDF, PPT, Markdown, or Images (EKG/Derm)
        </p>
        <input 
          type="file" 
          ref={inputRef} 
          onChange={handleFileChange} 
          className="hidden" 
          multiple 
          accept=".pdf,.ppt,.pptx,.md,.txt,.jpg,.jpeg,.png,.webp"
        />
      </div>

      {files.length > 0 && (
        <div className="mt-3 space-y-2 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
          {files.map((file, idx) => (
            <div key={idx} className="flex items-center justify-between bg-gray-800 p-2 rounded text-sm border border-gray-700">
              <div className="flex items-center space-x-2 truncate">
                {getFileIcon(file.mimeType)}
                <span className="text-gray-300 truncate max-w-[180px]">{file.name}</span>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                className="text-gray-500 hover:text-red-400 p-1 rounded-full hover:bg-gray-700 transition-colors"
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