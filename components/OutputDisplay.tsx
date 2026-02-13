import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Download, Copy, Eye, Check, List, Book, Focus, Save, Edit3, CloudUpload, Clipboard, ClipboardCheck, EyeOff, MousePointerClick, BookOpen, Microscope, Activity, AlertTriangle, Info, Wand2, Search, X, HelpCircle, MessageSquareQuote, LayoutTemplate } from 'lucide-react';
import { StorageService } from '../services/storageService';
import { processGeneratedNote } from '../utils/formatter';
import Mermaid from './Mermaid';
import { AppTheme } from '../types';

interface OutputDisplayProps {
  content: string;
  topic: string;
  noteId?: string;
  onUpdateContent?: (newContent: string) => void;
  onManualSave?: (content: string) => void;
  theme?: AppTheme;
}

interface TocItem {
  id: string;
  text: string;
  level: number;
}

// --- LIGHTWEIGHT SENSOR BLOCK ---
const SensorBlock: React.FC<{ children: React.ReactNode; active: boolean; label?: string }> = React.memo(({ children, active, label }) => {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!active) setRevealed(true);
    else setRevealed(false);
  }, [active]);

  if (!active) return <div className="mb-4">{children}</div>;

  return (
    <div 
      onClick={(e) => { e.stopPropagation(); setRevealed(true); }}
      className={`relative mb-4 transition-all duration-200 border rounded-lg ${revealed ? 'border-transparent' : 'sensor-blur border-gray-200 p-4 select-none'}`}
    >
       {!revealed && (
         <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="bg-[var(--ui-surface)]/90 backdrop-blur text-[var(--ui-text-main)] text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full shadow-sm flex items-center gap-2 border border-[var(--ui-border)]">
               <MousePointerClick size={12} className="text-[var(--ui-primary)]"/> {label || "Reveal"}
            </div>
         </div>
       )}
       {children}
    </div>
  );
});

const OutputDisplay: React.FC<OutputDisplayProps> = ({ content, topic, onUpdateContent, onManualSave, noteId, theme = AppTheme.CLINICAL_CLEAN }) => {
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

  useEffect(() => { setEditableContent(content); setIsDirty(false); }, [content]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            if (activeTab === 'preview') { setShowSearch(true); setTimeout(() => searchInputRef.current?.focus(), 50); }
        }
        if (e.key === 'Escape' && showSearch) { setShowSearch(false); setSearchQuery(''); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, showSearch]);

  const toc = useMemo(() => {
    const lines = editableContent.split('\n');
    const headers: TocItem[] = [];
    let counter = 0;
    lines.forEach(line => {
      const cleanLine = line.replace(/^>\s*\[!.*?\]\s*/, '').replace(/^>\s*/, '');
      const match = cleanLine.match(/^(#{1,3})\s+(.+)$/);
      if (match) headers.push({ id: `header-${counter++}`, text: match[2].trim(), level: match[1].length });
    });
    return headers;
  }, [editableContent]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const scrollPosition = scrollRef.current.scrollTop + 150;
    const headers = toc.map(t => document.getElementById(t.id));
    let currentActive = '';
    for (const header of headers) {
        if (header && header.offsetTop < scrollPosition) { currentActive = header.id; }
    }
    if (currentActive !== activeHeaderId) setActiveHeaderId(currentActive);
  }, [toc, activeHeaderId]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => { setEditableContent(e.target.value); setIsDirty(true); if (onUpdateContent) onUpdateContent(e.target.value); };
  const handleFixSyntax = () => { const fixed = processGeneratedNote(editableContent); if (fixed !== editableContent) { setEditableContent(fixed); if (onUpdateContent) onUpdateContent(fixed); setIsDirty(true); setSyntaxFixed(true); setTimeout(() => setSyntaxFixed(false), 2000); } else { alert("Syntax is already clean!"); } };
  const handleManualSaveTrigger = () => { if (onManualSave) { onManualSave(editableContent); setIsDirty(false); } };
  const handleUploadToCloud = async () => { if (isDirty) return alert("Save first."); if (!noteId) return alert("Save first."); const storage = StorageService.getInstance(); if (!storage.isCloudReady()) return alert("Connect Supabase."); try { const notes = storage.getLocalNotes(); const note = notes.find(n => n.id === noteId); if (note) { await storage.uploadNoteToCloud({...note, content: editableContent}); alert("Uploaded!"); } } catch (e: any) { alert("Failed: " + e.message); } };
  const handleDownload = () => { const blob = new Blob([editableContent], { type: 'text/markdown' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${topic.replace(/\s+/g, '_')}.md`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); };
  const handleCopy = () => { navigator.clipboard.writeText(editableContent); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const scrollToHeader = (id: string) => { const element = document.getElementById(id); if (element) { element.scrollIntoView({ behavior: 'smooth' }); setActiveHeaderId(id); } };

  // --- RENDERERS ---
  const CodeBlock = useCallback(({ node, className, children, ...props }: any) => {
    const [isCopied, setIsCopied] = useState(false);
    const match = /language-(\w+)/.exec(className || '');
    const isMermaid = match && match[1] === 'mermaid';
    const content = String(children).replace(/\n$/, '');
    const copyCode = () => { navigator.clipboard.writeText(content); setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); };

    if (isMermaid) {
        return ( <SensorBlock active={sensorMode} label="Reveal Diagram"> <Mermaid chart={content} /> </SensorBlock> );
    }
    if (!match) return <code className="bg-[var(--md-code-bg)] px-1 py-0.5 rounded text-red-500 font-mono text-sm border border-[var(--md-border)]" {...props}>{children}</code>;

    return (
        <SensorBlock active={sensorMode} label="Reveal Code">
          <div className="group relative my-4 rounded-lg overflow-hidden border border-[var(--md-border)] bg-[var(--md-code-bg)] text-[var(--md-text)] shadow-sm">
              <div className="flex justify-between items-center px-4 py-2 border-b border-[var(--md-border)] bg-[var(--ui-bg)]">
                  <span className="text-[10px] uppercase font-bold text-[var(--ui-text-muted)] font-mono">{match[1]}</span>
                  <button onClick={(e) => { e.stopPropagation(); copyCode(); }} className="text-[var(--ui-text-muted)] hover:text-[var(--ui-primary)]"><Clipboard size={12}/></button>
              </div>
              <div className="p-4 overflow-x-auto custom-scrollbar"><code className={`${className} text-sm`} {...props}>{children}</code></div>
          </div>
        </SensorBlock>
    );
  }, [sensorMode]);

  const getHeaderId = useCallback((text: string, level: number) => { const found = toc.find(t => t.text === text && t.level === level); return found ? found.id : undefined; }, [toc]);

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
                   
                   // Enhanced Callout Mapping
                   if (['abstract', 'summary'].includes(type)) { containerClass = "callout-abstract"; Icon = Microscope; title = "Concept"; }
                   else if (['tip', 'success', 'check'].includes(type)) { containerClass = "callout-tip"; Icon = Activity; title = "Clinical Pearl"; }
                   else if (['danger', 'error', 'warning'].includes(type)) { containerClass = "callout-danger"; Icon = AlertTriangle; title = "Critical Alert"; }
                   else if (['info', 'note'].includes(type)) { containerClass = "callout-info"; Icon = BookOpen; title = "Info"; }
                   else if (['question', 'faq', 'help'].includes(type)) { containerClass = "callout-question"; Icon = HelpCircle; title = "Critical Question"; }
                   else if (['quote', 'cite'].includes(type)) { containerClass = "callout-quote"; Icon = MessageSquareQuote; title = "Reference"; }
                   else if (['example', 'table'].includes(type)) { containerClass = "callout-example"; Icon = LayoutTemplate; title = "Example"; }

                   return (
                       <SensorBlock active={sensorMode} label={`Reveal ${title}`}>
                           <div className={`callout ${containerClass}`}>
                               <div className="callout-title"><Icon size={16} /> {title}</div>
                               <div className="callout-content">
                                   {childArray.map((child: any, idx) => {
                                       if (idx === 0 && child.props && child.props.children) {
                                            const grandChildren = React.Children.toArray(child.props.children);
                                            const filteredGrandChildren = grandChildren.map((gc, i) => { if (i === 0 && typeof gc === 'string') { return gc.replace(/^\[!(.*?)\]\s*/, ''); } return gc; });
                                            return React.cloneElement(child, { children: filteredGrandChildren });
                                       } return child;
                                   })}
                               </div>
                           </div>
                       </SensorBlock>
                   );
               }
           }
       }
    }
    return <blockquote>{children}</blockquote>;
  }, [sensorMode]);

  const components = useMemo(() => ({
    h1: ({ children }: any) => <h1 id={getHeaderId(String(children), 1)}>{children}</h1>,
    h2: ({ children }: any) => <h2 id={getHeaderId(String(children), 2)}>{children}</h2>,
    h3: ({ children }: any) => <h3 id={getHeaderId(String(children), 3)}>{children}</h3>,
    p: ({ children }: any) => <p>{children}</p>, 
    li: ({ children }: any) => <li>{children}</li>,
    table: ({ children }: any) => <table>{children}</table>,
    blockquote: BlockquoteRenderer,
    code: CodeBlock
  }), [getHeaderId, CodeBlock, BlockquoteRenderer]);

  return (
    <div className="flex h-[800px] gap-4 relative group/display font-sans">
      
      {/* Search Overlay */}
      {showSearch && activeTab === 'preview' && (
         <div className="absolute top-16 right-6 z-50 animate-slide-up">
            <div className="bg-[var(--ui-surface)] border-2 border-[var(--ui-primary)] shadow-lg rounded-lg p-2 flex items-center gap-2 w-72">
               <Search size={14} className="text-[var(--ui-text-muted)] ml-1"/>
               <input 
                  ref={searchInputRef}
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Find in note..."
                  className="flex-1 bg-transparent text-sm text-[var(--ui-text-main)] outline-none placeholder:text-[var(--ui-text-muted)]"
               />
               <button onClick={() => { setSearchQuery(''); setShowSearch(false); }} className="text-[var(--ui-text-muted)] hover:text-red-500 p-1"><X size={14}/></button>
            </div>
         </div>
      )}

      {/* TOC (Sidebar) */}
      {showToc && activeTab === 'preview' && toc.length > 0 && (
        <div className="w-64 bg-[var(--ui-sidebar)] border border-[var(--ui-border)] rounded-xl flex flex-col overflow-hidden shrink-0 hidden md:flex animate-fade-in shadow-xl">
          <div className="p-4 border-b border-[var(--ui-border)] bg-[var(--ui-bg)] flex items-center space-x-2">
            <List size={16} className="text-[var(--ui-primary)]"/>
            <span className="text-xs font-bold text-[var(--ui-text-main)] uppercase tracking-widest">Outline</span>
          </div>
          <div className="overflow-y-auto flex-1 p-2 custom-scrollbar space-y-1 bg-[var(--ui-bg)]">
            {toc.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollToHeader(item.id)}
                className={`
                    w-full text-left py-2 px-3 text-[11px] rounded-lg transition-all truncate border-l-4 font-medium
                    ${activeHeaderId === item.id 
                        ? 'bg-[var(--ui-primary-glow)] border-[var(--ui-primary)] text-[var(--ui-primary)] shadow-sm' 
                        : 'border-transparent text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)] hover:bg-[var(--ui-surface)]'
                    }
                    ${item.level === 1 ? 'mt-3 font-bold uppercase tracking-wider' : ''} 
                    ${item.level === 2 ? 'pl-4' : ''} 
                    ${item.level === 3 ? 'pl-6 opacity-80' : ''}
                `}
              >
                {item.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Panel */}
      <div className="flex-1 bg-[var(--ui-bg)] rounded-xl border border-[var(--ui-border)] overflow-hidden flex flex-col relative shadow-2xl">
        
        {/* NEW THEMED TOOLBAR */}
        <div className="h-16 border-b border-[var(--ui-border)] bg-[var(--ui-sidebar)] flex justify-between items-center px-6 shrink-0 transition-colors duration-300">
           
           {/* Mode Toggles */}
           <div className="flex gap-1 bg-[var(--ui-bg)] p-1 rounded-full border border-[var(--ui-border)] shadow-inner">
              <button onClick={() => setActiveTab('preview')} className={`px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 transition-all ${activeTab === 'preview' ? 'bg-[var(--ui-surface)] text-[var(--ui-text-main)] shadow-sm border border-[var(--ui-border)]' : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]'}`}><Eye size={14}/> Read</button>
              <button onClick={() => setActiveTab('code')} className={`px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 transition-all ${activeTab === 'code' ? 'bg-[var(--ui-surface)] text-[var(--ui-text-main)] shadow-sm border border-[var(--ui-border)]' : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]'}`}><Edit3 size={14}/> Edit</button>
           </div>

           {/* Tool Actions */}
           <div className="flex items-center gap-2">
              <button onClick={() => setSensorMode(!sensorMode)} className={`p-2 rounded-full transition-all border ${sensorMode ? 'bg-amber-100 border-amber-300 text-amber-600' : 'bg-[var(--ui-bg)] border-[var(--ui-border)] text-[var(--ui-text-muted)] hover:text-[var(--ui-primary)]'}`} title="Active Recall Mode">
                 {sensorMode ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
              
              <div className="h-6 w-[1px] bg-[var(--ui-border)] mx-1"></div>
              
              <div className="flex bg-[var(--ui-bg)] rounded-full border border-[var(--ui-border)] p-0.5">
                  <button onClick={() => setShowToc(!showToc)} className="p-2 rounded-full text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)] hover:bg-[var(--ui-surface)] transition-colors" title="Toggle TOC"><List size={16}/></button>
                  <button onClick={handleFixSyntax} className="p-2 rounded-full text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)] hover:bg-[var(--ui-surface)] transition-colors" title="Fix Syntax"><Wand2 size={16} className={syntaxFixed ? 'text-green-500' : ''}/></button>
                  <button onClick={handleCopy} className="p-2 rounded-full text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)] hover:bg-[var(--ui-surface)] transition-colors" title="Copy">{copied ? <Check size={16}/> : <Copy size={16}/>}</button>
                  <button onClick={handleDownload} className="p-2 rounded-full text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)] hover:bg-[var(--ui-surface)] transition-colors" title="Download"><Download size={16}/></button>
                  <button onClick={handleUploadToCloud} className="p-2 rounded-full text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)] hover:bg-[var(--ui-surface)] transition-colors" title="Upload"><CloudUpload size={16}/></button>
              </div>

              <button 
                  onClick={handleManualSaveTrigger} 
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all ml-2 shadow-lg ${isDirty ? 'bg-[var(--ui-primary)] text-white hover:opacity-90 animate-pulse' : 'bg-[var(--ui-surface)] border border-[var(--ui-border)] text-[var(--ui-text-muted)]'}`}
              >
                  <Save size={14}/> {isDirty ? 'Save Changes' : 'Saved'}
              </button>
           </div>
        </div>

        {/* Content Area */}
        {activeTab === 'preview' ? (
           <div 
             className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10 flex justify-center bg-[var(--ui-bg)] scroll-smooth"
             ref={scrollRef}
             onScroll={handleScroll}
           >
              <div className={`markdown-body w-full max-w-4xl shadow-xl animate-fade-in relative theme-${theme}`}>
                 <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                    {editableContent}
                 </ReactMarkdown>
              </div>
           </div>
        ) : (
           <textarea 
             value={editableContent}
             onChange={handleContentChange}
             className="flex-1 w-full bg-[#0a0f18] text-gray-300 font-mono text-sm p-6 outline-none resize-none custom-scrollbar border-none"
             spellCheck={false}
           />
        )}
      </div>
    </div>
  );
};

export default OutputDisplay;