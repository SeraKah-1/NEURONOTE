import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Mermaid from './Mermaid';
import { Download, Copy, Eye, Code, Check, List, Book, GraduationCap } from 'lucide-react';

interface OutputDisplayProps {
  content: string;
  topic: string;
}

interface TocItem {
  id: string;
  text: string;
  level: number;
}

const OutputDisplay: React.FC<OutputDisplayProps> = ({ content, topic }) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [copied, setCopied] = useState(false);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [showToc, setShowToc] = useState(true);
  const [studyMode, setStudyMode] = useState(false);

  // Parse Headers for Table of Contents
  useEffect(() => {
    const lines = content.split('\n');
    const headers: TocItem[] = [];
    let counter = 0;

    lines.forEach(line => {
      const match = line.match(/^(#{1,3})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim();
        const id = `header-${counter++}`;
        headers.push({ id, text, level });
      }
    });
    setToc(headers);
  }, [content]);

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${topic.replace(/\s+/g, '_')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const scrollToHeader = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Custom renderer to inject IDs into headers for ToC jumping
  const components = {
    h1: ({ children }: any) => {
      // Find the corresponding header in TOC to get the ID. 
      // This is a simple approximation. In a real parser we'd use a robust slugifier.
      const text = String(children);
      const item = toc.find(t => t.text === text && t.level === 1);
      return <h1 id={item?.id}>{children}</h1>;
    },
    h2: ({ children }: any) => {
      const text = String(children);
      const item = toc.find(t => t.text === text && t.level === 2);
      return <h2 id={item?.id}>{children}</h2>;
    },
    h3: ({ children }: any) => {
      const text = String(children);
      const item = toc.find(t => t.text === text && t.level === 3);
      return <h3 id={item?.id}>{children}</h3>;
    },
    code({ node, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '');
      const isMermaid = match && match[1] === 'mermaid';
      
      if (isMermaid) {
        return <Mermaid chart={String(children).replace(/\n$/, '')} />;
      }

      return !match ? (
        <code className={className} {...props}>
          {children}
        </code>
      ) : (
        <pre className="bg-gray-900 rounded p-4 overflow-x-auto border border-gray-700 my-4">
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      );
    },
    blockquote({ children }: any) {
       return <blockquote>{children}</blockquote>
    }
  };

  return (
    <div className="flex h-[800px] gap-4">
      {/* Table of Contents Sidebar */}
      {showToc && activeTab === 'preview' && toc.length > 0 && (
        <div className="w-64 bg-neuro-surface border border-gray-800 rounded-xl flex flex-col overflow-hidden shrink-0 animate-in slide-in-from-left-4 hidden md:flex">
          <div className="p-3 border-b border-gray-800 bg-gray-900/50 flex items-center space-x-2">
            <List size={16} className="text-neuro-primary"/>
            <span className="text-sm font-bold text-gray-300">Structure</span>
          </div>
          <div className="overflow-y-auto flex-1 p-2 custom-scrollbar">
            {toc.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollToHeader(item.id)}
                className={`w-full text-left py-1.5 px-2 text-xs hover:bg-gray-800 rounded transition-colors border-l-2 border-transparent toc-link truncate
                  ${item.level === 1 ? 'font-bold text-gray-200 mt-2' : ''}
                  ${item.level === 2 ? 'pl-4 text-gray-400' : ''}
                  ${item.level === 3 ? 'pl-6 text-gray-500 italic' : ''}
                `}
                title={item.text}
              >
                {item.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 bg-neuro-surface rounded-xl border border-gray-800 shadow-2xl overflow-hidden flex flex-col animate-in fade-in duration-500">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/50">
          <div className="flex space-x-1 bg-gray-800 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('preview')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === 'preview' 
                  ? 'bg-neuro-primary text-white shadow-lg' 
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              <Eye size={14} />
              <span className="hidden sm:inline">Preview</span>
            </button>
            <button
              onClick={() => setActiveTab('code')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === 'code' 
                  ? 'bg-neuro-primary text-white shadow-lg' 
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              <Code size={14} />
              <span className="hidden sm:inline">Markdown</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            {activeTab === 'preview' && (
              <>
                <button
                  onClick={() => setShowToc(!showToc)}
                  className={`p-2 rounded-md transition-colors border hidden md:block ${showToc ? 'bg-neuro-primary/20 border-neuro-primary text-neuro-primary' : 'bg-gray-800 border-gray-700 text-gray-400'}`}
                  title="Toggle Table of Contents"
                >
                  <Book size={18} />
                </button>
                <button
                  onClick={() => setStudyMode(!studyMode)}
                  className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors border ${
                    studyMode 
                      ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500' 
                      : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-yellow-400'
                  }`}
                  title="Blur keywords for active recall"
                >
                  <GraduationCap size={16} />
                  <span className="hidden sm:inline">{studyMode ? 'Study Mode ON' : 'Study Mode'}</span>
                </button>
                <div className="w-px h-6 bg-gray-700 mx-1"></div>
              </>
            )}

             <button
              onClick={handleCopy}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
              title="Copy to Clipboard"
            >
              {copied ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center space-x-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-md text-sm font-medium transition-colors border border-gray-700"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar relative bg-[#0e1117] p-6">
          {activeTab === 'preview' && (
            <div className={`markdown-body text-gray-300 max-w-4xl mx-auto ${studyMode ? 'study-mode' : ''}`}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={components}
              >
                {content}
              </ReactMarkdown>
            </div>
          )}

          {activeTab === 'code' && (
            <pre className="font-mono text-sm text-gray-300 whitespace-pre-wrap leading-relaxed max-w-4xl mx-auto">
              {content}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};

export default OutputDisplay;