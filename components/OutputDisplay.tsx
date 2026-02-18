
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Download, Copy, Eye, Check, List, Book, Focus, Save, Edit3, CloudUpload, Clipboard, ClipboardCheck, EyeOff, MousePointerClick, BookOpen, Microscope, Activity, AlertTriangle, Info, Wand2, Search, X, HelpCircle, MessageSquareQuote, LayoutTemplate, Undo2, Redo2, Loader2, Workflow, Printer, FileDown, Maximize2, Minimize2 } from 'lucide-react';
import { StorageService } from '../services/storageService';
import { processGeneratedNote } from '../utils/formatter';
import { refineNoteContent } from '../services/geminiService';
import { refineNoteContentGroq } from '../services/groqService';
import Mermaid from './Mermaid';
import { AppTheme, AIProvider, GenerationConfig } from '../types';

interface OutputDisplayProps {
  content: string;
  topic: string;
  noteId?: string;
  config: GenerationConfig;
  onUpdateContent?: (newContent: string) => void;
  onManualSave?: (content: string) => void;
  theme?: AppTheme;
}

interface TocItem {
  id: string;
  text: string;
  level: number;
}

// --- DEBOUNCE HOOK ---
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// --- SUBTLE SENSOR BLOCK (Active Recall) ---
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
      className={`relative mb-4 transition-all duration-500 ${revealed ? 'sensor-blur revealed' : 'sensor-blur'}`}
    >
       {!revealed && (
         <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="text-[var(--ui-text-muted)] text-[10px] font-bold uppercase tracking-widest opacity-50">
               Click to Reveal
            </div>
         </div>
       )}
       {children}
    </div>
  );
});

const OutputDisplay: React.FC<OutputDisplayProps> = ({ content, topic, onUpdateContent, onManualSave, noteId, config, theme = AppTheme.CLINICAL_CLEAN }) => {
  // HISTORY STATE
  const [history, setHistory] = useState<string[]>([content]);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  const [editableContent, setEditableContent] = useState(content);
  // DEBOUNCE: Only render heavy markdown when user stops typing for 500ms
  const debouncedContent = useDebounce(editableContent, 500); 

  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'preview' | 'code' | 'diagrams'>('preview');
  const [showToc, setShowToc] = useState(false);
  const [activeHeaderId, setActiveHeaderId] = useState<string>('');
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMounted = useRef(true);
  const [sensorMode, setSensorMode] = useState(false);

  // SEARCH & MAGIC
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showMagicEdit, setShowMagicEdit] = useState(false);
  const [magicInstruction, setMagicInstruction] = useState('');
  const [isMagicLoading, setIsMagicLoading] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // --- INITIALIZATION ---
  useEffect(() => {
      isMounted.current = true;
      return () => { isMounted.current = false; };
  }, []);

  useEffect(() => { 
      setEditableContent(content); 
      setHistory([content]);
      setHistoryIndex(0);
      setIsDirty(false); 
  }, [noteId]); 

  // --- HISTORY LOGIC ---
  const pushToHistory = (newContent: string) => {
    if (newContent === history[historyIndex]) return;
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newContent);
    if (newHistory.length > 50) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setEditableContent(newContent);
    setIsDirty(true);
    if (onUpdateContent) onUpdateContent(newContent);
  };

  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setEditableContent(history[newIndex]);
      if (onUpdateContent) onUpdateContent(history[newIndex]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setEditableContent(history[newIndex]);
      if (onUpdateContent) onUpdateContent(history[newIndex]);
    }
  };

  // --- SHORTCUTS ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); if (activeTab === 'preview') { setShowSearch(true); setTimeout(() => searchInputRef.current?.focus(), 50); } }
        if (e.key === 'Escape' && showSearch) { setShowSearch(false); setSearchQuery(''); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
        if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleManualSaveTrigger(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, showSearch, historyIndex, history]);

  // --- TOC & SCROLL ---
  const toc = useMemo(() => {
    const lines = debouncedContent.split('\n');
    const headers: TocItem[] = [];
    let counter = 0;
    lines.forEach(line => {
      const cleanLine = line.replace(/^>\s*\[!.*?\]\s*/, '').replace(/^>\s*/, '');
      const match = cleanLine.match(/^(#{1,3})\s+(.+)$/);
      if (match) headers.push({ id: `header-${counter++}`, text: match[2].trim(), level: match[1].length });
    });
    return headers;
  }, [debouncedContent]);

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

  const scrollToHeader = (id: string) => { const element = document.getElementById(id); if (element) { element.scrollIntoView({ behavior: 'smooth' }); setActiveHeaderId(id); } };

  // --- ACTIONS ---
  const handleManualSaveTrigger = async () => { 
      if (onManualSave && isDirty) { 
          setIsSaving(true);
          await new Promise(r => setTimeout(r, 600));
          if(isMounted.current) {
              onManualSave(editableContent); 
              setIsDirty(false); 
              setIsSaving(false);
              setJustSaved(true);
              setTimeout(() => { if(isMounted.current) setJustSaved(false); }, 2000);
          }
      } 
  };
  
  const handleExportPdf = async () => {
      const element = document.querySelector('.markdown-body') as HTMLElement;
      if (!element) return;
      setIsExportingPdf(true);
      
      try {
          const clone = element.cloneNode(true) as HTMLElement;
          clone.style.width = '800px';
          clone.style.padding = '40px';
          clone.style.background = 'white';
          clone.style.color = 'black';
          
          // CRITICAL FIX: Safe Append/Remove
          document.body.appendChild(clone);
          
          const opt = {
              margin: [10, 10, 10, 10],
              filename: `${topic.replace(/[^a-z0-9]/gi, '_')}.pdf`,
              image: { type: 'jpeg', quality: 0.98 },
              html2canvas: { scale: 2, useCORS: true, logging: false },
              jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
          };
          
          // @ts-ignore
          await window.html2pdf().set(opt).from(clone).save();
          
          if(document.body.contains(clone)) {
              document.body.removeChild(clone);
          }
      } catch (e) {
          console.error("PDF Export Error", e);
          alert("Export failed. Check console.");
      } finally {
          setIsExportingPdf(false);
      }
  };

  const executeMagicEdit = async () => {
      if (!magicInstruction) return;
      setIsMagicLoading(true);
      try {
          let newContent = '';
          if (config.provider === AIProvider.GEMINI) { newContent = await refineNoteContent(config, editableContent, magicInstruction); } 
          else { newContent = await refineNoteContentGroq(config, editableContent, magicInstruction); }
          if(isMounted.current) { pushToHistory(newContent); setShowMagicEdit(false); setMagicInstruction(''); }
      } catch (e: any) { alert("Magic Edit Failed: " + e.message); } 
      finally { if(isMounted.current) setIsMagicLoading(false); }
  };

  // --- RENDERERS (Memoized) ---
  const CodeBlock = useCallback(({ node, className, children, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || '');
    const isMermaid = match && match[1] === 'mermaid';
    const content = String(children).replace(/\n$/, '');

    if (isMermaid) {
        return ( <SensorBlock active={sensorMode} label="Reveal Diagram"> <div className="mermaid-container"><Mermaid chart={content} key={content} /></div></SensorBlock> );
    }
    if (!match) return <code className="bg-[var(--md-code-bg)] px-1 py-0.5 rounded text-red-500 font-mono text-sm border border-[var(--md-border)]" {...props}>{children}</code>;

    return (
        <SensorBlock active={sensorMode} label="Reveal Code">
          <div className="group relative my-4 rounded-lg overflow-hidden border border-[var(--md-border)] bg-[var(--md-code-bg)] text-[var(--md-text)] shadow-sm text-sm p-4">
              <code className={`${className}`} {...props}>{children}</code>
          </div>
        </SensorBlock>
    );
  }, [sensorMode]);

  const getHeaderId = useCallback((text: string, level: number) => { const found = toc.find(t => t.text === text && t.level === level); return found ? found.id : undefined; }, [toc]);

  const components = useMemo(() => ({
    h1: ({ children }: any) => <h1 id={getHeaderId(String(children), 1)}>{children}</h1>,
    h2: ({ children }: any) => <h2 id={getHeaderId(String(children), 2)}>{children}</h2>,
    h3: ({ children }: any) => <h3 id={getHeaderId(String(children), 3)}>{children}</h3>,
    code: CodeBlock
  }), [getHeaderId, CodeBlock]);

  return (
    <div className="h-full flex flex-col relative font-sans bg-[var(--ui-bg)]">
      
      {/* --- CONTENT SCROLL AREA --- */}
      <div 
        className="flex-1 overflow-y-auto custom-scrollbar relative scroll-smooth"
        ref={scrollRef}
        onScroll={handleScroll}
      >
         {/* Markdown Container */}
         {activeTab === 'preview' && (
             <div className="min-h-full py-10 px-4 md:px-10 flex justify-center pb-32">
                <div className={`markdown-body w-full max-w-4xl animate-fade-in relative theme-${theme} print:shadow-none print:w-full transition-all duration-300`}>
                   <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={components}>
                      {debouncedContent}
                   </ReactMarkdown>
                </div>
             </div>
         )}

         {activeTab === 'code' && (
             <div className="min-h-full p-6 pb-32">
                <textarea 
                    value={editableContent}
                    onChange={(e) => { setEditableContent(e.target.value); setIsDirty(true); }}
                    onBlur={() => pushToHistory(editableContent)}
                    className="w-full h-[80vh] bg-[#0f172a] text-gray-300 font-mono text-sm p-6 rounded-xl outline-none resize-none border border-gray-700"
                    spellCheck={false}
                />
             </div>
         )}

         {/* TOC OVERLAY (Floating Left) */}
         {showToc && activeTab === 'preview' && toc.length > 0 && (
             <div className="fixed left-24 top-24 w-64 max-h-[70vh] overflow-y-auto custom-scrollbar bg-[var(--ui-surface)]/90 backdrop-blur border border-[var(--ui-border)] rounded-xl shadow-2xl p-4 z-40 animate-slide-up">
                 <div className="flex justify-between items-center mb-4 border-b border-[var(--ui-border)] pb-2">
                     <span className="text-xs font-bold text-[var(--ui-text-muted)] uppercase tracking-widest">Outline</span>
                     <button onClick={() => setShowToc(false)}><X size={14} className="text-[var(--ui-text-muted)]"/></button>
                 </div>
                 <div className="space-y-1">
                    {toc.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => scrollToHeader(item.id)}
                        className={`w-full text-left py-1.5 px-2 text-[11px] rounded transition-all truncate border-l-2
                            ${activeHeaderId === item.id ? 'border-[var(--ui-primary)] text-[var(--ui-primary)] font-bold bg-[var(--ui-primary-glow)]' : 'border-transparent text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]'}
                            ${item.level > 1 ? 'ml-2' : ''}
                        `}
                      >
                        {item.text}
                      </button>
                    ))}
                 </div>
             </div>
         )}
      </div>

      {/* --- FLOATING ACTION BAR (Bottom Center) --- */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-50 flex flex-col items-center gap-2">
          
          {/* Magic Edit Input */}
          {showMagicEdit && (
              <div className="bg-[var(--ui-surface)] border border-[var(--ui-border)] p-2 rounded-xl shadow-2xl flex items-center gap-2 w-96 animate-scale-in mb-2">
                  <Wand2 size={16} className="text-[var(--ui-primary)] ml-2"/>
                  <input 
                      autoFocus
                      type="text" 
                      value={magicInstruction}
                      onChange={(e) => setMagicInstruction(e.target.value)}
                      placeholder="How should AI refine this?"
                      className="flex-1 bg-transparent text-xs outline-none text-[var(--ui-text-main)]"
                      onKeyDown={(e) => e.key === 'Enter' && executeMagicEdit()}
                  />
                  <button onClick={() => setShowMagicEdit(false)} className="p-1 hover:bg-[var(--ui-bg)] rounded"><X size={14}/></button>
              </div>
          )}

          {/* Main Toolbar */}
          <div className="bg-[var(--ui-surface)]/90 backdrop-blur-md border border-[var(--ui-border)] p-1.5 rounded-full shadow-2xl flex items-center gap-1 transition-all hover:scale-[1.01]">
              
              {/* Tabs */}
              <div className="flex bg-[var(--ui-bg)] rounded-full p-0.5 border border-[var(--ui-border)] mr-2">
                  <button onClick={() => setActiveTab('preview')} className={`p-2 rounded-full transition-all ${activeTab === 'preview' ? 'bg-[var(--ui-surface)] shadow text-[var(--ui-text-main)]' : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]'}`} title="Read"><BookOpen size={16}/></button>
                  <button onClick={() => setActiveTab('code')} className={`p-2 rounded-full transition-all ${activeTab === 'code' ? 'bg-[var(--ui-surface)] shadow text-[var(--ui-text-main)]' : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]'}`} title="Edit Code"><Edit3 size={16}/></button>
              </div>

              {/* Tools */}
              <button onClick={() => setShowToc(!showToc)} className={`p-2.5 rounded-full text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg)] hover:text-[var(--ui-text-main)] transition-all ${showToc ? 'text-[var(--ui-primary)] bg-[var(--ui-primary-glow)]' : ''}`} title="Outline"><List size={18}/></button>
              <button onClick={handleExportPdf} disabled={isExportingPdf} className="p-2.5 rounded-full text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg)] hover:text-[var(--ui-text-main)] transition-all" title="Export PDF">{isExportingPdf ? <Loader2 size={18} className="animate-spin"/> : <FileDown size={18}/>}</button>
              
              <button onClick={() => setSensorMode(!sensorMode)} className={`p-2.5 rounded-full transition-all ${sensorMode ? 'bg-amber-100 text-amber-600' : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg)] hover:text-[var(--ui-text-main)]'}`} title="Active Recall Mode"><EyeOff size={18}/></button>
              
              <button onClick={() => setShowMagicEdit(!showMagicEdit)} className="p-2.5 rounded-full text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg)] hover:text-indigo-500 transition-all" title="Magic Refine"><Wand2 size={18}/></button>
              
              <div className="w-[1px] h-6 bg-[var(--ui-border)] mx-1"></div>

              {/* History */}
              <button onClick={undo} disabled={historyIndex === 0} className="p-2.5 rounded-full text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg)] hover:text-[var(--ui-text-main)] disabled:opacity-30"><Undo2 size={18}/></button>
              <button onClick={redo} disabled={historyIndex === history.length - 1} className="p-2.5 rounded-full text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg)] hover:text-[var(--ui-text-main)] disabled:opacity-30"><Redo2 size={18}/></button>

              {/* Save */}
              <button 
                  onClick={handleManualSaveTrigger} 
                  disabled={!isDirty || isSaving}
                  className={`ml-2 px-5 py-2.5 rounded-full font-bold text-xs flex items-center gap-2 transition-all ${justSaved ? 'bg-green-500 text-white' : isDirty ? 'bg-[var(--ui-primary)] text-white hover:opacity-90' : 'bg-[var(--ui-bg)] text-[var(--ui-text-muted)] border border-[var(--ui-border)]'}`}
              >
                  {isSaving ? <Loader2 size={14} className="animate-spin"/> : justSaved ? <Check size={14}/> : <Save size={14}/>}
                  {justSaved ? 'Saved' : 'Save'}
              </button>
          </div>
      </div>

    </div>
  );
};

export default OutputDisplay;
