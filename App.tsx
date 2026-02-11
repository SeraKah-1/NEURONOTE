
import React, { useState, useEffect, Suspense } from 'react';
import { BrainCircuit, Settings2, Sparkles, BookOpen, Layers, Zap, AlertCircle, X, Key, GraduationCap, Microscope, Puzzle, Database, HardDrive, Cloud, Layout, Activity, FlaskConical, ListChecks, Bell, HelpCircle, Copy, Check, ShieldCheck, Cpu, Unlock, Download, RefreshCw, User, Lock, Server, PenTool, Wand2, ChevronRight, FileText, FolderOpen, Trash2, CheckCircle2, Circle, Command, Bot, Maximize2, Home } from 'lucide-react';
import { AppModel, AppState, NoteData, GenerationConfig, MODE_STRUCTURES, NoteMode, HistoryItem, AIProvider, StorageType, AppView, EncryptedPayload } from './types';
import { generateNoteContent, generateDetailedStructure } from './services/geminiService';
import { generateNoteContentGroq, getAvailableGroqModels } from './services/groqService';
import { StorageService } from './services/storageService';
import { NotificationService } from './services/notificationService';
import FileUploader from './components/FileUploader';
import SyllabusFlow from './components/SyllabusFlow';
import LoginGate from './components/LoginGate';
import FileSystem from './components/FileSystem'; 
import NeuralVault from './components/NeuralVault';

// LAZY LOAD OPTIMIZATION:
// These components are heavy. We only load them when the specific View is active.
// This keeps the "Workspace" extremely light when typing/generating.
const GraphView = React.lazy(() => import('./components/GraphView'));
const OutputDisplay = React.lazy(() => import('./components/OutputDisplay'));
const AdminPanel = React.lazy(() => import('./components/AdminPanel'));

// Updated SQL to handle schema migration including TAGS
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

// --- MODEL DEFINITIONS ---
const GEMINI_MODELS = [
  { value: AppModel.GEMINI_3_PRO, label: 'Gemini 3.0 Pro (Thinking)', badge: 'Reasoning' },
  { value: AppModel.GEMINI_3_FLASH, label: 'Gemini 3.0 Flash', badge: 'Fast' },
  { value: AppModel.GEMINI_2_5_PRO, label: 'Gemini 2.5 Pro', badge: 'Stable' },
  { value: AppModel.GEMINI_2_5_FLASH, label: 'Gemini 2.5 Flash', badge: 'Production' },
  { value: AppModel.GEMINI_1_5_PRO, label: 'Gemini 1.5 Pro (Legacy)', badge: 'Old' },
];

// Initial Groq Models (Will be augmented/verified by API)
const INITIAL_GROQ_MODELS = [
  { value: AppModel.GROQ_LLAMA_4_MAVERICK_17B, label: 'Llama 4 Maverick 17B', badge: 'New' },
  { value: AppModel.GROQ_LLAMA_3_3_70B, label: 'Llama 3.3 70B', badge: 'Versatile' },
  { value: AppModel.GROQ_MIXTRAL_8X7B, label: 'Mixtral 8x7B', badge: 'Logic' },
  { value: AppModel.GROQ_GEMMA2_9B, label: 'Gemma 2 9B', badge: 'Google' },
  { value: AppModel.GROQ_LLAMA_3_1_8B, label: 'Llama 3.1 8B', badge: 'Instant' },
];

const App: React.FC = () => {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // State
  const [config, setConfig] = useState<GenerationConfig>({
    provider: AIProvider.GEMINI,
    model: AppModel.GEMINI_3_FLASH, 
    temperature: 0.4,
    apiKey: '', 
    groqApiKey: '', 
    mode: NoteMode.GENERAL,
    storageType: StorageType.LOCAL,
    supabaseUrl: '',
    supabaseKey: ''
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
  const [settingsTab, setSettingsTab] = useState<'keys' | 'storage'>('keys'); // Reduced settings tabs
  const [storageService] = useState(StorageService.getInstance());
  const [notificationService] = useState(NotificationService.getInstance());
  const [sqlCopied, setSqlCopied] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);

  // --- AUTH HANDLER ---
  const handleAuthUnlock = (payload: EncryptedPayload) => {
    setConfig(prev => ({
      ...prev,
      apiKey: payload.geminiKey || prev.apiKey,
      groqApiKey: payload.groqKey || prev.groqApiKey,
      supabaseUrl: payload.supabaseUrl || prev.supabaseUrl,
      supabaseKey: payload.supabaseKey || prev.supabaseKey,
      storageType: (payload.supabaseUrl && payload.supabaseKey) ? StorageType.SUPABASE : StorageType.LOCAL
    }));

    if (payload.supabaseUrl && payload.supabaseKey) {
      storageService.initSupabase(payload.supabaseUrl, payload.supabaseKey);
    }
    setIsAuthenticated(true);
    notificationService.requestPermissionManual();
  };

  // Init Storage
  useEffect(() => {
    if (config.supabaseUrl && config.supabaseKey) {
      storageService.initSupabase(config.supabaseUrl, config.supabaseKey);
    }
  }, [config.supabaseUrl, config.supabaseKey, storageService]);

  // Fetch Groq Models
  useEffect(() => {
    const fetchModels = async () => {
      if (config.provider === AIProvider.GROQ && config.groqApiKey) {
        const models = await getAvailableGroqModels(config);
        if (models && models.length > 0) {
          // Merge logic: Use dynamic list but keep our custom labels/badges if they exist
          const merged = models.map((m: any) => {
            const existing = INITIAL_GROQ_MODELS.find(im => im.value === m.id);
            return existing || { 
              value: m.id, 
              label: m.id.split('/').pop(), 
              badge: 'API' 
            };
          });
          // Ensure we don't lose the hardcoded Llama 4 if API list is partial/cached differently
          // But usually API is authoritative.
          setGroqModels(merged);
        }
      }
    };
    fetchModels();
  }, [config.provider, config.groqApiKey]);

  // --- MANUAL SAVE HANDLER ---
  const handleManualSave = async (contentToSave: string) => {
    if (!noteData.topic) return alert("Missing Topic");
    
    // Use active ID if editing, or create new unique ID
    const noteId = appState.activeNoteId || Date.now().toString();

    const newItem: HistoryItem = {
      id: noteId,
      timestamp: Date.now(),
      topic: noteData.topic,
      mode: config.mode,
      content: contentToSave,
      provider: config.provider,
      parentId: null
    };

    // Commit to storage (Local first)
    storageService.saveNoteLocal(newItem);
    
    // Update state to reflect it's now a saved note
    setAppState(prev => ({ ...prev, activeNoteId: noteId }));
    notificationService.send("Note Saved", `"${noteData.topic}" saved successfully.`, "save-complete");
  };

  const handleUpdateContent = (newContent: string) => {
    // Only update memory, DO NOT AUTO SAVE to disk
    setAppState(prev => ({ ...prev, generatedContent: newContent }));
  };

  const handleSaveApiKey = (rawValue: string, type: 'gemini' | 'groq' | 'sb_url' | 'sb_key') => {
    const key = rawValue.trim(); 
    if (type === 'gemini') setConfig(prev => ({ ...prev, apiKey: key }));
    else if (type === 'groq') setConfig(prev => ({ ...prev, groqApiKey: key }));
    else if (type === 'sb_url') setConfig(prev => ({ ...prev, supabaseUrl: key }));
    else if (type === 'sb_key') setConfig(prev => ({ ...prev, supabaseKey: key }));
  };

  // Improved Provider Switch Logic
  const handleProviderSwitch = (provider: AIProvider) => {
    setConfig(prev => ({ ...prev, provider }));
    
    // Auto-switch to default best model for the provider
    if (provider === AIProvider.GEMINI) {
      setConfig(prev => ({ ...prev, model: AppModel.GEMINI_3_FLASH }));
    } else {
      setConfig(prev => ({ ...prev, model: AppModel.GROQ_LLAMA_3_3_70B }));
    }
  };

  const handleGenerate = async () => {
    if (!noteData.topic.trim() || !noteData.structure.trim()) {
      setAppState(prev => ({ ...prev, error: "Topic and Structure are required." }));
      return;
    }
    
    // Key Check
    if (config.provider === AIProvider.GROQ && !config.groqApiKey) {
        setAppState(prev => ({...prev, error: "Groq API Key is missing. Check Settings."}));
        return;
    }
    if (config.provider === AIProvider.GEMINI && !config.apiKey) {
        setAppState(prev => ({...prev, error: "Gemini API Key is missing. Check Settings."}));
        return;
    }

    // Reset to "New Note" state when generating fresh
    setAppState(prev => ({ ...prev, isLoading: true, generatedContent: null, error: null, progressStep: 'Initializing...', activeNoteId: null }));
    
    try {
      let content = '';
      if (config.provider === AIProvider.GEMINI) {
        content = await generateNoteContent(config, noteData.topic, noteData.structure, noteData.files, (step) => setAppState(prev => ({ ...prev, progressStep: step })));
      } else {
        content = await generateNoteContentGroq(config, noteData.topic, noteData.structure, (step) => setAppState(prev => ({ ...prev, progressStep: step })));
      }
      
      // AUTO-SAVE REMOVED. Only update UI.
      notificationService.send("Note Generation Complete", `"${noteData.topic}" is ready for review.`, "gen-complete");
      setAppState(prev => ({ ...prev, isLoading: false, generatedContent: content, error: null, progressStep: 'Complete' }));
      
    } catch (err: any) {
      setAppState(prev => ({ ...prev, isLoading: false, generatedContent: null, error: err.message || "An unexpected error occurred", progressStep: '', }));
    }
  };

  const handleAutoStructure = async () => {
    if (!noteData.topic) return alert("Please enter a Topic first.");
    setIsStructLoading(true);
    try {
        const struct = await generateDetailedStructure(config, noteData.topic);
        setNoteData(prev => ({ ...prev, structure: struct }));
    } catch (e: any) {
        alert("Failed to auto-generate structure: " + e.message);
    } finally {
        setIsStructLoading(false);
    }
  };

  const handleCopySQL = () => {
    navigator.clipboard.writeText(SUPABASE_SETUP_SQL);
    setSqlCopied(true);
    setTimeout(() => setSqlCopied(false), 2000);
  };

  const handleSelectSyllabusTopic = (topic: string) => {
    setNoteData(prev => ({ ...prev, topic: topic }));
    setAppState(prev => ({ ...prev, currentView: AppView.WORKSPACE }));
  };

  const handleSelectNoteFromFileSystem = (note: HistoryItem) => {
     // If user selects a cloud-only note, we might want to prompt or just load it read-only initially?
     // For now, loading into Workspace allows saving to local easily.
     setAppState(prev => ({
        ...prev,
        currentView: AppView.WORKSPACE,
        generatedContent: note.content,
        activeNoteId: note.id 
     }));
     setNoteData(prev => ({...prev, topic: note.topic}));
     setConfig(prev => ({...prev, mode: note.mode}));
  };

  const handleRetrieveFromCloud = (note: HistoryItem) => {
      // For cloud retrieval, we save a local copy immediately for caching
      storageService.saveNoteLocal({...note, parentId: null});
      alert(`✅ Downloaded "${note.topic}" to Local Workspace.`);
      setAppState(prev => ({ ...prev, currentView: AppView.WORKSPACE, activeNoteId: note.id }));
  };

  const setView = (view: AppView) => {
    setAppState(prev => ({ ...prev, currentView: view }));
  };

  const handleModeSwitch = (mode: NoteMode) => {
    setConfig(prev => ({ ...prev, mode }));
    if (appState.currentView === AppView.SYLLABUS) setView(AppView.WORKSPACE);
    setNoteData(prev => ({ ...prev, structure: MODE_STRUCTURES[mode] }));
  };

  const getModeIcon = (mode: NoteMode) => {
    switch (mode) {
      case NoteMode.CHEAT_CODES: return <Zap size={18} className="text-amber-400" />;
      case NoteMode.FIRST_PRINCIPLES: return <Microscope size={18} className="text-cyan-400" />;
      case NoteMode.CUSTOM: return <PenTool size={18} className="text-pink-400" />;
      default: return <GraduationCap size={18} className="text-neuro-primary" />;
    }
  };

  const getModeLabel = (mode: NoteMode) => {
    switch (mode) {
      case NoteMode.CHEAT_CODES: return "Cheat Sheet";
      case NoteMode.FIRST_PRINCIPLES: return "First Principles";
      case NoteMode.CUSTOM: return "Custom / Free Style";
      default: return "Standard Clinical";
    }
  };

  if (!isAuthenticated) {
    return <LoginGate onUnlock={handleAuthUnlock} />;
  }

  return (
    <div className="min-h-screen bg-neuro-bg text-neuro-text flex flex-col md:flex-row font-sans overflow-hidden selection:bg-neuro-primary/30 selection:text-white">
      
      {/* --- SIDEBAR: CONTROL CENTER --- */}
      <aside className="w-full md:w-[280px] lg:w-[320px] glass-panel p-5 flex flex-col shrink-0 z-30 h-screen overflow-hidden shadow-2xl border-r border-white/5">
        
        {/* Header Logo */}
        <div className="flex items-center space-x-3 mb-8 shrink-0 select-none cursor-pointer group px-2" onClick={() => setView(AppView.WORKSPACE)}>
          <div className="w-10 h-10 bg-gradient-to-br from-neuro-primary to-indigo-700 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform">
             <BrainCircuit className="text-white" size={22} />
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg font-bold text-white tracking-tight leading-none">NeuroNote</h1>
            <span className="text-[10px] font-medium text-neuro-textMuted uppercase tracking-widest mt-1">PKM System</span>
          </div>
        </div>

        {/* Sidebar Content */}
        {appState.currentView === AppView.SETTINGS ? (
           /* SETTINGS VIEW (Simplified - Just Keys & Storage) */
           <div className="flex-1 flex flex-col animate-fade-in overflow-hidden">
             <div className="flex items-center justify-between mb-6 pb-2 border-b border-white/5 text-neuro-primary px-1">
               <div className="flex items-center space-x-2">
                 <Settings2 size={16} /> <h3 className="font-bold text-xs uppercase tracking-wider">Configuration</h3>
               </div>
             </div>
             
             <div className="flex bg-neuro-surface p-1 rounded-lg mb-6 shrink-0">
                <button onClick={() => setSettingsTab('keys')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wide rounded-md transition-all ${settingsTab === 'keys' ? 'bg-neuro-surfaceHighlight text-white shadow-sm' : 'text-neuro-textMuted hover:text-white'}`}>API Keys</button>
                <button onClick={() => setSettingsTab('storage')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wide rounded-md transition-all ${settingsTab === 'storage' ? 'bg-neuro-surfaceHighlight text-white shadow-sm' : 'text-neuro-textMuted hover:text-white'}`}>Storage</button>
             </div>

             <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 px-1">
               {settingsTab === 'keys' && (
                 <div className="space-y-4 animate-slide-up">
                   <div className="space-y-2">
                     <label className="text-xs text-neuro-textMuted font-medium flex items-center gap-2"><Sparkles size={12}/> Gemini API Key</label>
                     <input type="password" value={config.apiKey} onChange={(e) => handleSaveApiKey(e.target.value, 'gemini')} className="w-full bg-neuro-bg/50 border border-white/10 text-white rounded-lg p-3 text-xs font-mono outline-none focus:border-neuro-primary" placeholder="AIza..." />
                   </div>
                   <div className="space-y-2">
                     <label className="text-xs text-neuro-textMuted font-medium flex items-center gap-2"><Cpu size={12}/> Groq API Key</label>
                     <input type="password" value={config.groqApiKey} onChange={(e) => handleSaveApiKey(e.target.value, 'groq')} className="w-full bg-neuro-bg/50 border border-white/10 text-white rounded-lg p-3 text-xs font-mono outline-none focus:border-neuro-primary" placeholder="gsk_..." />
                   </div>
                 </div>
               )}

               {settingsTab === 'storage' && (
                  <div className="space-y-4 animate-slide-up">
                     <p className="text-[10px] text-gray-500">Configure Cloud Archive (Read/Write)</p>
                     <div className="space-y-3 pt-2">
                        <input type="text" value={config.supabaseUrl} onChange={(e) => handleSaveApiKey(e.target.value, 'sb_url')} placeholder="Supabase URL" className="w-full bg-neuro-bg/50 border border-white/10 rounded-lg p-2 text-xs text-white outline-none" />
                        <input type="password" value={config.supabaseKey} onChange={(e) => handleSaveApiKey(e.target.value, 'sb_key')} placeholder="Supabase Anon Key" className="w-full bg-neuro-bg/50 border border-white/10 rounded-lg p-2 text-xs text-white outline-none" />
                     </div>
                     <button onClick={handleCopySQL} className="text-[10px] text-neuro-primary hover:underline flex items-center gap-1">
                        {sqlCopied ? <Check size={10}/> : <Copy size={10} />} Copy SQL Schema
                     </button>
                  </div>
               )}
             </div>
             <button onClick={() => setView(AppView.WORKSPACE)} className="mt-4 w-full py-3 bg-neuro-surfaceHighlight hover:bg-neuro-surface text-white text-xs font-bold uppercase rounded-lg flex items-center justify-center gap-2"><ChevronRight size={14} /> Back</button>
           </div>
        ) : (
           /* MAIN SIDEBAR (Files + Tools) */
           <div className="flex-1 flex flex-col overflow-hidden">
             
             {/* File Explorer (NOW UNIFIED) */}
             <div className="flex-1 overflow-hidden flex flex-col mb-4">
                <FileSystem onSelectNote={handleSelectNoteFromFileSystem} activeNoteId={appState.activeNoteId} />
             </div>

             <div className="border-t border-white/5 pt-4 space-y-4 shrink-0">
               
               {/* PRIMARY NAVIGATION */}
               <div className="space-y-2">
                  <button onClick={() => setView(AppView.WORKSPACE)} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors bg-white/5 border border-white/5">
                      <Home size={16} className="text-neuro-primary"/> <span className="text-xs font-bold">Main Menu</span>
                  </button>

                  <button onClick={() => setView(AppView.ARCHIVE)} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors">
                      <Cloud size={16} /> <span className="text-xs font-bold">Neural Vault (Full)</span>
                  </button>

                  <button onClick={() => setView(AppView.GRAPH)} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors">
                      <Maximize2 size={16} /> <span className="text-xs font-bold">Synapse Graph</span>
                  </button>
               </div>

               {/* Settings Grid */}
               <div className="grid grid-cols-2 gap-2">
                 <button onClick={() => setView(AppView.SETTINGS)} className="flex flex-col items-center justify-center space-y-1 p-2 rounded-lg hover:bg-white/5 text-gray-500 hover:text-white">
                    <Settings2 size={16} /> <span className="text-[9px] font-bold">CONFIG</span>
                 </button>
                 <button onClick={() => setView(AppView.SYLLABUS)} className="flex flex-col items-center justify-center space-y-1 p-2 rounded-lg hover:bg-white/5 text-gray-500 hover:text-white">
                    <ListChecks size={16} /> <span className="text-[9px] font-bold">SYLLABUS</span>
                 </button>
               </div>
               
               {/* Admin (Internal) */}
               <button onClick={() => setShowAdminModal(true)} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 text-gray-500 hover:text-red-400 transition-colors mt-2 border border-transparent hover:border-red-900/30">
                  <ShieldCheck size={16} /> <span className="text-xs font-bold">Admin Forge</span>
               </button>
             </div>
           </div>
        )}
      </aside>

      {/* --- MAIN CONTENT AREA --- */}
      <main className="flex-1 relative h-screen overflow-hidden flex flex-col bg-neuro-bg">
        
        {/* Background Gradients */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[-20%] left-[10%] w-[600px] h-[600px] bg-neuro-primary/5 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[-10%] right-[5%] w-[500px] h-[500px] bg-neuro-accent/5 rounded-full blur-[100px]"></div>
        </div>

        {/* Content Container (FIXED: Overflow logic for Graph View) */}
        <div className={`relative z-10 flex-1 flex flex-col h-full ${appState.currentView === AppView.GRAPH ? 'p-0 overflow-hidden' : 'p-4 md:p-8 lg:p-10 overflow-y-auto custom-scrollbar'}`}>
          
          {/* Top Bar (Only show if NOT in Graph View for maximum immersion) */}
          {appState.currentView !== AppView.GRAPH && (
            <div className="flex justify-between items-start mb-6 shrink-0">
               <div>
                  <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                     {appState.currentView === AppView.SYLLABUS ? <ListChecks className="text-neuro-accent"/> : 
                      appState.currentView === AppView.ARCHIVE ? <Cloud className="text-cyan-400"/> : <Sparkles className="text-neuro-primary"/>}
                     
                     {appState.currentView === AppView.SYLLABUS ? 'Syllabus Manager' : 
                      appState.currentView === AppView.ARCHIVE ? 'Neural Vault' : 'Workspace'}
                  </h2>
                  <p className="text-gray-400 text-sm mt-1 font-medium">
                    {appState.generatedContent ? `Editing: ${noteData.topic}` : 'Medical Knowledge Generator'}
                  </p>
               </div>

               {appState.generatedContent && (
                 <button 
                    onClick={() => {
                       setAppState(prev => ({ ...prev, generatedContent: null, currentView: AppView.WORKSPACE, activeNoteId: null }));
                       setNoteData(prev => ({...prev, topic: ''}));
                    }}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-xs font-bold uppercase rounded-lg border border-gray-700 hover:border-gray-500 transition-all shadow-lg flex items-center gap-2"
                 >
                    <X size={14} /> Close Editor
                 </button>
               )}
            </div>
          )}

          {appState.error && (
            <div className="mb-6 bg-red-950/30 border border-red-500/30 text-red-200 p-4 rounded-xl flex items-start space-x-3 animate-fade-in backdrop-blur-md mx-4 mt-4">
               <AlertCircle className="shrink-0 mt-0.5 text-red-400" size={18} />
               <div>
                 <h4 className="font-bold text-sm text-red-100">System Alert</h4>
                 <p className="text-xs opacity-80 mt-1 leading-relaxed">{appState.error}</p>
               </div>
            </div>
          )}

          {appState.isLoading ? (
             <div className="flex flex-col items-center justify-center flex-1 space-y-6 animate-fade-in pb-20">
               <div className="relative">
                 <div className="w-20 h-20 border-4 border-gray-800 rounded-full"></div>
                 <div className="w-20 h-20 border-4 border-neuro-primary border-t-transparent border-r-transparent rounded-full absolute top-0 animate-spin"></div>
               </div>
               <div className="text-center space-y-1">
                 <h3 className="text-lg font-bold text-white tracking-tight">Processing...</h3>
                 <p className="text-neuro-textMuted text-xs font-mono bg-gray-900/50 px-3 py-1 rounded-full">{appState.progressStep}</p>
                 <div className="text-[10px] text-gray-500 mt-2 font-mono">{config.provider.toUpperCase()} ENGINE ACTIVE</div>
               </div>
             </div>
          ) : appState.currentView === AppView.GRAPH ? (
             /* SYNAPSE GRAPH VIEW (Lazy Loaded) */
             <Suspense fallback={
               <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <RefreshCw className="animate-spin mb-2" />
                  <span className="text-xs tracking-widest">LOADING NEURAL MAP...</span>
               </div>
             }>
                <div className="flex-1 animate-fade-in h-full w-full">
                  <GraphView onSelectNote={handleSelectNoteFromFileSystem} />
                </div>
             </Suspense>
          ) : appState.currentView === AppView.ARCHIVE ? (
             /* NEURAL VAULT VIEW */
             <div className="flex-1 animate-slide-up h-full flex flex-col">
                <NeuralVault onSelectNote={handleSelectNoteFromFileSystem} onImportCloud={handleRetrieveFromCloud} />
             </div>
          ) : appState.generatedContent ? (
             /* NOTE EDITOR VIEW (Lazy Loaded) */
             <div className="flex-1 animate-slide-up h-full">
               <Suspense fallback={<div className="p-10 text-center text-gray-500">Loading Editor...</div>}>
                  <OutputDisplay 
                    content={appState.generatedContent} 
                    topic={noteData.topic} 
                    noteId={appState.activeNoteId || undefined}
                    onUpdateContent={handleUpdateContent}
                    onManualSave={handleManualSave}
                  />
               </Suspense>
             </div>
          ) : appState.currentView === AppView.SYLLABUS ? (
             /* SYLLABUS MANAGER VIEW */
             <SyllabusFlow config={config} onSelectTopic={handleSelectSyllabusTopic} />
          ) : (
            /* --- WORKSPACE INPUT FORM --- */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full pb-6">
               
               {/* --- LEFT DECK: CONTEXT (Input) --- */}
               <div className="lg:col-span-5 flex flex-col gap-5 animate-slide-up" style={{animationDelay: '0.1s'}}>
                 
                 {/* 1. Topic Input */}
                 <div className="bg-neuro-surface/50 border border-white/5 p-5 rounded-2xl shadow-xl backdrop-blur-sm group focus-within:border-neuro-primary/50 transition-colors">
                    <label className="text-[10px] font-bold text-neuro-primary uppercase tracking-widest mb-3 flex items-center gap-2">
                       <Layers size={14} /> Subject Matter
                    </label>
                    <input 
                      type="text"
                      value={noteData.topic}
                      onChange={(e) => setNoteData({ ...noteData, topic: e.target.value })}
                      placeholder="e.g. Heart Failure Pathophysiology"
                      className="w-full bg-black/20 border border-gray-700 rounded-xl p-4 text-base text-white focus:border-neuro-primary focus:ring-1 focus:ring-neuro-primary outline-none transition-all placeholder:text-gray-600 font-medium"
                      autoFocus
                    />
                 </div>

                 {/* 2. Mode Grid */}
                 <div className="bg-neuro-surface/50 border border-white/5 p-5 rounded-2xl shadow-xl backdrop-blur-sm">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 block">Instruction Mode</label>
                    <div className="grid grid-cols-2 gap-2">
                       {Object.values(NoteMode).map((mode) => (
                          <button key={mode} onClick={() => handleModeSwitch(mode)} className={`p-3 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-2 border transition-all ${config.mode === mode ? 'bg-neuro-primary/20 border-neuro-primary text-white' : 'bg-black/20 border-transparent text-gray-500 hover:text-gray-300'}`}>
                             {getModeIcon(mode)} 
                             <span className="truncate text-[10px]">{getModeLabel(mode)}</span>
                          </button>
                       ))}
                    </div>
                 </div>

                 {/* 3. File Context */}
                 <div className={`bg-neuro-surface/50 border border-white/5 p-5 rounded-2xl shadow-xl backdrop-blur-sm transition-opacity flex-1 ${config.provider === AIProvider.GROQ ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                    <div className="flex justify-between items-center mb-4">
                      <label className="text-[10px] font-bold text-neuro-primary uppercase tracking-widest flex items-center gap-2">
                         <FileText size={14} /> Context Data
                      </label>
                      {config.provider === AIProvider.GROQ && <span className="text-orange-400 text-[9px] font-bold border border-orange-400/30 px-1.5 py-0.5 rounded">TEXT ONLY</span>}
                    </div>
                    <FileUploader files={noteData.files} onFilesChange={(files) => setNoteData({ ...noteData, files })} />
                 </div>
               </div>

               {/* --- RIGHT DECK: BLUEPRINT (Control) --- */}
               <div className="lg:col-span-7 flex flex-col gap-5 animate-slide-up" style={{animationDelay: '0.2s'}}>
                 
                 {/* 1. NEURAL ENGINE SELECTOR (New Feature) */}
                 <div className="bg-neuro-surface/50 border border-white/5 p-5 rounded-2xl shadow-xl backdrop-blur-sm">
                    <div className="flex justify-between items-center mb-3">
                       <label className="text-[10px] font-bold text-neuro-primary uppercase tracking-widest flex items-center gap-2">
                         <Bot size={14} /> Neural Engine
                       </label>
                       {/* Provider Toggle */}
                       <div className="flex bg-gray-900/50 p-1 rounded-lg border border-white/5">
                          <button 
                             onClick={() => handleProviderSwitch(AIProvider.GEMINI)} 
                             className={`px-3 py-1 rounded-md text-[10px] font-bold flex items-center gap-1.5 transition-all ${config.provider === AIProvider.GEMINI ? 'bg-indigo-600 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                          >
                             <Sparkles size={10}/> Gemini
                          </button>
                          <button 
                             onClick={() => handleProviderSwitch(AIProvider.GROQ)} 
                             className={`px-3 py-1 rounded-md text-[10px] font-bold flex items-center gap-1.5 transition-all ${config.provider === AIProvider.GROQ ? 'bg-orange-600 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                          >
                             <Cpu size={10}/> Groq
                          </button>
                       </div>
                    </div>

                    <div className="relative">
                       <select 
                          value={config.model}
                          onChange={(e) => setConfig(prev => ({...prev, model: e.target.value as AppModel}))}
                          className="w-full bg-black/30 border border-gray-700 rounded-xl p-3 text-xs text-white font-mono outline-none focus:border-neuro-primary appearance-none cursor-pointer hover:bg-black/40 transition-colors"
                       >
                          {config.provider === AIProvider.GEMINI 
                             ? GEMINI_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)
                             : groqModels.map(m => <option key={m.value} value={m.value}>{m.label}</option>)
                          }
                       </select>
                       <ChevronRight size={14} className="absolute right-3 top-3.5 text-gray-500 pointer-events-none rotate-90"/>
                    </div>
                    
                    {/* Model Badges */}
                    <div className="flex gap-2 mt-2">
                       {(config.provider === AIProvider.GEMINI ? GEMINI_MODELS : groqModels).map(m => (
                          m.value === config.model && (
                             <span key={m.value} className="text-[9px] font-bold px-2 py-0.5 rounded bg-white/5 text-gray-400 border border-white/5">
                                {m.badge}
                             </span>
                          )
                       ))}
                    </div>
                 </div>

                 {/* 2. Structure Blueprint */}
                 <div className="bg-neuro-surface/50 border border-white/5 p-5 rounded-2xl shadow-xl backdrop-blur-sm flex-1 flex flex-col min-h-[300px]">
                    <div className="flex items-center justify-between mb-4">
                       <label className="text-[10px] font-bold text-neuro-primary uppercase tracking-widest flex items-center gap-2">
                         <BookOpen size={14} /> Structural Blueprint
                       </label>
                       
                       <button 
                           onClick={handleAutoStructure}
                           disabled={isStructLoading || !noteData.topic}
                           className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all bg-neuro-surface hover:bg-gray-700 border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white"
                        >
                           {isStructLoading ? <RefreshCw size={12} className="animate-spin"/> : <Wand2 size={12} />}
                           {isStructLoading ? 'Drafting...' : 'Auto-Draft'}
                        </button>
                    </div>

                    <div className="relative flex-1 group">
                      <textarea 
                        value={noteData.structure}
                        onChange={(e) => setNoteData({ ...noteData, structure: e.target.value })}
                        className="absolute inset-0 w-full h-full bg-black/20 border border-gray-700 rounded-xl p-5 text-sm font-mono text-gray-300 placeholder:text-gray-700 focus:border-neuro-primary focus:ring-1 focus:ring-neuro-primary outline-none resize-none transition-all leading-6 custom-scrollbar"
                        placeholder="# 1. Definition..."
                      />
                    </div>
                 </div>

                 {/* 3. Action Button */}
                 <button 
                  onClick={handleGenerate}
                  disabled={config.provider === AIProvider.GEMINI ? false : !config.groqApiKey}
                  className={`w-full py-5 rounded-xl font-bold text-white shadow-[0_0_30px_rgba(79,70,229,0.3)] transition-all transform hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center space-x-3 border border-white/10
                    ${(config.provider === AIProvider.GEMINI ? false : !config.groqApiKey) 
                      ? 'bg-gray-800 cursor-not-allowed opacity-50 text-gray-400' 
                      : 'bg-gradient-to-r from-neuro-primary to-indigo-600 hover:from-neuro-primaryHover hover:to-indigo-500'
                    }`}
                 >
                   <Sparkles size={20} className={!(config.provider === AIProvider.GEMINI ? false : !config.groqApiKey) ? 'animate-pulse' : ''} />
                   <span className="tracking-widest text-sm uppercase">Initiate Sequence</span>
                 </button>
               </div>

            </div>
          )}

        </div>
        
        {/* Footer Info */}
        <div className="absolute bottom-3 right-5 z-50 text-[10px] text-gray-600 font-mono pointer-events-none select-none">
          NEURONOTE.AI // SYSTEM ACTIVE
        </div>
      </main>

      {/* --- INTERNAL ADMIN MODAL --- */}
      {showAdminModal && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 animate-fade-in">
           <div className="bg-[#0f172a] border border-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col h-[85vh]">
              <Suspense fallback={<div className="flex items-center justify-center h-full text-white">Loading Forge...</div>}>
                 <AdminPanel onClose={() => setShowAdminModal(false)} defaultMode="create" />
              </Suspense>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
