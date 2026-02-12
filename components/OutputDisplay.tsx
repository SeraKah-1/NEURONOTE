
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Download, Copy, Eye, Check, List, Book, Focus, Save, Edit3, CloudUpload, Clipboard, ClipboardCheck, EyeOff, MousePointerClick, BookOpen, Microscope, Activity, AlertTriangle, Info, Wand2, Search, X } from 'lucide-react';
import { StorageService } from '../services/storageService';
import { processGeneratedNote } from '../utils/formatter';
import Mermaid from './Mermaid';

interface OutputDisplayProps {
  content: string;
  topic: string;
  noteId?: string;
  onUpdateContent?: (newContent: string) => void;
  onManualSave?: (content: string) => void;
}

interface TocItem {
  id: string;
  text: string;
  level: number;
}

// --- SENSOR BLOCK WRAPPER (Memoized) ---
const SensorBlock: React.FC<{ children: React.ReactNode; active: boolean }> = React.memo(({ children, active }) => {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!active) setRevealed(true);
    else setRevealed(false);
  }, [active]);

  if (!active) return <div className="mb-4">{children}</div>;

  return (
    <div 
      onClick={(e) => { e.stopPropagation(); setRevealed(true); }}
      className={`relative mb-4 transition-all duration-500 rounded-lg p-1 ${revealed ? 'sensor-reveal' : 'sensor-blur select-none'}`}
    >
       {!revealed && (
         <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="bg-gray-900/90 text-gray-300 text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-full border border-white/10 flex items-center gap-2 shadow-2xl backdrop-blur-md">
               <MousePointerClick size={14} className="animate-bounce"/> Click to Reveal
            </div>
         </div>
       )}
       {children}
    </div>
  );
});

// --- SEARCH HIGHLIGHTER HELPER ---
const HighlightText: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  if (!query) return <>{text}</>;
  
  const parts = text.split(new RegExp(`(${query})`, 'gi'));
  return (
    <>
      {parts.map((part, i) => 
        part.toLowerCase() === query.toLowerCase() ? (
          <span key={i} className="bg-yellow-500/80 text-white rounded px-0.5 box-decoration-clone">{part}</span>
        ) : (
          part
        )
      )}
    </>
  );
};

// Recursive helper to walk through React Children and highlight strings
const recursiveHighlight = (children: React.ReactNode, query: string): React.ReactNode => {
    if (!query) return children;

    return React.Children.map(children, child => {
        if (typeof child === 'string') {
            return <HighlightText text={child} query={query} />;
        }
        if (React.isValidElement(child)) {
             // If it's a React Element, recurse into its children
             return React.cloneElement(child as React.ReactElement<any>, {
                 children: recursiveHighlight(child.props.children, query)
             });
        }
        return child;
    });
};


const OutputDisplay: React.FC<OutputDisplayProps> = ({ content, topic, onUpdateContent, onManualSave, noteId }) => {
  const [editableContent, setEditableContent] = useState(content);
  const [isDirty, setIsDirty] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [copied, setCopied] = useState(false);
  const [showToc, setShowToc] = useState(true);
  const [activeHeaderId, setActiveHeaderId] = useState<string>('');
  const [syntaxFixed, setSyntaxFixed] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sensorMode, setSensorMode] = useState(false);

  // SEARCH STATE
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditableContent(content);
    setIsDirty(false); 
  }, [content]);

  // CTRL+F LISTENER
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            if (activeTab === 'preview') {
                setShowSearch(true);
                setTimeout(() => searchInputRef.current?.focus(), 50);
            }
        }
        // ESC to close search
        if (e.key === 'Escape' && showSearch) {
             setShowSearch(false);
             setSearchQuery('');
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, showSearch]);

  // MEMOIZED TOC GENERATION
  const toc = useMemo(() => {
    const lines = editableContent.split('\n');
    const headers: TocItem[] = [];
    let counter = 0;
    lines.forEach(line => {
      const cleanLine = line.replace(/^>\s*\[!.*?\]\s*/, '').replace(/^>\s*/, '');
      const match = cleanLine.match(/^(#{1,3})\s+(.+)$/);
      
      if (match) {
        headers.push({ 
          id: `header-${counter++}`, 
          text: match[2].trim(), 
          level: match[1].length 
        });
      }
    });
    return headers;
  }, [editableContent]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const scrollPosition = scrollRef.current.scrollTop + 100;
    const headers = toc.map(t => document.getElementById(t.id));
    let currentActive = '';
    for (const header of headers) {
        if (header && header.offsetTop < scrollPosition) {
            currentActive = header.id;
        }
    }
    if (currentActive !== activeHeaderId) {
        setActiveHeaderId(currentActive);
    }
  }, [toc, activeHeaderId]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditableContent(e.target.value);
    setIsDirty(true);
    if (onUpdateContent) onUpdateContent(e.target.value);
  };

  // --- NEW: AUTO FIX SYNTAX HANDLER ---
  const handleFixSyntax = () => {
    const fixed = processGeneratedNote(editableContent);
    if (fixed !== editableContent) {
      setEditableContent(fixed);
      if (onUpdateContent) onUpdateContent(fixed);
      setIsDirty(true);
      setSyntaxFixed(true);
      setTimeout(() => setSyntaxFixed(false), 2000);
    } else {
      alert("Syntax is already clean!");
    }
  };

  const handleManualSaveTrigger = () => {
    if (onManualSave) {
      onManualSave(editableContent);
      setIsDirty(false);
    }
  };

  const handleUploadToCloud = async () => {
    if (isDirty) return alert("Please Save locally first.");
    if (!noteId) return alert("Save locally first.");
    const storage = StorageService.getInstance();
    if (!storage.isCloudReady()) return alert("Connect Supabase first.");
    try {
        const notes = storage.getLocalNotes();
        const note = notes.find(n => n.id === noteId);
        if (note) {
            await storage.uploadNoteToCloud({...note, content: editableContent});
            alert("Uploaded to Cloud Archive!");
        }
    } catch (e: any) { alert("Upload Failed: " + e.message); }
  };

  const handleDownload = () => {
    const blob = new Blob([editableContent], { type: 'text/markdown' });
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
    navigator.clipboard.writeText(editableContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const scrollToHeader = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
        setActiveHeaderId(id);
    }
  };

  // --- CUSTOM MARKDOWN RENDERERS (Memoized with Search Query) ---

  const CodeBlock = useCallback(({ node, className, children, ...props }: any) => {
    const [isCopied, setIsCopied] = useState(false);
    const match = /language-(\w+)/.exec(className || '');
    const isMermaid = match && match[1] === 'mermaid';
    const content = String(children).replace(/\n$/, '');

    const copyCode = () => {
        navigator.clipboard.writeText(content);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    if (isMermaid) {
        return (
          <SensorBlock active={sensorMode}>
             <Mermaid chart={content} />
          </SensorBlock>
        );
    }

    if (!match) return <code className="bg-gray-800 px-1 py-0.5 rounded text-neuro-accent font-mono text-sm" {...props}>{recursiveHighlight(children, searchQuery)}</code>;

    return (
        <SensorBlock active={sensorMode}>
          <div className="group relative my-4 rounded-xl overflow-hidden border border-gray-700 bg-[#0d1117] shadow-lg">
              <div className="flex justify-between items-center px-4 py-2 bg-gray-800/50 border-b border-gray-700/50">
                  <span className="text-[10px] uppercase font-bold text-gray-500 font-mono">{match[1]}</span>
                  <button onClick={(e) => { e.stopPropagation(); copyCode(); }} className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 hover:text-white transition-colors">
                      {isCopied ? <ClipboardCheck size={12} className="text-green-400"/> : <Clipboard size={12}/>}
                  </button>
              </div>
              <div className="p-4 overflow-x-auto custom-scrollbar">
                  <code className={`${className} text-sm`} {...props}>
                      {children} {/* Code blocks usually don't need text search highlight inside syntax, but we can try if simple text */}
                  </code>
              </div>
          </div>
        </SensorBlock>
    );
  }, [sensorMode, searchQuery]);

  const getHeaderId = useCallback((text: string, level: number) => {
    const found = toc.find(t => t.text === text && t.level === level);
    return found ? found.id : undefined;
  }, [toc]);

  const BlockquoteRenderer = useCallback(({ children }: any) => {
    const childArray = React.Children.toArray(children);
    if (childArray.length > 0) {
       const firstChild = childArray[0] as any;
       if (firstChild.props && firstChild.props.children) {
           const textContent = firstChild.props.children[0];
           if (typeof textContent === 'string') {
               const calloutMatch = textContent.match(/^\[!(.*?)\]/);
               if (calloutMatch) {
                   const type = calloutMatch[1].toLowerCase();
                   let containerClass = "callout-info";
                   let Icon = Info;
                   let title = "Note";

                   if (['abstract', 'summary'].includes(type)) { containerClass = "callout-abstract"; Icon = Microscope; title = "Mechanism & Concept"; }
                   else if (['tip', 'success', 'check'].includes(type)) { containerClass = "callout-tip"; Icon = Activity; title = "Clinical Pearl"; }
                   else if (['danger', 'error', 'warning'].includes(type)) { containerClass = "callout-danger"; Icon = AlertTriangle; title = "Critical Alert"; }
                   else if (['info', 'note'].includes(type)) { containerClass = "callout-info"; Icon = BookOpen; title = "Definition & Core Knowledge"; }
                   
                   return (
                       <SensorBlock active={sensorMode}>
                           <div className={`callout ${containerClass}`}>
                               <div className={`${containerClass}-title`}>
                                   <Icon size={16} /> {title}
                               </div>
                               <div className="text-gray-300">
                                   {childArray.map((child: any, idx) => {
                                       if (idx === 0 && child.props && child.props.children) {
                                            const grandChildren = React.Children.toArray(child.props.children);
                                            const filteredGrandChildren = grandChildren.map((gc, i) => {
                                                if (i === 0 && typeof gc === 'string') {
                                                    return gc.replace(/^\[!(.*?)\]\s*/, '');
                                                }
                                                return gc;
                                            });
                                            // Recurse highlight
                                            const activeContent = recursiveHighlight(filteredGrandChildren, searchQuery);
                                            return React.cloneElement(child, { children: activeContent });
                                       }
                                       return React.cloneElement(child, { children: recursiveHighlight(child.props.children, searchQuery) });
                                   })}
                               </div>
                           </div>
                       </SensorBlock>
                   );
               }
           }
       }
    }
    return <SensorBlock active={sensorMode}><blockquote>{recursiveHighlight(children, searchQuery)}</blockquote></SensorBlock>;
  }, [sensorMode, searchQuery]);

  const components = useMemo(() => ({
    h1: ({ children }: any) => <h1 id={getHeaderId(String(children), 1)}>{recursiveHighlight(children, searchQuery)}</h1>,
    h2: ({ children }: any) => <h2 id={getHeaderId(String(children), 2)}>{recursiveHighlight(children, searchQuery)}</h2>,
    h3: ({ children }: any) => <h3 id={getHeaderId(String(children), 3)}>{recursiveHighlight(children, searchQuery)}</h3>,
    p: ({ children }: any) => <SensorBlock active={sensorMode}><p>{recursiveHighlight(children, searchQuery)}</p></SensorBlock>,
    li: ({ children }: any) => <SensorBlock active={sensorMode}><li>{recursiveHighlight(children, searchQuery)}</li></SensorBlock>,
    table: ({ children }: any) => <SensorBlock active={sensorMode}><table>{recursiveHighlight(children, searchQuery)}</table></SensorBlock>,
    blockquote: BlockquoteRenderer,
    code: CodeBlock
  }), [getHeaderId, CodeBlock, BlockquoteRenderer, sensorMode, searchQuery]);

  return (
    <div className="flex h-[800px] gap-4 relative group/display">
      
      {/* Search Overlay */}
      {showSearch && activeTab === 'preview' && (
         <div className="absolute top-16 right-6 z-50 animate-slide-up">
            <div className="bg-[#0f172a] border border-neuro-primary shadow-2xl rounded-lg p-2 flex items-center gap-2 w-72">
               <Search size={14} className="text-neuro-primary ml-1"/>
               <input 
                  ref={searchInputRef}
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Find in note..."
                  className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gray-600"
               />
               <button onClick={() => { setSearchQuery(''); setShowSearch(false); }} className="text-gray-500 hover:text-white p-1">
                  <X size={14}/>
               </button>
            </div>
            {searchQuery && (
               <div className="text-[9px] text-gray-500 font-mono text-right mt-1 bg-black/50 inline-block px-1 rounded">
                  Use highlighting to find matches
               </div>
            )}
         </div>
      )}

      {/* TOC */}
      {showToc && activeTab === 'preview' && toc.length > 0 && (
        <div className="w-64 bg-neuro-surface border border-gray-800 rounded-xl flex flex-col overflow-hidden shrink-0 hidden md:flex animate-fade-in">
          <div className="p-3 border-b border-gray-800 bg-gray-900/50 flex items-center space-x-2">
            <List size={16} className="text-neuro-primary"/>
            <span className="text-sm font-bold text-gray-300">Structure</span>
          </div>
          <div className="overflow-y-auto flex-1 p-2 custom-scrollbar space-y-0.5">
            {toc.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollToHeader(item.id)}
                className={`
                    w-full text-left py-1.5 px-2 text-xs rounded transition-all truncate border-l-2
                    ${activeHeaderId === item.id 
                        ? 'bg-neuro-primary/10 border-neuro-primary text-white font-bold' 
                        : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                    }
                    ${item.level === 1 ? 'mt-2 text-gray-300' : ''} 
                    ${item.level === 2 ? 'pl-4' : ''} 
                    ${item.level === 3 ? 'pl-6 italic' : ''}
                `}
              >
                {item.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Panel */}
      <div className="flex-1 bg-neuro-surface rounded-xl border border-gray-800 shadow-2xl overflow-hidden flex flex-col relative">
        
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm z-20">
          <div className="flex space-x-1 bg-gray-800 p-1 rounded-lg">
            <button onClick={() => setActiveTab('preview')} className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'preview' ? 'bg-neuro-primary text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}><Eye size={14} /><span className="hidden sm:inline">Read</span></button>
            <button onClick={() => setActiveTab('code')} className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'code' ? 'bg-neuro-primary text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}><Edit3 size={14} /><span className="hidden sm:inline">Edit</span></button>
          </div>

          <div className="flex items-center space-x-2">
            
            {/* Search Button */}
            {activeTab === 'preview' && (
                <button 
                  onClick={() => { setShowSearch(!showSearch); if(!showSearch) setTimeout(() => searchInputRef.current?.focus(), 50); }}
                  className={`p-2 rounded-md transition-colors border ${showSearch ? 'bg-neuro-primary text-white border-neuro-primary' : 'bg-gray-800 border-gray-700 text-gray-400'}`}
                  title="Search (Ctrl+F)"
                >
                    <Search size={16}/>
                </button>
            )}

            {/* FIX SYNTAX BUTTON */}
            <button 
                onClick={handleFixSyntax}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-bold transition-all border
                ${syntaxFixed ? 'bg-indigo-500 border-indigo-400 text-white' : 'bg-gray-800 border-gray-700 text-indigo-400 hover:text-white hover:border-indigo-500'}`}
                title="Run deterministic formatter to fix Mermaid arrows and quotes"
            >
                {syntaxFixed ? <Check size={14} /> : <Wand2 size={14} />}
                <span className="hidden lg:inline">{syntaxFixed ? 'Fixed!' : 'Fix Syntax'}</span>
            </button>

            <div className="w-px h-6 bg-gray-700 mx-1"></div>

            {noteId && (
               <button onClick={handleUploadToCloud} className="p-2 text-cyan-400 hover:text-white hover:bg-cyan-900/30 rounded-md transition-colors" title="Upload"><CloudUpload size={18} /></button>
            )}
            
            <button 
                onClick={handleManualSaveTrigger} 
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-bold transition-all border
                    ${isDirty ? 'bg-yellow-600 border-yellow-500 animate-pulse text-white' : 'bg-green-600 border-green-500 text-white'}`}
            >
              <Save size={14} /> <span>{isDirty ? 'Save' : 'Saved'}</span>
            </button>
            
            {activeTab === 'preview' && (
              <>
                <button onClick={() => setShowToc(!showToc)} className={`p-2 rounded-md transition-colors border hidden md:block ${showToc ? 'bg-neuro-primary/20 border-neuro-primary text-neuro-primary' : 'bg-gray-800 border-gray-700 text-gray-400'}`}><Book size={18} /></button>
                <button onClick={() => setSensorMode(!sensorMode)} className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors border ${sensorMode ? 'bg-red-500/20 text-red-300 border-red-500' : 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                  {sensorMode ? <EyeOff size={16}/> : <Focus size={16} />}
                </button>
                <div className="w-px h-6 bg-gray-700 mx-1"></div>
              </>
            )}
            <button onClick={handleCopy} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors">{copied ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}</button>
            <button onClick={handleDownload} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors"><Download size={18} /></button>
          </div>
        </div>

        {/* Viewer */}
        <div className="flex-1 overflow-hidden relative bg-[#0e1117]">
          {activeTab === 'preview' && (
            <div className="h-full overflow-y-auto custom-scrollbar p-6 scroll-smooth" ref={scrollRef} onScroll={handleScroll}>
              <div className="markdown-body max-w-4xl mx-auto pb-64">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                  {editableContent}
                </ReactMarkdown>
              </div>
            </div>
          )}
          {activeTab === 'code' && (
            <textarea value={editableContent} onChange={handleContentChange} className="w-full h-full p-6 font-mono text-sm text-gray-300 bg-[#0e1117] resize-none outline-none custom-scrollbar leading-relaxed" spellCheck={false} />
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(OutputDisplay);
