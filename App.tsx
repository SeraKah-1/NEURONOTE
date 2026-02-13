
import React, { useState, useEffect, Suspense } from 'react';
import { BrainCircuit, Settings2, Sparkles, BookOpen, Layers, Zap, AlertCircle, X, Key, GraduationCap, Microscope, Puzzle, Database, HardDrive, Cloud, Layout, Activity, FlaskConical, ListChecks, Bell, HelpCircle, Copy, Check, ShieldCheck, Cpu, Unlock, Download, RefreshCw, User, Lock, Server, PenTool, Wand2, ChevronRight, FileText, FolderOpen, Trash2, CheckCircle2, Circle, Command, Bot, Maximize2, Home, Projector, Minimize2, Component, Save, BookTemplate, ChevronDown, ChevronUp, MessageSquarePlus, Library, Palette, Sun, Moon, Coffee } from 'lucide-react';
import { AppModel, AppState, NoteData, GenerationConfig, MODE_STRUCTURES, NoteMode, HistoryItem, AIProvider, StorageType, AppView, EncryptedPayload, SavedPrompt, AppTheme } from './types';
import { generateNoteContent, generateDetailedStructure } from './services/geminiService';
import { generateNoteContentGroq, getAvailableGroqModels, generateDetailedStructureGroq } from './services/groqService';
import { StorageService } from './services/storageService';
import { NotificationService } from './services/notificationService';
import FileUploader from './components/FileUploader';
import SyllabusFlow from './components/SyllabusFlow';
import LoginGate from './components/LoginGate';
import FileSystem from './components/FileSystem'; 
import NeuralVault from './components/NeuralVault';
import CommandPalette from './components/CommandPalette';

// LAZY LOAD OPTIMIZATION:
const GraphView = React.lazy(() => import('./components/GraphView'));
const OutputDisplay = React.lazy(() => import('./components/OutputDisplay'));
const AdminPanel = React.lazy(() => import('./components/AdminPanel'));

// ... (Constants omitted for brevity, logic remains same)
const SUPABASE_SETUP_SQL = `
-- RUN THIS IN SUPABASE SQL EDITOR --

-- 1. Create Table (with tags support)
create table if not exists public.neuro_notes (
  id text primary key,
  timestamp bigint,
  topic text,
  mode text,
  content text,
  provider text,
  tags text[] -- Array of strings for tagging
);

-- 2. Security (Allow All)
alter table public.neuro_notes enable row level security;
drop policy if exists "God Mode" on public.neuro_notes;
create policy "God Mode" on public.neuro_notes for all using (true) with check (true);

-- 3. Enable Realtime
alter publication supabase_realtime add table public.neuro_notes;
`.trim();

const GEMINI_MODELS = [
  { value: AppModel.GEMINI_3_PRO, label: 'Gemini 3.0 Pro (Thinking)', badge: 'Reasoning' },
  { value: AppModel.GEMINI_3_FLASH, label: 'Gemini 3.0 Flash', badge: 'Fast' },
  { value: AppModel.GEMINI_2_5_PRO, label: 'Gemini 2.5 Pro', badge: 'Stable' },
  { value: AppModel.GEMINI_2_5_FLASH, label: 'Gemini 2.5 Flash', badge: 'Production' },
];
const INITIAL_GROQ_MODELS = [
  { value: AppModel.GROQ_LLAMA_4_MAVERICK_17B, label: 'Llama 4 Maverick 17B', badge: 'New' },
  { value: AppModel.GROQ_LLAMA_3_3_70B, label: 'Llama 3.3 70B', badge: 'Versatile' },
  { value: AppModel.GROQ_MIXTRAL_8X7B, label: 'Mixtral 8x7B', badge: 'Logic' },
  { value: AppModel.GROQ_GEMMA2_9B, label: 'Gemma 2 9B', badge: 'Google' },
];

const App: React.FC = () => {
  // ... (State Hooks logic remains same)
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<AppTheme>(AppTheme.CLINICAL_CLEAN);
  
  const [config, setConfig] = useState<GenerationConfig>({
    provider: AIProvider.GEMINI,
    model: AppModel.GEMINI_3_FLASH, 
    temperature: 0.4,
    apiKey: '', 
    groqApiKey: '', 
    mode: NoteMode.GENERAL,
    storageType: StorageType.LOCAL,
    supabaseUrl: '',
    supabaseKey: '',
    autoApprove: true,
    customContentPrompt: '' 
  });

  const [noteData, setNoteData] = useState<NoteData>({
    topic: '',
    files: [],
    structure: MODE_STRUCTURES[NoteMode.GENERAL],
  });

  const [appState, setAppState] = useState<AppState>({
    isLoading: false,
    generatedContent: null,
    error: null,
    progressStep: '',
    currentView: AppView.WORKSPACE,
    activeNoteId: null
  });

  const [isStructLoading, setIsStructLoading] = useState(false);
  const [groqModels, setGroqModels] = useState(INITIAL_GROQ_MODELS);
  const [settingsTab, setSettingsTab] = useState<'keys' | 'storage' | 'appearance'>('keys'); 
  const [storageService] = useState(StorageService.getInstance());
  const [notificationService] = useState(NotificationService.getInstance());
  const [sqlCopied, setSqlCopied] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<SavedPrompt[]>([]);

  // ... (Effects and Handlers match previous version)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setShowPalette(prev => !prev); }
      if (focusMode && e.key === 'Escape' && !showPalette) { setFocusMode(false); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusMode, showPalette]);

  const handleAuthUnlock = (payload: EncryptedPayload) => {
    setConfig(prev => ({ ...prev, apiKey: payload.geminiKey || prev.apiKey, groqApiKey: payload.groqKey || prev.groqApiKey, supabaseUrl: payload.supabaseUrl || prev.supabaseUrl, supabaseKey: payload.supabaseKey || prev.supabaseKey, storageType: (payload.supabaseUrl && payload.supabaseKey) ? StorageType.SUPABASE : StorageType.LOCAL }));
    if (payload.supabaseUrl && payload.supabaseKey) { storageService.initSupabase(payload.supabaseUrl, payload.supabaseKey); }
    setIsAuthenticated(true);
    notificationService.requestPermissionManual();
  };

  useEffect(() => {
    if (config.supabaseUrl && config.supabaseKey) { storageService.initSupabase(config.supabaseUrl, config.supabaseKey); }
    setSavedTemplates(storageService.getTemplates());
    const savedTheme = localStorage.getItem('neuro_theme');
    if (savedTheme) { setCurrentTheme(savedTheme as AppTheme); }
  }, [config.supabaseUrl, config.supabaseKey, storageService]);

  const handleThemeChange = (theme: AppTheme) => { setCurrentTheme(theme); localStorage.setItem('neuro_theme', theme); };

  useEffect(() => {
    const fetchModels = async () => {
      if (config.provider === AIProvider.GROQ && config.groqApiKey) {
        const models = await getAvailableGroqModels(config);
        if (models && models.length > 0) {
          const merged = models.map((m: any) => {
            const existing = INITIAL_GROQ_MODELS.find(im => im.value === m.id);
            return existing || { value: m.id, label: m.id.split('/').pop(), badge: 'API' };
          });
          setGroqModels(merged);
        }
      }
    };
    fetchModels();
  }, [config.provider, config.groqApiKey]);

  const handleSaveTemplate = () => { const name = prompt("Name:"); if (name) { const t: SavedPrompt = { id: Date.now().toString(), name: name.trim(), content: noteData.structure }; storageService.saveTemplate(t); setSavedTemplates(storageService.getTemplates()); setShowTemplates(false); } };
  const handleLoadTemplate = (t: SavedPrompt) => { setNoteData(prev => ({...prev, structure: t.content})); setShowTemplates(false); };
  const handleDeleteTemplate = (id: string, e: React.MouseEvent) => { e.stopPropagation(); if(confirm("Delete?")) { storageService.deleteTemplate(id); setSavedTemplates(storageService.getTemplates()); } };

  const handleManualSave = async (contentToSave: string) => {
    if (!noteData.topic) return alert("Missing Topic");
    const noteId = appState.activeNoteId || Date.now().toString();
    const newItem: HistoryItem = { id: noteId, timestamp: Date.now(), topic: noteData.topic, mode: config.mode, content: contentToSave, provider: config.provider, parentId: null };
    storageService.saveNoteLocal(newItem);
    setAppState(prev => ({ ...prev, activeNoteId: noteId }));
    notificationService.send("Note Saved", `"${noteData.topic}" saved successfully.`, "save-complete");
  };

  const handleUpdateContent = (newContent: string) => { setAppState(prev => ({ ...prev, generatedContent: newContent })); };
  const handleSaveApiKey = (rawValue: string, type: 'gemini' | 'groq' | 'sb_url' | 'sb_key') => { const key = rawValue.trim(); if (type === 'gemini') setConfig(prev => ({ ...prev, apiKey: key })); else if (type === 'groq') setConfig(prev => ({ ...prev, groqApiKey: key })); else if (type === 'sb_url') setConfig(prev => ({ ...prev, supabaseUrl: key })); else if (type === 'sb_key') setConfig(prev => ({ ...prev, supabaseKey: key })); };
  const handleProviderSwitch = (provider: AIProvider) => { setConfig(prev => ({ ...prev, provider })); if (provider === AIProvider.GEMINI) { setConfig(prev => ({ ...prev, model: AppModel.GEMINI_3_FLASH })); } else { setConfig(prev => ({ ...prev, model: AppModel.GROQ_LLAMA_3_3_70B })); } };

  const handleGenerate = async () => {
    if (!noteData.topic.trim() || !noteData.structure.trim()) { setAppState(prev => ({ ...prev, error: "Topic & Structure required." })); return; }
    if (config.provider === AIProvider.GROQ && !config.groqApiKey) { setAppState(prev => ({...prev, error: "Groq Key missing."})); return; }
    if (config.provider === AIProvider.GEMINI && !config.apiKey) { setAppState(prev => ({...prev, error: "Gemini Key missing."})); return; }
    setAppState(prev => ({ ...prev, isLoading: true, generatedContent: null, error: null, progressStep: 'Initializing...', activeNoteId: null }));
    try {
      let content = '';
      if (config.provider === AIProvider.GEMINI) { content = await generateNoteContent(config, noteData.topic, noteData.structure, noteData.files, (step) => setAppState(prev => ({ ...prev, progressStep: step }))); } else { content = await generateNoteContentGroq(config, noteData.topic, noteData.structure, (step) => setAppState(prev => ({ ...prev, progressStep: step }))); }
      notificationService.send("Note Complete", `"${noteData.topic}" ready.`, "gen-complete");
      setAppState(prev => ({ ...prev, isLoading: false, generatedContent: content, error: null, progressStep: 'Complete' }));
    } catch (err: any) { setAppState(prev => ({ ...prev, isLoading: false, generatedContent: null, error: err.message, progressStep: '', })); }
  };

  const handleAutoStructure = async () => { if (!noteData.topic) return alert("Enter Topic first."); setIsStructLoading(true); try { let struct = ''; if (config.provider === AIProvider.GEMINI) { struct = await generateDetailedStructure(config, noteData.topic); } else { if(!config.groqApiKey) { alert("Groq Key needed."); setIsStructLoading(false); return; } struct = await generateDetailedStructureGroq(config, noteData.topic); } setNoteData(prev => ({ ...prev, structure: struct })); } catch (e: any) { alert("Error: " + e.message); } finally { setIsStructLoading(false); } };
  const handleCopySQL = () => { navigator.clipboard.writeText(SUPABASE_SETUP_SQL); setSqlCopied(true); setTimeout(() => setSqlCopied(false), 2000); };
  const handleSelectSyllabusTopic = (topic: string) => { setNoteData(prev => ({ ...prev, topic: topic })); setAppState(prev => ({ ...prev, currentView: AppView.WORKSPACE })); };
  const handleSelectNoteFromFileSystem = (note: HistoryItem) => { setAppState(prev => ({ ...prev, currentView: AppView.WORKSPACE, generatedContent: note.content, activeNoteId: note.id })); setNoteData(prev => ({...prev, topic: note.topic})); setConfig(prev => ({...prev, mode: note.mode})); };
  const handleRetrieveFromCloud = (note: HistoryItem) => { storageService.saveNoteLocal({...note, parentId: null}); alert(`✅ Downloaded "${note.topic}".`); setAppState(prev => ({ ...prev, currentView: AppView.WORKSPACE, activeNoteId: note.id })); };
  const setView = (view: AppView) => { setAppState(prev => ({ ...prev, currentView: view })); };
  const handleModeSwitch = (mode: NoteMode) => { setConfig(prev => ({ ...prev, mode })); if (appState.currentView === AppView.SYLLABUS) setView(AppView.WORKSPACE); setNoteData(prev => ({ ...prev, structure: MODE_STRUCTURES[mode] })); };

  // --- ICONS HELPERS ---
  const getModeIcon = (mode: NoteMode) => {
    switch (mode) {
      case NoteMode.CHEAT_CODES: return <Zap size={18} className="text-amber-400" />;
      case NoteMode.COMPREHENSIVE: return <Library size={18} className="text-emerald-400" />;
      case NoteMode.CUSTOM: return <PenTool size={18} className="text-pink-400" />;
      default: return <GraduationCap size={18} className="text-[var(--ui-primary)]" />;
    }
  };
  const getModeLabel = (mode: NoteMode) => { switch (mode) { case NoteMode.CHEAT_CODES: return "Cheat Sheet"; case NoteMode.COMPREHENSIVE: return "Comprehensive"; case NoteMode.CUSTOM: return "Custom"; default: return "Standard"; } };

  if (!isAuthenticated) { return <LoginGate onUnlock={handleAuthUnlock} />; }

  return (
    // ROOT APP CONTAINER with THEME CLASS
    <div className={`min-h-screen flex flex-col md:flex-row font-sans overflow-hidden transition-colors duration-300 theme-${currentTheme} bg-[var(--ui-bg)] text-[var(--ui-text-main)]`}>
      
      <CommandPalette 
        isOpen={showPalette} 
        onClose={() => setShowPalette(false)}
        onNavigate={(v) => setView(v)}
        onChangeMode={handleModeSwitch}
        onChangeProvider={handleProviderSwitch}
        onSelectNote={handleSelectNoteFromFileSystem}
        toggleFocusMode={() => setFocusMode(!focusMode)}
        isFocusMode={focusMode}
      />

      {/* --- SIDEBAR --- */}
      <aside className={`w-full md:w-[280px] lg:w-[320px] p-5 flex flex-col shrink-0 z-30 h-screen overflow-hidden shadow-2xl border-r border-[var(--ui-border)] bg-[var(--ui-sidebar)] transition-all duration-300 ${focusMode ? 'hidden md:hidden' : 'block'}`}>
        
        {/* Header Logo */}
        <div className="flex items-center space-x-3 mb-8 shrink-0 select-none cursor-pointer group px-2" onClick={() => setView(AppView.WORKSPACE)}>
          <div className="w-10 h-10 bg-gradient-to-br from-[var(--ui-primary)] to-indigo-700 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
             <BrainCircuit className="text-white" size={22} />
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg font-bold text-[var(--ui-text-main)] tracking-tight leading-none">NeuroNote</h1>
            <span className="text-[10px] font-medium text-[var(--ui-text-muted)] uppercase tracking-widest mt-1">PKM System</span>
          </div>
        </div>

        {/* Sidebar Content */}
        {appState.currentView === AppView.SETTINGS ? (
           /* SETTINGS VIEW */
           <div className="flex-1 flex flex-col animate-fade-in overflow-hidden">
             <div className="flex items-center justify-between mb-6 pb-2 border-b border-[var(--ui-border)] text-[var(--ui-primary)] px-1">
               <div className="flex items-center space-x-2">
                 <Settings2 size={16} /> <h3 className="font-bold text-xs uppercase tracking-wider">Configuration</h3>
               </div>
             </div>
             
             <div className="flex bg-[var(--ui-bg)] p-1 rounded-lg mb-6 shrink-0 gap-1 border border-[var(--ui-border)]">
                {['keys', 'storage', 'appearance'].map(tab => (
                    <button key={tab} onClick={() => setSettingsTab(tab as any)} className={`flex-1 py-1.5 text-[9px] font-bold uppercase tracking-wide rounded-md transition-all ${settingsTab === tab ? 'bg-[var(--ui-primary)] text-white shadow-sm' : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]'}`}>
                        {tab}
                    </button>
                ))}
             </div>

             <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 px-1">
               {settingsTab === 'keys' && (
                 <div className="space-y-4 animate-slide-up">
                   {/* Inputs styled with Theme Variables */}
                   {['Gemini', 'Groq'].map(p => (
                       <div key={p} className="space-y-2">
                         <label className="text-xs text-[var(--ui-text-muted)] font-medium flex items-center gap-2">{p === 'Gemini' ? <Sparkles size={12}/> : <Cpu size={12}/>} {p} API Key</label>
                         <input type="password" value={p === 'Gemini' ? config.apiKey : config.groqApiKey} onChange={(e) => handleSaveApiKey(e.target.value, p.toLowerCase() as any)} className="w-full bg-[var(--ui-bg)] border border-[var(--ui-border)] text-[var(--ui-text-main)] rounded-lg p-3 text-xs font-mono outline-none focus:border-[var(--ui-primary)]" />
                       </div>
                   ))}
                 </div>
               )}

               {settingsTab === 'storage' && (
                  <div className="space-y-4 animate-slide-up">
                     <p className="text-[10px] text-[var(--ui-text-muted)]">Configure Cloud Archive</p>
                     <div className="space-y-3 pt-2">
                        <input type="text" value={config.supabaseUrl} onChange={(e) => handleSaveApiKey(e.target.value, 'sb_url')} placeholder="Supabase URL" className="w-full bg-[var(--ui-bg)] border border-[var(--ui-border)] rounded-lg p-2 text-xs text-[var(--ui-text-main)] outline-none" />
                        <input type="password" value={config.supabaseKey} onChange={(e) => handleSaveApiKey(e.target.value, 'sb_key')} placeholder="Supabase Anon Key" className="w-full bg-[var(--ui-bg)] border border-[var(--ui-border)] rounded-lg p-2 text-xs text-[var(--ui-text-main)] outline-none" />
                     </div>
                     <button onClick={handleCopySQL} className="text-[10px] text-[var(--ui-primary)] hover:underline flex items-center gap-1">
                        {sqlCopied ? <Check size={10}/> : <Copy size={10} />} Copy SQL Schema
                     </button>
                  </div>
               )}

               {settingsTab === 'appearance' && (
                  <div className="space-y-4 animate-slide-up">
                      <p className="text-[10px] text-[var(--ui-text-muted)]">Customize Experience</p>
                      {/* Theme Cards */}
                      {[
                          { id: AppTheme.CLINICAL_CLEAN, name: 'Clinical Clean', desc: 'Default. Professional Light.', icon: Activity, color: 'text-blue-500', bg: 'bg-white' },
                          { id: AppTheme.ACADEMIC_PAPER, name: 'Academic Paper', desc: 'Serif fonts. Minimalist.', icon: FileText, color: 'text-gray-800', bg: 'bg-gray-50' },
                          { id: AppTheme.SEPIA_FOCUS, name: 'Sepia Focus', desc: 'Warm tones. Eye care.', icon: Coffee, color: 'text-[#b58900]', bg: 'bg-[#fdf6e3] border-[#d3cbb7]' }
                      ].map(t => (
                          <div key={t.id} onClick={() => handleThemeChange(t.id)} className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center gap-3 ${currentTheme === t.id ? 'bg-[var(--ui-primary-glow)] border-[var(--ui-primary)] shadow-lg' : 'bg-[var(--ui-bg)] border-[var(--ui-border)] hover:border-[var(--ui-text-muted)]'}`}>
                             <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${t.bg} ${currentTheme === t.id ? 'border-[var(--ui-primary)]' : 'border-transparent'}`}>
                                <t.icon size={18} className={t.color}/>
                             </div>
                             <div>
                                <h4 className="text-xs font-bold text-[var(--ui-text-main)]">{t.name}</h4>
                                <p className="text-[10px] text-[var(--ui-text-muted)]">{t.desc}</p>
                             </div>
                          </div>
                      ))}
                  </div>
               )}
             </div>
             <button onClick={() => setView(AppView.WORKSPACE)} className="mt-4 w-full py-3 bg-[var(--ui-border)] hover:bg-[var(--ui-bg)] text-[var(--ui-text-main)] text-xs font-bold uppercase rounded-lg flex items-center justify-center gap-2"><ChevronRight size={14} /> Back</button>
           </div>
        ) : (
           /* MAIN SIDEBAR (Files + Tools) */
           <div className="flex-1 flex flex-col overflow-hidden">
             
             <div className="flex-1 overflow-hidden flex flex-col mb-4">
                <FileSystem onSelectNote={handleSelectNoteFromFileSystem} activeNoteId={appState.activeNoteId} />
             </div>

             <div className="border-t border-[var(--ui-border)] pt-4 space-y-4 shrink-0">
               <div className="space-y-2">
                  {[
                      { v: AppView.WORKSPACE, label: 'Main Menu', icon: Home },
                      { v: AppView.ARCHIVE, label: 'Neural Vault', icon: Cloud },
                      { v: AppView.GRAPH, label: 'Synapse Graph', icon: Maximize2 }
                  ].map(btn => (
                      <button key={btn.label} onClick={() => setView(btn.v)} className={`w-full flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--ui-bg)] text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)] transition-colors ${appState.currentView === btn.v ? 'bg-[var(--ui-bg)] font-bold text-[var(--ui-text-main)] border border-[var(--ui-border)]' : ''}`}>
                          <btn.icon size={16} className={appState.currentView === btn.v ? 'text-[var(--ui-primary)]' : ''}/> <span className="text-xs">{btn.label}</span>
                      </button>
                  ))}
               </div>

               <div className="grid grid-cols-2 gap-2">
                 <button onClick={() => setView(AppView.SETTINGS)} className="flex flex-col items-center justify-center space-y-1 p-2 rounded-lg hover:bg-[var(--ui-bg)] text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)] border border-transparent hover:border-[var(--ui-border)]">
                    <Settings2 size={16} /> <span className="text-[9px] font-bold">CONFIG</span>
                 </button>
                 <button onClick={() => setView(AppView.SYLLABUS)} className="flex flex-col items-center justify-center space-y-1 p-2 rounded-lg hover:bg-[var(--ui-bg)] text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)] border border-transparent hover:border-[var(--ui-border)]">
                    <ListChecks size={16} /> <span className="text-[9px] font-bold">SYLLABUS</span>
                 </button>
               </div>
               
               <button onClick={() => setShowAdminModal(true)} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--ui-bg)] text-[var(--ui-text-muted)] hover:text-red-400 transition-colors mt-2 border border-transparent hover:border-red-900/30">
                  <ShieldCheck size={16} /> <span className="text-xs font-bold">Admin Forge</span>
               </button>
             </div>
           </div>
        )}
      </aside>

      {/* --- MAIN CONTENT AREA --- */}
      <main className="flex-1 relative h-screen overflow-hidden flex flex-col bg-[var(--ui-bg)]">
        
        {/* Background Gradients (Subtle in Light Mode) */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0 opacity-20">
          <div className="absolute top-[-20%] left-[10%] w-[600px] h-[600px] bg-[var(--ui-primary)] opacity-10 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[-10%] right-[5%] w-[500px] h-[500px] bg-[var(--md-accent)] opacity-10 rounded-full blur-[100px]"></div>
        </div>
        
        {focusMode && (
           <button onClick={() => setFocusMode(false)} className="absolute top-4 right-4 z-50 p-3 bg-[var(--ui-sidebar)] hover:bg-[var(--ui-border)] text-[var(--ui-text-main)] rounded-full border border-[var(--ui-border)] shadow-xl backdrop-blur-md transition-all hover:scale-110 group">
             <Minimize2 size={20} className="group-hover:text-[var(--ui-primary)] transition-colors"/>
           </button>
        )}

        <div className={`relative z-10 flex-1 flex flex-col h-full ${appState.currentView === AppView.GRAPH ? 'p-0 overflow-hidden' : 'p-4 md:p-8 lg:p-10 overflow-y-auto custom-scrollbar'} ${focusMode ? 'px-[15%] pt-10' : ''}`}>
          
          {appState.currentView !== AppView.GRAPH && !focusMode && (
            <div className="flex justify-between items-start mb-6 shrink-0">
               <div>
                  <h2 className="text-2xl md:text-3xl font-bold text-[var(--ui-text-main)] tracking-tight flex items-center gap-3">
                     {appState.currentView === AppView.SYLLABUS ? <ListChecks className="text-[var(--ui-primary)]"/> : 
                      appState.currentView === AppView.ARCHIVE ? <Cloud className="text-[var(--ui-primary)]"/> : <Sparkles className="text-[var(--ui-primary)]"/>}
                     {appState.currentView === AppView.SYLLABUS ? 'Syllabus Manager' : appState.currentView === AppView.ARCHIVE ? 'Neural Vault' : 'Workspace'}
                  </h2>
                  <p className="text-[var(--ui-text-muted)] text-sm mt-1 font-medium">
                    {appState.generatedContent ? `Editing: ${noteData.topic}` : 'Medical Knowledge Generator'}
                  </p>
               </div>

               <div className="flex items-center gap-3">
                 <button onClick={() => setShowPalette(true)} className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-[var(--ui-sidebar)] border border-[var(--ui-border)] rounded-lg text-xs text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)] hover:border-[var(--ui-primary)] transition-all">
                    <Command size={12}/> <span className="font-mono">Cmd+K</span>
                 </button>

                 {appState.generatedContent && (
                   <button 
                      onClick={() => {
                         setAppState(prev => ({ ...prev, generatedContent: null, currentView: AppView.WORKSPACE, activeNoteId: null }));
                         setNoteData(prev => ({...prev, topic: ''}));
                      }}
                      className="px-4 py-2 bg-[var(--ui-sidebar)] hover:bg-[var(--ui-border)] text-[var(--ui-text-main)] text-xs font-bold uppercase rounded-lg border border-[var(--ui-border)] transition-all shadow-lg flex items-center gap-2"
                   >
                      <X size={14} /> Close
                   </button>
                 )}
               </div>
            </div>
          )}

          {/* ... Error & Loading states ... */}
          {appState.error && <div className="mb-6 bg-red-900/20 border border-red-500/30 text-red-400 p-4 rounded-xl flex items-start space-x-3">{appState.error}</div>}
          {appState.isLoading && <div className="flex flex-col items-center justify-center flex-1 space-y-6 animate-fade-in pb-20 text-[var(--ui-text-muted)]"><div className="w-16 h-16 border-4 border-[var(--ui-border)] rounded-full border-t-[var(--ui-primary)] animate-spin"></div><p>Processing...</p></div>}

          {/* VIEWS */}
          {!appState.isLoading && appState.currentView === AppView.GRAPH && <Suspense fallback={<div>Loading Graph...</div>}><div className="flex-1 animate-fade-in h-full w-full"><GraphView onSelectNote={handleSelectNoteFromFileSystem} /></div></Suspense>}
          
          {!appState.isLoading && appState.currentView === AppView.ARCHIVE && <div className="flex-1 animate-slide-up h-full flex flex-col"><NeuralVault onSelectNote={handleSelectNoteFromFileSystem} onImportCloud={handleRetrieveFromCloud} /></div>}
          
          {!appState.isLoading && appState.generatedContent && (
             <div className="flex-1 animate-slide-up h-full">
               <Suspense fallback={<div>Loading Editor...</div>}>
                  <OutputDisplay 
                    content={appState.generatedContent} 
                    topic={noteData.topic} 
                    noteId={appState.activeNoteId || undefined}
                    onUpdateContent={handleUpdateContent}
                    onManualSave={handleManualSave}
                    theme={currentTheme} 
                  />
               </Suspense>
             </div>
          )}
          
          {!appState.isLoading && appState.currentView === AppView.SYLLABUS && <SyllabusFlow config={config} onSelectTopic={handleSelectSyllabusTopic} />}
          
          {!appState.isLoading && appState.currentView === AppView.WORKSPACE && !appState.generatedContent && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full pb-6">
               <div className="lg:col-span-5 flex flex-col gap-5 animate-slide-up" style={{animationDelay: '0.1s'}}>
                 {/* Topic */}
                 <div className="bg-[var(--ui-sidebar)] border border-[var(--ui-border)] p-5 rounded-2xl shadow-xl backdrop-blur-sm">
                    <label className="text-[10px] font-bold text-[var(--ui-primary)] uppercase tracking-widest mb-3 flex items-center gap-2">
                       <Layers size={14} /> Subject Matter
                    </label>
                    <input 
                      type="text"
                      value={noteData.topic}
                      onChange={(e) => setNoteData({ ...noteData, topic: e.target.value })}
                      placeholder="e.g. Heart Failure Pathophysiology"
                      className="w-full bg-[var(--ui-bg)] border border-[var(--ui-border)] rounded-xl p-4 text-base text-[var(--ui-text-main)] focus:border-[var(--ui-primary)] outline-none transition-all placeholder-[var(--ui-text-muted)] font-medium"
                      autoFocus
                    />
                 </div>

                 {/* Mode */}
                 <div className="bg-[var(--ui-sidebar)] border border-[var(--ui-border)] p-5 rounded-2xl shadow-xl backdrop-blur-sm">
                    <label className="text-[10px] font-bold text-[var(--ui-text-muted)] uppercase tracking-widest mb-3 block">Instruction Mode</label>
                    <div className="grid grid-cols-2 gap-2">
                       {Object.values(NoteMode).map((mode) => (
                          <button key={mode} onClick={() => handleModeSwitch(mode)} className={`p-3 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-2 border transition-all ${config.mode === mode ? 'bg-[var(--ui-primary-glow)] border-[var(--ui-primary)] text-[var(--ui-primary)]' : 'bg-[var(--ui-bg)] border-transparent text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]'}`}>
                             {getModeIcon(mode)} 
                             <span className="truncate text-[10px]">{getModeLabel(mode)}</span>
                          </button>
                       ))}
                    </div>
                 </div>

                 {/* Files */}
                 <div className="bg-[var(--ui-sidebar)] border border-[var(--ui-border)] p-5 rounded-2xl shadow-xl backdrop-blur-sm flex-1">
                    <label className="text-[10px] font-bold text-[var(--ui-primary)] uppercase tracking-widest flex items-center gap-2 mb-4">
                         <FileText size={14} /> Context Data
                    </label>
                    <FileUploader files={noteData.files} onFilesChange={(files) => setNoteData({ ...noteData, files })} />
                 </div>
               </div>

               <div className="lg:col-span-7 flex flex-col gap-5 animate-slide-up" style={{animationDelay: '0.2s'}}>
                 {/* Neural Engine (RESTORED & THEMED) */}
                 <div className="bg-[var(--ui-sidebar)] border border-[var(--ui-border)] p-5 rounded-2xl shadow-xl backdrop-blur-sm">
                    <div className="flex justify-between items-center mb-3">
                       <label className="text-[10px] font-bold text-[var(--ui-primary)] uppercase tracking-widest flex items-center gap-2">
                         <Bot size={14} /> Neural Engine
                       </label>
                       {/* Provider Toggle */}
                       <div className="flex bg-[var(--ui-bg)] p-1 rounded-lg border border-[var(--ui-border)]">
                          <button 
                             onClick={() => handleProviderSwitch(AIProvider.GEMINI)} 
                             className={`px-3 py-1 rounded-md text-[10px] font-bold flex items-center gap-1.5 transition-all ${config.provider === AIProvider.GEMINI ? 'bg-indigo-600 text-white shadow' : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]'}`}
                          >
                             <Sparkles size={10}/> Gemini
                          </button>
                          <button 
                             onClick={() => handleProviderSwitch(AIProvider.GROQ)} 
                             className={`px-3 py-1 rounded-md text-[10px] font-bold flex items-center gap-1.5 transition-all ${config.provider === AIProvider.GROQ ? 'bg-orange-600 text-white shadow' : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]'}`}
                          >
                             <Cpu size={10}/> Groq
                          </button>
                       </div>
                    </div>

                    <div className="relative">
                       <select 
                          value={config.model}
                          onChange={(e) => setConfig(prev => ({...prev, model: e.target.value as AppModel}))}
                          className="w-full bg-[var(--ui-bg)] border border-[var(--ui-border)] rounded-xl p-3 text-xs text-[var(--ui-text-main)] font-mono outline-none focus:border-[var(--ui-primary)] appearance-none cursor-pointer hover:bg-[var(--ui-surface)] transition-colors"
                       >
                          {config.provider === AIProvider.GEMINI 
                             ? GEMINI_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)
                             : groqModels.map(m => <option key={m.value} value={m.value}>{m.label}</option>)
                          }
                       </select>
                       <ChevronRight size={14} className="absolute right-3 top-3.5 text-[var(--ui-text-muted)] pointer-events-none rotate-90"/>
                    </div>
                    
                    {/* Model Badges */}
                    <div className="flex justify-between items-center mt-2">
                       <div className="flex gap-2">
                           {(config.provider === AIProvider.GEMINI ? GEMINI_MODELS : groqModels).map(m => (
                              m.value === config.model && (
                                 <span key={m.value} className="text-[9px] font-bold px-2 py-0.5 rounded bg-[var(--ui-bg)] text-[var(--ui-text-muted)] border border-[var(--ui-border)]">
                                    {m.badge}
                                 </span>
                              )
                           ))}
                       </div>
                       
                       <button 
                         onClick={() => setShowCustomPrompt(!showCustomPrompt)}
                         className={`text-[9px] font-bold uppercase flex items-center gap-1 transition-colors ${showCustomPrompt ? 'text-[var(--ui-primary)]' : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]'}`}
                       >
                          <MessageSquarePlus size={12}/> Custom Instruct
                       </button>
                    </div>

                    {showCustomPrompt && (
                        <div className="mt-3 animate-slide-up">
                            <textarea 
                                value={config.customContentPrompt || ''}
                                onChange={(e) => setConfig(prev => ({...prev, customContentPrompt: e.target.value}))}
                                className="w-full h-16 bg-[var(--ui-bg)] border border-[var(--ui-border)] rounded-lg p-2 text-[10px] text-[var(--ui-text-main)] outline-none resize-none focus:border-[var(--ui-primary)]"
                                placeholder="Add specific instructions here (e.g. 'Use casual tone', 'Focus on drugs')..."
                            />
                        </div>
                    )}
                 </div>

                 {/* Blueprint */}
                 <div className="bg-[var(--ui-sidebar)] border border-[var(--ui-border)] p-5 rounded-2xl shadow-xl backdrop-blur-sm flex-1 flex flex-col min-h-[300px] relative">
                    <div className="flex items-center justify-between mb-4">
                       <label className="text-[10px] font-bold text-[var(--ui-primary)] uppercase tracking-widest flex items-center gap-2">
                         <BookOpen size={14} /> Structural Blueprint
                       </label>
                       <div className="flex gap-2">
                           <button onClick={() => setShowTemplates(!showTemplates)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all bg-[var(--ui-bg)] border border-[var(--ui-border)] text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]">
                               <BookTemplate size={12}/> Templates
                           </button>
                           <button onClick={handleAutoStructure} disabled={isStructLoading || !noteData.topic} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all bg-[var(--ui-bg)] border border-[var(--ui-border)] text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)] disabled:opacity-50">
                               {isStructLoading ? <RefreshCw size={12} className="animate-spin text-[var(--ui-primary)]"/> : <Wand2 size={12} />}
                               {isStructLoading ? 'Drafting...' : 'Auto-Draft'}
                           </button>
                       </div>
                    </div>
                    {showTemplates && (
                        <div className="absolute right-5 top-16 w-48 bg-[var(--ui-sidebar)] border border-[var(--ui-border)] rounded-xl shadow-2xl z-50 overflow-hidden animate-slide-up">
                            <div className="max-h-48 overflow-y-auto custom-scrollbar">
                                {savedTemplates.map(t => (
                                    <div key={t.id} onClick={() => handleLoadTemplate(t)} className="flex items-center justify-between p-2 hover:bg-[var(--ui-bg)] cursor-pointer text-xs text-[var(--ui-text-main)]">
                                        <span>{t.name}</span>
                                        <button onClick={(e) => handleDeleteTemplate(t.id, e)} className="text-red-400"><Trash2 size={10}/></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <textarea value={noteData.structure} onChange={(e) => setNoteData({ ...noteData, structure: e.target.value })} className="flex-1 w-full bg-[var(--ui-bg)] border border-[var(--ui-border)] rounded-xl p-5 text-sm font-mono text-[var(--ui-text-main)] placeholder-[var(--ui-text-muted)] focus:border-[var(--ui-primary)] outline-none resize-none transition-all leading-6 custom-scrollbar" placeholder="# 1. Definition..." disabled={isStructLoading} />
                 </div>

                 {/* Action */}
                 <button onClick={handleGenerate} className="w-full py-5 rounded-xl font-bold text-white shadow-lg transition-all transform hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center space-x-3 bg-[var(--ui-primary)] hover:opacity-90">
                   <Sparkles size={20} className="animate-pulse" />
                   <span className="tracking-widest text-sm uppercase">Initiate Sequence</span>
                 </button>
               </div>
            </div>
          )}
        </div>
        
        {!focusMode && <div className="absolute bottom-3 right-5 z-50 text-[10px] text-[var(--ui-text-muted)] font-mono pointer-events-none select-none">NEURONOTE.AI // SYSTEM ACTIVE</div>}
      </main>

      {showAdminModal && <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 animate-fade-in"><div className="bg-[var(--ui-sidebar)] border border-[var(--ui-border)] rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col h-[85vh]"><Suspense fallback={<div>Loading Forge...</div>}><AdminPanel onClose={() => setShowAdminModal(false)} defaultMode="create" /></Suspense></div></div>}
    </div>
  );
};

export default App;
