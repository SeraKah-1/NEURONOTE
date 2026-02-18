
import React, { useState, useEffect, Suspense } from 'react';
import { BrainCircuit, Settings2, Sparkles, BookOpen, Layers, Zap, AlertCircle, X, Key, GraduationCap, Microscope, Puzzle, Database, HardDrive, Cloud, Layout, Activity, FlaskConical, ListChecks, Bell, HelpCircle, Copy, Check, ShieldCheck, Cpu, Unlock, Download, RefreshCw, User, Lock, Server, PenTool, Wand2, ChevronRight, FileText, FolderOpen, Trash2, CheckCircle2, Circle, Command, Bot, Maximize2, Home, Projector, Minimize2, Component, Save, BookTemplate, ChevronDown, ChevronUp, MessageSquarePlus, Library, Palette, Sun, Moon, Coffee, Network, LogOut, Map, ArrowLeftFromLine, ArrowRightFromLine, Filter } from 'lucide-react';
import { AppModel, AppState, NoteData, GenerationConfig, MODE_STRUCTURES, NoteMode, HistoryItem, AIProvider, StorageType, AppView, EncryptedPayload, SavedPrompt, AppTheme } from './types';
import { generateNoteContent, generateDetailedStructure } from './services/geminiService';
import { generateNoteContentGroq, fetchGroqModels, generateDetailedStructureGroq } from './services/groqService';
import { StorageService } from './services/storageService';
import { NotificationService } from './services/notificationService';
import FileUploader from './components/FileUploader';
import SyllabusFlow from './components/SyllabusFlow';
import LoginGate from './components/LoginGate';
import FileSystem from './components/FileSystem'; 
import NeuralVault from './components/NeuralVault';
import CommandPalette from './components/CommandPalette';
// FIX: Strict relative import
import ErrorBoundary from './components/ErrorBoundary';

// LAZY LOAD OPTIMIZATION:
const OutputDisplay = React.lazy(() => import('./components/OutputDisplay'));
const AdminPanel = React.lazy(() => import('./components/AdminPanel'));
const KnowledgeBase = React.lazy(() => import('./components/KnowledgeBase'));

// UPDATED MODEL LIST (Based on latest available)
const GEMINI_MODELS = [
  { value: AppModel.GEMINI_3_PRO, label: 'Gemini 3.0 Pro', badge: 'Flagship' },
  { value: AppModel.GEMINI_3_FLASH, label: 'Gemini 3.0 Flash', badge: 'Fastest' },
  { value: AppModel.GEMINI_2_5_PRO, label: 'Gemini 2.5 Pro', badge: 'Stable' },
  { value: AppModel.GEMINI_2_5_FLASH, label: 'Gemini 2.5 Flash', badge: 'Balanced' },
  { value: AppModel.GEMINI_2_5_FLASH_LITE, label: 'Gemini 2.5 Flash-Lite', badge: 'Budget' },
  { value: AppModel.DEEP_RESEARCH_PRO, label: 'Deep Research Pro', badge: 'Agentic' },
];

const INITIAL_GROQ_MODELS = [
  { value: AppModel.GROQ_LLAMA_3_3_70B, label: 'Llama 3.3 70B', badge: 'Versatile' },
  { value: AppModel.GROQ_LLAMA_3_1_8B, label: 'Llama 3.1 8B', badge: 'Instant' },
  { value: AppModel.GROQ_MIXTRAL_8X7B, label: 'Mixtral 8x7B', badge: 'Complex' },
];

const AppContent: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false); // Collapsible Advanced Config
  const [currentTheme, setCurrentTheme] = useState<AppTheme>(AppTheme.CLINICAL_CLEAN);
  
  // Navigation State
  const [navCollapsed, setNavCollapsed] = useState(false);
  
  const [config, setConfig] = useState<GenerationConfig>({
    provider: AIProvider.GEMINI,
    model: AppModel.GEMINI_2_5_FLASH, 
    temperature: 0.4,
    apiKey: '', 
    groqApiKey: '', 
    mode: NoteMode.GENERAL,
    storageType: StorageType.LOCAL,
    supabaseUrl: '',
    supabaseKey: '',
    autoApprove: true,
    customContentPrompt: '',
    customStructurePrompt: '' 
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
    currentView: AppView.WORKSPACE, // Default View is HOME/WORKSPACE
    activeNoteId: null
  });

  const [isStructLoading, setIsStructLoading] = useState(false);
  const [groqModels, setGroqModels] = useState<{value: string, label: string, badge: string}[]>(INITIAL_GROQ_MODELS);
  const [settingsTab, setSettingsTab] = useState<'keys' | 'storage' | 'appearance'>('keys'); 
  const [storageService] = useState(StorageService.getInstance());
  const [notificationService] = useState(NotificationService.getInstance());
  const [sqlCopied, setSqlCopied] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<SavedPrompt[]>([]);

  // --- SESSION PERSISTENCE (AUTO LOGIN) ---
  useEffect(() => {
      const localGeminiKey = localStorage.getItem('neuro_gemini_key');
      const localGroqKey = localStorage.getItem('neuro_groq_key');
      const localSbUrl = localStorage.getItem('neuro_sb_url');
      const localSbKey = localStorage.getItem('neuro_sb_key');
      
      // Load saved preferences
      const savedProvider = localStorage.getItem('neuro_pref_provider');
      const savedModel = localStorage.getItem('neuro_pref_model');

      if (localGeminiKey || localGroqKey) {
          setConfig(prev => ({
              ...prev,
              apiKey: localGeminiKey || prev.apiKey,
              groqApiKey: localGroqKey || prev.groqApiKey,
              supabaseUrl: localSbUrl || prev.supabaseUrl,
              supabaseKey: localSbKey || prev.supabaseKey,
              provider: (savedProvider as AIProvider) || (localGeminiKey ? AIProvider.GEMINI : AIProvider.GROQ),
              model: savedModel || prev.model
          }));
          setIsAuthenticated(true);
      }

      if (localSbUrl && localSbKey) { storageService.initSupabase(localSbUrl, localSbKey); }
      setSavedTemplates(storageService.getTemplates());
      const savedTheme = localStorage.getItem('neuro_theme');
      if (savedTheme) { setCurrentTheme(savedTheme as AppTheme); }
  }, []);

  // --- PERSIST PREFERENCES ---
  useEffect(() => {
      if (isAuthenticated) {
          localStorage.setItem('neuro_pref_provider', config.provider);
          localStorage.setItem('neuro_pref_model', config.model);
      }
  }, [config.provider, config.model, isAuthenticated]);

  // --- DYNAMIC GROQ FETCH ---
  useEffect(() => {
      const fetchGroq = async () => {
          if (config.groqApiKey) {
              const models = await fetchGroqModels(config.groqApiKey);
              if (models.length > 0) {
                  const formatted = models.map(m => ({
                      value: m.id,
                      label: m.id.replace('groq-', '').replace('llama', 'Llama'),
                      badge: 'Cloud'
                  }));
                  // Merge with defaults to keep "badge" info for core models, but update IDs if needed
                  const merged: { value: string; label: string; badge: string; }[] = [...INITIAL_GROQ_MODELS];
                  formatted.forEach(f => {
                      if (!merged.find(m => m.value === f.value)) merged.push(f);
                  });
                  setGroqModels(merged);
              }
          }
      };
      if (isAuthenticated) fetchGroq();
  }, [config.groqApiKey, isAuthenticated]);

  const handleLogout = () => {
      if(confirm("End Session? This will require the NeuroKey Card to unlock again.")) {
          localStorage.removeItem('neuro_gemini_key');
          localStorage.removeItem('neuro_groq_key');
          window.location.reload();
      }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setShowPalette(prev => !prev); }
      if (focusMode && e.key === 'Escape' && !showPalette) { setFocusMode(false); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); setNavCollapsed(prev => !prev); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusMode, showPalette]);

  // Handlers
  const handleAuthUnlock = (payload: EncryptedPayload) => {
    setConfig(prev => ({ ...prev, apiKey: payload.geminiKey || prev.apiKey, groqApiKey: payload.groqKey || prev.groqApiKey, supabaseUrl: payload.supabaseUrl || prev.supabaseUrl, supabaseKey: payload.supabaseKey || prev.supabaseKey, storageType: (payload.supabaseUrl && payload.supabaseKey) ? StorageType.SUPABASE : StorageType.LOCAL }));
    if (payload.geminiKey) localStorage.setItem('neuro_gemini_key', payload.geminiKey);
    if (payload.groqKey) localStorage.setItem('neuro_groq_key', payload.groqKey);
    if (payload.supabaseUrl) localStorage.setItem('neuro_sb_url', payload.supabaseUrl);
    if (payload.supabaseKey) localStorage.setItem('neuro_sb_key', payload.supabaseKey);
    if (payload.supabaseUrl && payload.supabaseKey) { storageService.initSupabase(payload.supabaseUrl, payload.supabaseKey); }
    setIsAuthenticated(true);
    notificationService.requestPermissionManual();
  };

  const handleThemeChange = (theme: AppTheme) => { setCurrentTheme(theme); localStorage.setItem('neuro_theme', theme); };
  
  const handleSaveApiKey = (rawValue: string, type: 'gemini' | 'groq' | 'sb_url' | 'sb_key') => { 
      const key = rawValue.trim(); 
      if (type === 'gemini') { setConfig(prev => ({ ...prev, apiKey: key })); localStorage.setItem('neuro_gemini_key', key); }
      else if (type === 'groq') { setConfig(prev => ({ ...prev, groqApiKey: key })); localStorage.setItem('neuro_groq_key', key); }
      else if (type === 'sb_url') { setConfig(prev => ({ ...prev, supabaseUrl: key })); localStorage.setItem('neuro_sb_url', key); }
      else if (type === 'sb_key') { setConfig(prev => ({ ...prev, supabaseKey: key })); localStorage.setItem('neuro_sb_key', key); }
  };

  const handleSelectNoteFromFileSystem = async (note: HistoryItem) => {
    setAppState(prev => ({ ...prev, isLoading: true }));
    try {
        const fullContent = await storageService.getNoteContent(note.id);
        setAppState(prev => ({ 
            ...prev, 
            currentView: AppView.WORKSPACE, 
            generatedContent: fullContent || note.content || "Error loading content.", 
            activeNoteId: note.id,
            isLoading: false
        })); 
        setNoteData(prev => ({...prev, topic: note.topic})); 
        setConfig(prev => ({...prev, mode: note.mode}));
    } catch (e) {
        setAppState(prev => ({ ...prev, isLoading: false, error: "Failed to load note content." }));
    }
  };

  const handleGenerate = async () => {
    if (!noteData.topic.trim() || !noteData.structure.trim()) { setAppState(prev => ({ ...prev, error: "Topic & Structure required." })); return; }
    setAppState(prev => ({ ...prev, isLoading: true, generatedContent: null, error: null, progressStep: 'Initializing...', activeNoteId: null }));
    try {
      let content = '';
      if (config.provider === AIProvider.GEMINI) { content = await generateNoteContent(config, noteData.topic, noteData.structure, noteData.files, (step) => setAppState(prev => ({ ...prev, progressStep: step }))); } else { content = await generateNoteContentGroq(config, noteData.topic, noteData.structure, (step) => setAppState(prev => ({ ...prev, progressStep: step }))); }
      notificationService.send("Note Complete", `"${noteData.topic}" ready.`, "gen-complete");
      setAppState(prev => ({ ...prev, isLoading: false, generatedContent: content, error: null, progressStep: 'Complete' }));
    } catch (err: any) { setAppState(prev => ({ ...prev, isLoading: false, generatedContent: null, error: err.message, progressStep: '', })); }
  };

  // --- CONTENT HANDLERS ---
  const handleUpdateContent = (newContent: string) => {
    setAppState(prev => ({ ...prev, generatedContent: newContent }));
  };

  const handleManualSave = async (content: string) => {
    const currentId = appState.activeNoteId;
    const noteToSave: HistoryItem = {
      id: currentId || Date.now().toString(),
      timestamp: Date.now(),
      topic: noteData.topic,
      mode: config.mode,
      content: content,
      provider: config.provider,
      parentId: null,
      tags: [],
      _status: 'local'
    };

    if (currentId) {
      const existingMeta = storageService.getLocalNotesMetadata().find(n => n.id === currentId);
      if (existingMeta) {
        Object.assign(noteToSave, {
          ...existingMeta,
          content: content,
          timestamp: Date.now()
        });
      }
    }

    await storageService.saveNoteLocal(noteToSave);

    if ((noteToSave._status === 'synced' || noteToSave._status === 'cloud') && storageService.isCloudReady()) {
      try {
        await storageService.uploadNoteToCloud(noteToSave);
      } catch (e) {
        console.warn("Cloud sync failed during manual save", e);
      }
    }

    if (!currentId) {
      setAppState(prev => ({ ...prev, activeNoteId: noteToSave.id }));
    }
  };

  // --- SUB-COMPONENTS ---

  const PrimaryNavButton: React.FC<{ view: AppView, icon: any, label: string }> = ({ view, icon: Icon, label }) => (
      <button 
        onClick={() => setAppState(prev => ({ ...prev, currentView: view }))}
        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 group relative
        ${appState.currentView === view ? 'bg-[var(--ui-primary)] text-white shadow-lg shadow-[var(--ui-primary)]/30' : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-sidebar-secondary)] hover:text-[var(--ui-text-main)]'}`}
      >
          <Icon size={20} />
          {/* Tooltip */}
          <div className="absolute left-14 bg-[var(--ui-text-main)] text-[var(--ui-bg)] text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              {label}
          </div>
      </button>
  );

  if (!isAuthenticated) { return <LoginGate onUnlock={handleAuthUnlock} />; }

  return (
    <div className={`min-h-screen flex font-sans overflow-hidden transition-colors duration-300 theme-${currentTheme} bg-[var(--ui-bg)] text-[var(--ui-text-main)]`}>
      
      <CommandPalette 
        isOpen={showPalette} 
        onClose={() => setShowPalette(false)}
        onNavigate={(v) => setAppState(prev => ({...prev, currentView: v}))}
        onChangeMode={(m) => setConfig(prev => ({...prev, mode: m}))}
        onChangeProvider={(p) => setConfig(prev => ({...prev, provider: p}))}
        onSelectNote={handleSelectNoteFromFileSystem}
        toggleFocusMode={() => setFocusMode(!focusMode)}
        isFocusMode={focusMode}
      />

      {/* --- 1. PRIMARY SIDEBAR (Icon Strip) --- */}
      <aside className={`w-[70px] h-screen bg-[var(--ui-sidebar)] border-r border-[var(--ui-border)] flex flex-col items-center py-6 shrink-0 z-40 transition-all ${focusMode ? '-translate-x-full absolute' : 'relative'}`}>
         <div className="mb-8">
             <div className="w-10 h-10 bg-[var(--ui-primary)] rounded-xl flex items-center justify-center shadow-lg shadow-[var(--ui-primary)]/20">
                 <BrainCircuit className="text-white" size={22} />
             </div>
         </div>

         <div className="flex flex-col gap-4 flex-1">
             <PrimaryNavButton view={AppView.WORKSPACE} icon={Home} label="Workspace" />
             <PrimaryNavButton view={AppView.SYLLABUS} icon={ListChecks} label="Syllabus" />
             <PrimaryNavButton view={AppView.KNOWLEDGE} icon={Database} label="Knowledge" />
             <PrimaryNavButton view={AppView.ARCHIVE} icon={Cloud} label="Vault" />
         </div>

         <div className="flex flex-col gap-4">
             <button onClick={() => setShowAdminModal(true)} className="w-10 h-10 rounded-xl flex items-center justify-center text-[var(--ui-text-muted)] hover:text-red-500 hover:bg-red-50 transition-colors"><ShieldCheck size={20}/></button>
             <PrimaryNavButton view={AppView.SETTINGS} icon={Settings2} label="Settings" />
         </div>
      </aside>

      {/* --- 2. SECONDARY SIDEBAR (Context/File Tree) --- */}
      <aside className={`w-[280px] h-screen bg-[var(--ui-sidebar-secondary)] border-r border-[var(--ui-border)] flex flex-col transition-all duration-300 ${focusMode || navCollapsed ? 'w-0 opacity-0 overflow-hidden' : 'w-[280px] opacity-100'} z-30`}>
          <div className="p-4 flex items-center justify-between border-b border-[var(--ui-border)] bg-[var(--ui-sidebar)] h-[60px] shrink-0">
              <h3 className="font-bold text-sm text-[var(--ui-text-main)] uppercase tracking-wider">Explorer</h3>
              <button onClick={() => setNavCollapsed(true)} className="text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]"><ArrowLeftFromLine size={16}/></button>
          </div>
          <div className="flex-1 overflow-hidden p-2">
              <FileSystem onSelectNote={handleSelectNoteFromFileSystem} activeNoteId={appState.activeNoteId} />
          </div>
      </aside>

      {/* --- 3. MAIN CANVAS --- */}
      <main className="flex-1 relative h-screen overflow-hidden flex flex-col bg-[var(--ui-bg)]">
         
         {/* Collapsed Nav Toggle */}
         {navCollapsed && !focusMode && (
             <button onClick={() => setNavCollapsed(false)} className="absolute top-4 left-4 z-50 p-2 bg-[var(--ui-surface)] border border-[var(--ui-border)] rounded-lg shadow-sm text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]">
                 <ArrowRightFromLine size={16}/>
             </button>
         )}

         {/* Focus Mode Exit */}
         {focusMode && (
             <button onClick={() => setFocusMode(false)} className="absolute top-4 right-4 z-50 p-3 bg-[var(--ui-surface)] hover:bg-[var(--ui-border)] text-[var(--ui-text-main)] rounded-full border border-[var(--ui-border)] shadow-xl backdrop-blur-md transition-all hover:scale-110 group">
                 <Minimize2 size={20} className="group-hover:text-[var(--ui-primary)] transition-colors"/>
             </button>
         )}

         {/* --- CONTENT AREA --- */}
         <div className={`relative z-10 flex-1 flex flex-col h-full ${focusMode ? 'px-[15%] pt-10' : 'p-6 md:p-8'} overflow-hidden`}>
             
             {/* Header (Hidden in Zen Mode) */}
             {!focusMode && appState.currentView === AppView.WORKSPACE && !appState.generatedContent && (
                 <div className="flex justify-between items-start mb-8 shrink-0 animate-fade-in">
                     <div>
                         <h2 className="text-3xl font-extrabold text-[var(--ui-text-main)] tracking-tight">
                             Workspace
                         </h2>
                         <p className="text-[var(--ui-text-muted)] text-sm mt-1 font-medium">
                             Medical Knowledge Generator
                         </p>
                     </div>
                     <button onClick={() => setShowPalette(true)} className="hidden md:flex items-center gap-2 px-4 py-2 bg-[var(--ui-surface)] border border-[var(--ui-border)] rounded-full text-xs text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)] hover:border-[var(--ui-primary)] transition-all shadow-sm">
                         <Command size={12}/> <span className="font-mono">Cmd+K</span>
                     </button>
                 </div>
             )}

             {/* LOADING */}
             {appState.isLoading && (
                 <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--ui-bg)] z-50">
                     <div className="w-16 h-16 border-4 border-[var(--ui-border)] rounded-full border-t-[var(--ui-primary)] animate-spin mb-4"></div>
                     <p className="text-[var(--ui-text-muted)] text-sm animate-pulse">{appState.progressStep || 'Processing...'}</p>
                 </div>
             )}

             {/* ERROR */}
             {appState.error && (
                 <div className="mb-6 bg-red-50 border border-red-200 text-red-600 p-4 rounded-xl flex items-start space-x-3 animate-fade-in">
                     <AlertCircle size={20}/>
                     <span>{appState.error}</span>
                 </div>
             )}

             {/* VIEW ROUTING */}
             <div className="flex-1 overflow-y-auto custom-scrollbar h-full relative">
                 
                 {appState.currentView === AppView.ARCHIVE && <NeuralVault onSelectNote={handleSelectNoteFromFileSystem} onImportCloud={() => {}} />}
                 
                 {appState.currentView === AppView.KNOWLEDGE && (
                     <div className="h-full flex flex-col border border-[var(--ui-border)] rounded-2xl bg-[var(--ui-surface)] overflow-hidden shadow-sm">
                         <Suspense fallback={<div>Loading...</div>}><KnowledgeBase /></Suspense>
                     </div>
                 )}

                 {appState.currentView === AppView.SYLLABUS && <SyllabusFlow config={config} onSelectTopic={(t) => { setNoteData(prev => ({...prev, topic: t})); setAppState(prev => ({...prev, currentView: AppView.WORKSPACE})); }} />}

                 {appState.currentView === AppView.SETTINGS && (
                     /* SETTINGS PANEL (Simplified) */
                     <div className="max-w-2xl mx-auto space-y-6 animate-slide-up pb-20">
                         <h2 className="text-xl font-bold text-[var(--ui-text-main)] border-b border-[var(--ui-border)] pb-2">Configuration</h2>
                         
                         {/* API Keys */}
                         <div className="bg-[var(--ui-surface)] p-6 rounded-2xl border border-[var(--ui-border)] shadow-sm space-y-4">
                             <h3 className="font-bold text-sm text-[var(--ui-text-main)] flex items-center gap-2"><Key size={16}/> API Credentials</h3>
                             <div className="space-y-3">
                                 <div>
                                     <label className="text-xs font-bold text-[var(--ui-text-muted)]">Gemini API Key</label>
                                     <input type="password" value={config.apiKey} onChange={e => handleSaveApiKey(e.target.value, 'gemini')} className="w-full mt-1 p-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg)] text-xs" />
                                 </div>
                                 <div>
                                     <label className="text-xs font-bold text-[var(--ui-text-muted)]">Groq API Key</label>
                                     <input type="password" value={config.groqApiKey} onChange={e => handleSaveApiKey(e.target.value, 'groq')} className="w-full mt-1 p-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg)] text-xs" />
                                 </div>
                             </div>
                         </div>

                         {/* Theme */}
                         <div className="bg-[var(--ui-surface)] p-6 rounded-2xl border border-[var(--ui-border)] shadow-sm space-y-4">
                             <h3 className="font-bold text-sm text-[var(--ui-text-main)] flex items-center gap-2"><Palette size={16}/> Visual Theme</h3>
                             <div className="grid grid-cols-3 gap-3">
                                 {[AppTheme.CLINICAL_CLEAN, AppTheme.ACADEMIC_PAPER, AppTheme.SEPIA_FOCUS].map(t => (
                                     <button key={t} onClick={() => handleThemeChange(t)} className={`p-3 rounded-xl border text-xs font-bold capitalize ${currentTheme === t ? 'border-[var(--ui-primary)] bg-[var(--ui-primary)]/5 text-[var(--ui-primary)]' : 'border-[var(--ui-border)] hover:bg-[var(--ui-bg)]'}`}>
                                         {t.replace('_', ' ')}
                                     </button>
                                 ))}
                             </div>
                         </div>
                     </div>
                 )}

                 {appState.currentView === AppView.WORKSPACE && !appState.generatedContent && (
                     <div className="max-w-5xl mx-auto h-full flex flex-col justify-center animate-slide-up pb-20">
                         {/* HERO INPUT SECTION */}
                         <div className="text-center mb-10">
                             <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-3xl mx-auto flex items-center justify-center shadow-xl shadow-blue-500/20 mb-6">
                                 <Sparkles size={40} className="text-white"/>
                             </div>
                             <h1 className="text-4xl font-extrabold text-[var(--ui-text-main)] mb-2">What shall we learn today?</h1>
                             <p className="text-[var(--ui-text-muted)]">Enter a medical topic to generate a comprehensive study module.</p>
                         </div>

                         <div className="bg-[var(--ui-surface)] border border-[var(--ui-border)] p-2 rounded-2xl shadow-xl shadow-[var(--ui-shadow)] max-w-3xl mx-auto w-full flex flex-col gap-2 transition-all">
                             <div className="flex items-center gap-2">
                                 <div className="pl-4 text-[var(--ui-text-muted)]"><Layers size={20}/></div>
                                 <input 
                                     type="text" 
                                     value={noteData.topic} 
                                     onChange={(e) => setNoteData({...noteData, topic: e.target.value})}
                                     placeholder="e.g. Heart Failure, Krebs Cycle, Antibiotics..."
                                     className="flex-1 bg-transparent p-4 text-lg outline-none text-[var(--ui-text-main)] placeholder:text-gray-300 font-medium"
                                     autoFocus
                                 />
                                 <div className="flex items-center gap-2 pr-2">
                                     <button 
                                        onClick={() => setConfig(prev => ({...prev, provider: prev.provider === AIProvider.GEMINI ? AIProvider.GROQ : AIProvider.GEMINI}))}
                                        className="text-[10px] font-bold px-2 py-1 rounded border border-[var(--ui-border)] text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]"
                                        title="Switch Provider"
                                     >
                                         {config.provider.toUpperCase()}
                                     </button>
                                     <button onClick={handleGenerate} className="bg-[var(--ui-primary)] hover:opacity-90 text-white px-8 py-4 rounded-xl font-bold transition-all flex items-center gap-2">
                                         Generate <ArrowRightFromLine size={16}/>
                                     </button>
                                 </div>
                             </div>

                             {/* COLLAPSIBLE ADVANCED CONTROL */}
                             <div className="w-full px-2">
                                 <button 
                                    onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                                    className="flex items-center gap-1 text-[10px] font-bold text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)] transition-colors mb-2 ml-1"
                                 >
                                     <Settings2 size={10}/> {showAdvancedOptions ? 'Hide Advanced Options' : 'Show Advanced Options (Prompting)'} {showAdvancedOptions ? <ChevronUp size={10}/> : <ChevronDown size={10}/>}
                                 </button>
                                 
                                 {showAdvancedOptions && (
                                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-[var(--ui-bg)] rounded-xl border border-[var(--ui-border)] animate-slide-up">
                                         <div className="space-y-2">
                                             <label className="text-[10px] font-bold text-[var(--ui-text-muted)] uppercase flex items-center gap-2"><Component size={12}/> Custom Blueprint Instruction</label>
                                             <textarea 
                                                value={config.customStructurePrompt}
                                                onChange={(e) => setConfig({...config, customStructurePrompt: e.target.value})}
                                                className="w-full h-20 bg-[var(--ui-surface)] border border-[var(--ui-border)] rounded-lg p-3 text-xs text-[var(--ui-text-main)] outline-none resize-none focus:border-[var(--ui-primary)]"
                                                placeholder="Optional: Define how the syllabus/outline should be structured..."
                                             />
                                         </div>
                                         <div className="space-y-2">
                                             <label className="text-[10px] font-bold text-[var(--ui-text-muted)] uppercase flex items-center gap-2"><PenTool size={12}/> Custom Content Instruction</label>
                                             <textarea 
                                                value={config.customContentPrompt}
                                                onChange={(e) => setConfig({...config, customContentPrompt: e.target.value})}
                                                className="w-full h-20 bg-[var(--ui-surface)] border border-[var(--ui-border)] rounded-lg p-3 text-xs text-[var(--ui-text-main)] outline-none resize-none focus:border-[var(--ui-primary)]"
                                                placeholder="Optional: Specific instructions for the writing style, language, or depth..."
                                             />
                                         </div>
                                     </div>
                                 )}
                             </div>
                         </div>

                         {/* Quick Options */}
                         <div className="flex justify-center mt-6 gap-4">
                             <div className="flex items-center gap-2 px-4 py-2 bg-[var(--ui-surface)] rounded-full border border-[var(--ui-border)]">
                                 <span className="text-[10px] font-bold text-[var(--ui-text-muted)] uppercase">Model</span>
                                 <select 
                                    value={config.model}
                                    onChange={(e) => setConfig({...config, model: e.target.value})}
                                    className="bg-transparent text-xs font-bold text-[var(--ui-text-main)] outline-none cursor-pointer max-w-[150px]"
                                 >
                                     {config.provider === AIProvider.GEMINI ? GEMINI_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>) : groqModels.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                 </select>
                             </div>
                             
                             <div className="flex items-center gap-2 px-4 py-2 bg-[var(--ui-surface)] rounded-full border border-[var(--ui-border)]">
                                 <span className="text-[10px] font-bold text-[var(--ui-text-muted)] uppercase">Mode</span>
                                 <select 
                                    value={config.mode}
                                    onChange={(e) => { const m = e.target.value as NoteMode; setConfig({...config, mode: m}); setNoteData({...noteData, structure: MODE_STRUCTURES[m]}); }}
                                    className="bg-transparent text-xs font-bold text-[var(--ui-text-main)] outline-none cursor-pointer"
                                 >
                                     <option value={NoteMode.GENERAL}>General</option>
                                     <option value={NoteMode.COMPREHENSIVE}>Textbook</option>
                                     <option value={NoteMode.CHEAT_CODES}>Cheat Sheet</option>
                                 </select>
                             </div>
                         </div>
                         
                         <div className="max-w-2xl mx-auto mt-8 w-full">
                             <div className="text-[10px] font-bold text-[var(--ui-text-muted)] uppercase tracking-widest mb-3 text-center">Add Context (Optional)</div>
                             <FileUploader files={noteData.files} onFilesChange={(f) => setNoteData({...noteData, files: f})} />
                         </div>
                     </div>
                 )}

                 {/* RESULT DISPLAY */}
                 {appState.generatedContent && !appState.isLoading && (
                     <Suspense fallback={<div>Loading...</div>}>
                         <OutputDisplay 
                            content={appState.generatedContent} 
                            topic={noteData.topic} 
                            noteId={appState.activeNoteId || undefined}
                            config={config} 
                            onUpdateContent={handleUpdateContent}
                            onManualSave={handleManualSave}
                            theme={currentTheme} 
                         />
                     </Suspense>
                 )}

             </div>
         </div>
      </main>

      {showAdminModal && <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 animate-fade-in"><div className="bg-[var(--ui-sidebar)] border border-[var(--ui-border)] rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col h-[85vh]"><Suspense fallback={<div>Loading Forge...</div>}><AdminPanel onClose={() => setShowAdminModal(false)} defaultMode="create" /></Suspense></div></div>}
    </div>
  );
};

const App: React.FC = () => {
    return (
        <ErrorBoundary>
            <AppContent />
        </ErrorBoundary>
    );
}

export default App;
