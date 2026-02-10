import React, { useState, useEffect } from 'react';
import { BrainCircuit, Settings2, Sparkles, BookOpen, Layers, Zap, AlertCircle, X, Key, GraduationCap, Microscope, Puzzle, MessageCircleQuestion, History, Clock, Trash2, FileText, Cpu, CloudLightning, Save, ShieldCheck, Database, HardDrive, Cloud, ChevronRight, Layout, Activity, FlaskConical, ListChecks, Edit2 } from 'lucide-react';
import { AppModel, AppState, NoteData, GenerationConfig, DEFAULT_STRUCTURE, MODE_STRUCTURES, UploadedFile, NoteMode, HistoryItem, AIProvider, StorageType, AppView } from './types';
import { generateNoteContent } from './services/geminiService';
import { generateNoteContentGroq } from './services/groqService';
import { StorageService } from './services/storageService';
import OutputDisplay from './components/OutputDisplay';
import FileUploader from './components/FileUploader';
import SyllabusFlow from './components/SyllabusFlow';

const App: React.FC = () => {
  // State
  const [config, setConfig] = useState<GenerationConfig>({
    provider: AIProvider.GEMINI,
    model: AppModel.GEMINI_2_5_FLASH, 
    temperature: 0.4,
    apiKey: localStorage.getItem('neuro_api_key') || '',     
    groqApiKey: localStorage.getItem('neuro_groq_key') || '',
    mode: NoteMode.GENERAL,
    storageType: (localStorage.getItem('neuro_storage_type') as StorageType) || StorageType.LOCAL,
    supabaseUrl: localStorage.getItem('neuro_sb_url') || '',
    supabaseKey: localStorage.getItem('neuro_sb_key') || ''
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
    currentView: AppView.WORKSPACE
  });

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [settingsTab, setSettingsTab] = useState<'gemini' | 'groq' | 'storage'>('gemini');
  const [storageService] = useState(StorageService.getInstance());

  // Init Storage
  useEffect(() => {
    storageService.setStorageType(config.storageType);
    if (config.supabaseUrl && config.supabaseKey) {
      storageService.initSupabase(config.supabaseUrl, config.supabaseKey);
    }
  }, [config.storageType, config.supabaseUrl, config.supabaseKey, storageService]);

  // Load History Logic
  const fetchHistory = async () => {
    try {
      setAppState(prev => ({ ...prev, isLoading: true, progressStep: 'Loading History...' }));
      const notes = await storageService.getNotes();
      setHistory(notes);
      setAppState(prev => ({ ...prev, isLoading: false, progressStep: '' }));
    } catch (e: any) {
      console.error("History Load Error", e);
      setAppState(prev => ({ ...prev, isLoading: false, error: e.message || "Failed to load history" }));
    }
  };

  useEffect(() => {
    if (appState.currentView === AppView.HISTORY) {
      fetchHistory();
    }
  }, [appState.currentView, config.storageType]);

  const saveToHistory = async (topic: string, content: string, mode: NoteMode) => {
    const newItem: HistoryItem = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      topic,
      mode,
      content,
      provider: config.provider
    };
    
    if (config.storageType === StorageType.LOCAL) {
      setHistory(prev => [newItem, ...prev]);
    }

    try {
      await storageService.saveNote(newItem);
      if (config.storageType === StorageType.SUPABASE) {
         fetchHistory();
      }
    } catch (e) {
      console.error("Failed to save note", e);
    }
  };

  const deleteHistoryItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Delete this note permanently?")) {
      try {
        await storageService.deleteNote(id);
        setHistory(prev => prev.filter(h => h.id !== id));
      } catch (err: any) {
        alert(`Failed to delete: ${err.message}`);
      }
    }
  };

  const renameHistoryItem = async (id: string, currentTopic: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTopic = prompt("Rename note:", currentTopic);
    if (newTopic && newTopic.trim()) {
      try {
        await storageService.renameNote(id, newTopic.trim());
        setHistory(prev => prev.map(h => h.id === id ? { ...h, topic: newTopic.trim() } : h));
      } catch (err: any) {
        alert(`Failed to rename: ${err.message}`);
      }
    }
  };

  const loadFromHistory = (item: HistoryItem) => {
    setNoteData(prev => ({ ...prev, topic: item.topic }));
    setConfig(prev => ({ 
      ...prev, 
      mode: item.mode,
      provider: item.provider || AIProvider.GEMINI 
    }));
    setAppState(prev => ({ 
      ...prev, 
      generatedContent: item.content, 
      currentView: AppView.WORKSPACE
    }));
  };

  const handleSaveApiKey = (key: string, type: 'gemini' | 'groq' | 'sb_url' | 'sb_key') => {
    if (type === 'gemini') {
      localStorage.setItem('neuro_api_key', key);
      setConfig(prev => ({ ...prev, apiKey: key }));
    } else if (type === 'groq') {
      localStorage.setItem('neuro_groq_key', key);
      setConfig(prev => ({ ...prev, groqApiKey: key }));
    } else if (type === 'sb_url') {
      localStorage.setItem('neuro_sb_url', key);
      setConfig(prev => ({ ...prev, supabaseUrl: key }));
    } else if (type === 'sb_key') {
      localStorage.setItem('neuro_sb_key', key);
      setConfig(prev => ({ ...prev, supabaseKey: key }));
    }
  };

  const handleStorageSwitch = (type: StorageType) => {
    localStorage.setItem('neuro_storage_type', type);
    setConfig(prev => ({ ...prev, storageType: type }));
  };

  const handleGenerate = async () => {
    if (!noteData.topic.trim() || !noteData.structure.trim()) {
      setAppState(prev => ({ ...prev, error: "Topic and Structure are required." }));
      return;
    }

    setAppState(prev => ({
      ...prev,
      isLoading: true,
      generatedContent: null,
      error: null,
      progressStep: 'Initializing...',
    }));

    try {
      let content = '';

      if (config.provider === AIProvider.GEMINI) {
        content = await generateNoteContent(
          config,
          noteData.topic,
          noteData.structure,
          noteData.files,
          (step) => setAppState(prev => ({ ...prev, progressStep: step }))
        );
      } else {
        content = await generateNoteContentGroq(
          config,
          noteData.topic,
          noteData.structure,
          (step) => setAppState(prev => ({ ...prev, progressStep: step }))
        );
      }

      await saveToHistory(noteData.topic, content, config.mode);

      setAppState(prev => ({
        ...prev,
        isLoading: false,
        generatedContent: content,
        error: null,
        progressStep: 'Complete',
      }));
    } catch (err: any) {
      setAppState(prev => ({
        ...prev,
        isLoading: false,
        generatedContent: null,
        error: err.message || "An unexpected error occurred",
        progressStep: '',
      }));
    }
  };

  const handleSelectSyllabusTopic = (topic: string) => {
    setNoteData(prev => ({ ...prev, topic: topic }));
    setAppState(prev => ({ ...prev, currentView: AppView.WORKSPACE }));
  };

  const setView = (view: AppView) => {
    setAppState(prev => ({ ...prev, currentView: view }));
  };

  // Handler for Mode Switching that updates the structure
  const handleModeSwitch = (mode: NoteMode) => {
    setConfig(prev => ({ ...prev, mode }));
    // Automatically update structure to the mode default, unless user is in syllabus view
    if (appState.currentView === AppView.SYLLABUS) {
      setView(AppView.WORKSPACE);
    }
    setNoteData(prev => ({ ...prev, structure: MODE_STRUCTURES[mode] }));
  };

  const getModeIcon = (mode: NoteMode) => {
    switch (mode) {
      case NoteMode.CHEAT_CODES: return <Zap size={18} className="text-amber-400" />;
      case NoteMode.FIRST_PRINCIPLES: return <Microscope size={18} className="text-cyan-400" />;
      case NoteMode.FEYNMAN: return <Puzzle size={18} className="text-pink-400" />;
      case NoteMode.SOCRATIC: return <MessageCircleQuestion size={18} className="text-emerald-400" />;
      default: return <GraduationCap size={18} className="text-neuro-primary" />;
    }
  };

  const getModeLabel = (mode: NoteMode) => {
    switch (mode) {
      case NoteMode.CHEAT_CODES: return "Cheat Codes";
      case NoteMode.FIRST_PRINCIPLES: return "First Principles";
      case NoteMode.FEYNMAN: return "Feynman Method";
      case NoteMode.SOCRATIC: return "Socratic Method";
      default: return "Standard Clinical";
    }
  };

  const getModeDescription = (mode: NoteMode) => {
    switch (mode) {
      case NoteMode.CHEAT_CODES: return "Exam Mode. Mnemonics, tables & rapid fire facts.";
      case NoteMode.FIRST_PRINCIPLES: return "The 'Why'. Molecular mechanisms & causal chains.";
      case NoteMode.FEYNMAN: return "ELI5. Analogies & simple concepts for hard topics.";
      case NoteMode.SOCRATIC: return "Self-Test. Q&A loops to force active recall.";
      default: return "The Gold Standard. Complete reference for daily practice.";
    }
  };

  const switchProvider = (provider: AIProvider) => {
    let defaultModel = AppModel.GEMINI_2_5_FLASH;
    if (provider === AIProvider.GROQ) {
      defaultModel = AppModel.GROQ_LLAMA_3_3_70B;
    }
    setConfig(prev => ({ ...prev, provider, model: defaultModel }));
  };

  const getApiKeyStatus = () => {
    if (config.provider === AIProvider.GEMINI) return config.apiKey ? 'Ready' : 'Missing Key';
    return config.groqApiKey ? 'Ready' : 'Missing Key';
  };

  return (
    <div className="min-h-screen bg-neuro-bg text-neuro-text flex flex-col md:flex-row font-sans overflow-hidden selection:bg-neuro-primary/30 selection:text-white">
      
      {/* --- SIDEBAR: CONTROL CENTER --- */}
      <aside className="w-full md:w-[350px] glass-panel border-r-0 md:border-r border-b md:border-b-0 border-white/5 p-5 flex flex-col shrink-0 z-30 h-screen overflow-hidden shadow-2xl">
        
        {/* Header Logo */}
        <div className="flex items-center space-x-3 mb-8 shrink-0 select-none cursor-pointer" onClick={() => setView(AppView.WORKSPACE)}>
          <div className="w-10 h-10 bg-gradient-to-br from-neuro-primary to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-neuro-primary/20">
             <BrainCircuit className="text-white" size={22} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight leading-tight">NeuroNote</h1>
            <div className="flex items-center space-x-2">
               <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
               <span className="text-[10px] font-medium text-neuro-textMuted uppercase tracking-wider">System Online</span>
            </div>
          </div>
        </div>

        {/* Sidebar View Switcher Content */}
        {appState.currentView === AppView.SETTINGS ? (
          /* SETTINGS VIEW */
          <div className="flex-1 flex flex-col animate-fade-in overflow-hidden">
            <div className="flex items-center space-x-2 mb-4 text-neuro-primary pb-2 border-b border-white/5">
              <Settings2 size={16} />
              <h3 className="font-semibold text-xs uppercase tracking-wider">Configuration</h3>
            </div>
            
            <div className="flex bg-neuro-surface p-1 rounded-lg mb-4 shrink-0">
               {['gemini', 'groq', 'storage'].map((tab) => (
                 <button
                    key={tab}
                    onClick={() => setSettingsTab(tab as any)}
                    className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wide rounded-md transition-all ${settingsTab === tab ? 'bg-neuro-surfaceHighlight text-white shadow-sm' : 'text-neuro-textMuted hover:text-white'}`}
                 >
                   {tab}
                 </button>
               ))}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 px-1">
              {settingsTab === 'gemini' && (
                <div className="space-y-2">
                  <label className="text-xs text-neuro-textMuted font-medium">Gemini API Key</label>
                  <div className="relative group">
                    <input 
                      type="password"
                      value={config.apiKey}
                      onChange={(e) => handleSaveApiKey(e.target.value, 'gemini')}
                      className="w-full bg-neuro-bg/50 border border-white/10 text-white rounded-lg p-3 pl-3 pr-8 text-xs font-mono focus:border-neuro-primary focus:ring-1 focus:ring-neuro-primary outline-none transition-all"
                      placeholder="AIzaSy..."
                    />
                    <div className="absolute right-3 top-3 text-neuro-textMuted group-focus-within:text-neuro-primary transition-colors">
                      {config.apiKey ? <ShieldCheck size={14} className="text-green-400" /> : <Key size={14} />}
                    </div>
                  </div>
                  <p className="text-[10px] text-neuro-textMuted">Get your key at <a href="https://aistudio.google.com" target="_blank" className="text-neuro-primary hover:underline">Google AI Studio</a></p>
                </div>
              )}
              {settingsTab === 'groq' && (
                <div className="space-y-2">
                  <label className="text-xs text-neuro-textMuted font-medium">Groq API Key</label>
                  <div className="relative group">
                    <input 
                      type="password"
                      value={config.groqApiKey}
                      onChange={(e) => handleSaveApiKey(e.target.value, 'groq')}
                      className="w-full bg-neuro-bg/50 border border-white/10 text-white rounded-lg p-3 pl-3 pr-8 text-xs font-mono focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-all"
                      placeholder="gsk_..."
                    />
                     <div className="absolute right-3 top-3 text-neuro-textMuted group-focus-within:text-orange-500 transition-colors">
                      {config.groqApiKey ? <ShieldCheck size={14} className="text-green-400" /> : <Key size={14} />}
                    </div>
                  </div>
                </div>
              )}
              {settingsTab === 'storage' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                     <button onClick={() => handleStorageSwitch(StorageType.LOCAL)} className={`p-4 rounded-xl border transition-all flex flex-col items-center justify-center space-y-2 ${config.storageType === StorageType.LOCAL ? 'bg-neuro-primary/10 border-neuro-primary text-neuro-primary' : 'bg-neuro-bg/30 border-white/5 text-neuro-textMuted hover:bg-neuro-bg/50'}`}>
                        <HardDrive size={20} />
                        <span className="text-xs font-bold">Local</span>
                     </button>
                     <button onClick={() => handleStorageSwitch(StorageType.SUPABASE)} className={`p-4 rounded-xl border transition-all flex flex-col items-center justify-center space-y-2 ${config.storageType === StorageType.SUPABASE ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' : 'bg-neuro-bg/30 border-white/5 text-neuro-textMuted hover:bg-neuro-bg/50'}`}>
                        <Cloud size={20} />
                        <span className="text-xs font-bold">Supabase</span>
                     </button>
                  </div>
                  {config.storageType === StorageType.SUPABASE && (
                    <div className="space-y-3 pt-2 animate-slide-up">
                      <input type="text" value={config.supabaseUrl} onChange={(e) => handleSaveApiKey(e.target.value, 'sb_url')} placeholder="Project URL" className="w-full bg-neuro-bg/50 border border-white/10 rounded-lg p-2 text-xs text-white focus:border-emerald-500 outline-none" />
                      <input type="password" value={config.supabaseKey} onChange={(e) => handleSaveApiKey(e.target.value, 'sb_key')} placeholder="Anon Key" className="w-full bg-neuro-bg/50 border border-white/10 rounded-lg p-2 text-xs text-white focus:border-emerald-500 outline-none" />
                    </div>
                  )}
                </div>
              )}
            </div>
            <button onClick={() => setView(AppView.WORKSPACE)} className="mt-4 w-full py-2.5 bg-neuro-surfaceHighlight hover:bg-neuro-surface text-white text-xs font-medium rounded-lg transition-colors">Back to Workspace</button>
          </div>

        ) : appState.currentView === AppView.HISTORY ? (
          /* HISTORY VIEW */
          <div className="flex-1 flex flex-col animate-fade-in overflow-hidden">
             <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5 text-neuro-primary">
               <div className="flex items-center space-x-2">
                 <History size={16} />
                 <h3 className="font-semibold text-xs uppercase tracking-wider">Saved Notes</h3>
               </div>
               <span className="text-[10px] bg-neuro-surfaceHighlight px-1.5 py-0.5 rounded text-neuro-textMuted">{history.length}</span>
             </div>
             
             <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
               {history.map(item => (
                 <div key={item.id} onClick={() => loadFromHistory(item)} className="group p-3 rounded-lg bg-neuro-surface/40 hover:bg-neuro-surface border border-transparent hover:border-white/10 cursor-pointer transition-all">
                   <div className="flex justify-between items-start mb-1.5">
                     <h4 className="text-sm font-medium text-gray-200 truncate pr-2 w-40">{item.topic || "Untitled"}</h4>
                     <div className="flex items-center opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={(e) => renameHistoryItem(item.id, item.topic, e)} className="text-neuro-textMuted hover:text-white mr-2"><Edit2 size={13} /></button>
                        <button onClick={(e) => deleteHistoryItem(item.id, e)} className="text-neuro-textMuted hover:text-red-400"><Trash2 size={13} /></button>
                     </div>
                   </div>
                   <div className="flex items-center space-x-2 text-[10px] text-neuro-textMuted">
                     <span className="capitalize">{item.mode.replace('_', ' ')}</span>
                     <span className="w-0.5 h-0.5 bg-gray-500 rounded-full"></span>
                     <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                   </div>
                 </div>
               ))}
               {history.length === 0 && <div className="text-center text-xs text-neuro-textMuted py-10">No history yet.</div>}
             </div>
             <button onClick={() => setView(AppView.WORKSPACE)} className="mt-4 w-full py-2.5 bg-neuro-surfaceHighlight hover:bg-neuro-surface text-white text-xs font-medium rounded-lg transition-colors">Back to Workspace</button>
          </div>

        ) : (
          /* MAIN CONTROLS VIEW */
          <div className="flex-1 flex flex-col space-y-6 overflow-y-auto custom-scrollbar pr-1">
            
            {/* Mode Selection */}
            <div className="space-y-4">
              <label className="text-xs font-bold text-neuro-textMuted uppercase tracking-wider flex items-center space-x-1">
                <Layout size={12} /> <span>Cognitive Framework</span>
              </label>
              <div className="flex flex-col gap-2">
                {Object.values(NoteMode).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => handleModeSwitch(mode)}
                    className={`w-full text-left p-3 rounded-xl border transition-all duration-300 relative group overflow-hidden ${
                      config.mode === mode && appState.currentView !== AppView.SYLLABUS
                        ? 'bg-neuro-primary/10 border-neuro-primary shadow-[0_0_15px_rgba(129,140,248,0.1)]' 
                        : 'bg-white/5 border-transparent hover:bg-white/10 hover:border-white/10'
                    }`}
                  >
                    <div className="flex items-start">
                      <div className={`mt-0.5 mr-3 shrink-0 p-2 rounded-lg ${config.mode === mode ? 'bg-neuro-primary text-white' : 'bg-gray-800 text-gray-500'}`}>
                        {getModeIcon(mode)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs font-bold mb-1 flex items-center ${config.mode === mode ? 'text-white' : 'text-gray-300'}`}>
                           {getModeLabel(mode)}
                        </div>
                        <p className={`text-[10px] leading-relaxed line-clamp-2 ${config.mode === mode ? 'text-gray-300' : 'text-gray-500 group-hover:text-gray-400'}`}>
                           {getModeDescription(mode)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Experimental Features Section */}
             <div className="space-y-4 pt-4 border-t border-white/5">
              <label className="text-xs font-bold text-neuro-textMuted uppercase tracking-wider flex items-center space-x-1">
                <FlaskConical size={12} className="text-neuro-accent" /> <span>NeuroLab (Experimental)</span>
              </label>
              <button
                onClick={() => setView(AppView.SYLLABUS)}
                className={`w-full text-left p-3 rounded-xl border transition-all duration-300 relative group overflow-hidden ${
                  appState.currentView === AppView.SYLLABUS
                    ? 'bg-neuro-accent/10 border-neuro-accent shadow-[0_0_15px_rgba(56,189,248,0.1)]' 
                    : 'bg-white/5 border-transparent hover:bg-white/10 hover:border-white/10'
                }`}
              >
                 <div className="flex items-start">
                    <div className="mt-0.5 mr-3 shrink-0 p-2 rounded-lg bg-gray-800 text-neuro-accent">
                      <ListChecks size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold mb-1 flex items-center text-gray-200">
                         Curriculum Auto-Queue
                      </div>
                      <p className="text-[10px] leading-relaxed text-gray-500 group-hover:text-gray-400">
                         Parse syllabus PDF into a sequential study queue.
                      </p>
                    </div>
                  </div>
              </button>
            </div>


            {/* Model Engine */}
            <div className="space-y-3 pt-4 border-t border-white/5">
              <label className="text-xs font-bold text-neuro-textMuted uppercase tracking-wider flex items-center space-x-1">
                <Cpu size={12} /> <span>AI Engine</span>
              </label>
              
              <div className="flex bg-neuro-surface p-0.5 rounded-lg">
                <button onClick={() => switchProvider(AIProvider.GEMINI)} className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all ${config.provider === AIProvider.GEMINI ? 'bg-neuro-primary text-white shadow-sm' : 'text-neuro-textMuted'}`}>Gemini</button>
                <button onClick={() => switchProvider(AIProvider.GROQ)} className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all ${config.provider === AIProvider.GROQ ? 'bg-orange-600 text-white shadow-sm' : 'text-neuro-textMuted'}`}>Groq</button>
              </div>

              <div className="relative">
                <select 
                  value={config.model}
                  onChange={(e) => setConfig({ ...config, model: e.target.value as AppModel })}
                  className="w-full bg-neuro-surface/50 border border-white/10 text-white rounded-lg p-2.5 text-xs outline-none focus:border-neuro-primary appearance-none hover:bg-neuro-surface transition-colors"
                >
                  {config.provider === AIProvider.GEMINI ? (
                    <>
                      <option value={AppModel.GEMINI_2_5_FLASH}>Gemini 2.5 Flash</option>
                      <option value={AppModel.GEMINI_2_5_PRO}>Gemini 2.5 Pro</option>
                      <option value={AppModel.GEMINI_3_FLASH}>Gemini 3 Flash (Preview)</option>
                    </>
                  ) : (
                    <>
                      <option value={AppModel.GROQ_LLAMA_3_3_70B}>Llama 3.3 70B</option>
                      <option value={AppModel.GROQ_LLAMA_3_1_8B}>Llama 3.1 8B</option>
                    </>
                  )}
                </select>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="mt-auto pt-6 border-t border-white/5 grid grid-cols-2 gap-2">
               <button onClick={() => setView(AppView.HISTORY)} className="flex items-center justify-center space-x-2 p-2 rounded-lg hover:bg-white/5 text-neuro-textMuted hover:text-white transition-colors">
                  <Database size={16} /> <span className="text-xs font-medium">History</span>
               </button>
               <button onClick={() => setView(AppView.SETTINGS)} className="flex items-center justify-center space-x-2 p-2 rounded-lg hover:bg-white/5 text-neuro-textMuted hover:text-white transition-colors">
                  <Settings2 size={16} /> <span className="text-xs font-medium">Settings</span>
               </button>
            </div>
          </div>
        )}
      </aside>

      {/* --- MAIN CONTENT AREA --- */}
      <main className="flex-1 relative h-screen overflow-hidden flex flex-col bg-neuro-bg">
        
        {/* Background Gradients */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[-10%] left-[20%] w-[500px] h-[500px] bg-neuro-primary/5 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[-10%] right-[10%] w-[400px] h-[400px] bg-neuro-accent/5 rounded-full blur-[100px]"></div>
        </div>

        {/* Content Container */}
        <div className="relative z-10 flex-1 flex flex-col h-full overflow-y-auto custom-scrollbar p-6 md:p-10">
          
          {/* Top Bar Status */}
          <div className="flex justify-between items-center mb-8">
            <div>
               <h2 className="text-2xl font-bold text-white tracking-tight">
                  {appState.currentView === AppView.SYLLABUS ? 'NeuroLab' : 'Workspace'}
               </h2>
               <p className="text-neuro-textMuted text-sm">
                 {appState.generatedContent ? 'Reviewing Output' : appState.currentView === AppView.SYLLABUS ? 'Experimental Curriculum Parser' : 'New Note Generation'}
               </p>
            </div>
            {!appState.generatedContent && (
               <div className="flex items-center space-x-3 text-xs bg-neuro-surface/50 border border-white/5 px-3 py-1.5 rounded-full backdrop-blur-sm">
                 <div className={`flex items-center space-x-1.5 ${config.apiKey || config.groqApiKey ? 'text-emerald-400' : 'text-red-400'}`}>
                    <Activity size={12} />
                    <span>API {getApiKeyStatus()}</span>
                 </div>
                 <span className="w-px h-3 bg-white/10"></span>
                 <div className="text-neuro-textMuted">
                    {config.storageType === StorageType.LOCAL ? 'Local Save' : 'Cloud Sync'}
                 </div>
               </div>
            )}
             {appState.generatedContent && (
               <button 
                onClick={() => setAppState(prev => ({ ...prev, generatedContent: null }))}
                className="flex items-center space-x-2 px-4 py-2 bg-neuro-surface hover:bg-neuro-surfaceHighlight border border-white/5 rounded-lg text-sm text-white transition-all shadow-lg"
               >
                <X size={14} />
                <span>Close Editor</span>
               </button>
            )}
          </div>

          {appState.error && (
            <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-200 p-4 rounded-xl flex items-start space-x-3 animate-fade-in">
               <AlertCircle className="shrink-0 mt-0.5" size={18} />
               <div>
                 <h4 className="font-bold text-sm">System Alert</h4>
                 <p className="text-xs opacity-80 mt-1 leading-relaxed">{appState.error}</p>
               </div>
            </div>
          )}

          {appState.isLoading ? (
             <div className="flex flex-col items-center justify-center flex-1 space-y-8 animate-fade-in pb-20">
               <div className="relative">
                 <div className="w-24 h-24 border-4 border-neuro-surface rounded-full"></div>
                 <div className="w-24 h-24 border-4 border-neuro-primary border-t-transparent border-r-transparent rounded-full absolute top-0 animate-spin"></div>
                 <div className="absolute inset-0 flex items-center justify-center animate-pulse">
                    <BrainCircuit size={32} className="text-white opacity-50" />
                 </div>
               </div>
               <div className="text-center space-y-2">
                 <h3 className="text-xl font-medium text-white tracking-tight">Synthesizing Logic</h3>
                 <p className="text-neuro-textMuted text-sm font-mono">{appState.progressStep}</p>
               </div>
             </div>
          ) : appState.generatedContent ? (
             <div className="flex-1 animate-slide-up">
                <OutputDisplay content={appState.generatedContent} topic={noteData.topic} />
             </div>
          ) : appState.currentView === AppView.SYLLABUS ? (
             /* SYLLABUS MANAGER VIEW */
             <SyllabusFlow config={config} onSelectTopic={handleSelectSyllabusTopic} />
          ) : (
            /* --- INPUT FORM --- */
            <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fade-in pb-10">
               
               {/* Left: Context Input (4 cols) */}
               <div className="lg:col-span-5 space-y-6">
                 {/* Card 1: Topic */}
                 <div className="bg-neuro-surface border border-neuro-surfaceHighlight p-6 rounded-2xl shadow-lg">
                   <div className="flex items-center space-x-2 text-neuro-primary mb-2">
                      <Layers size={20} />
                      <h3 className="font-bold text-base text-white">Subject & Context</h3>
                   </div>
                   <p className="text-xs text-neuro-textMuted mb-5 leading-relaxed">
                     Define the core subject matter. This serves as the anchor for the entire note generation process.
                   </p>
                   
                   <div className="space-y-5">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Primary Topic</label>
                        <input 
                          type="text"
                          value={noteData.topic}
                          onChange={(e) => setNoteData({ ...noteData, topic: e.target.value })}
                          placeholder="e.g. Heart Failure, Krebs Cycle, Dermatopathology..."
                          className="w-full bg-gray-950/50 border border-gray-700 rounded-xl p-4 text-sm text-white focus:border-neuro-primary focus:ring-1 focus:ring-neuro-primary outline-none transition-all placeholder:text-gray-600"
                        />
                        <p className="text-[10px] text-gray-500">
                          *Be specific (e.g., instead of "Heart", use "Congestive Heart Failure Pathophysiology").
                        </p>
                      </div>

                      <div className={`space-y-2 pt-4 border-t border-gray-700/50 ${config.provider === AIProvider.GROQ ? 'opacity-50 pointer-events-none' : ''}`}>
                         <div className="flex justify-between items-center">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Reference Materials</label>
                            {config.provider === AIProvider.GROQ && <span className="text-orange-400 text-[10px] font-bold border border-orange-400/30 px-2 py-0.5 rounded">Text Only Mode</span>}
                         </div>
                         <FileUploader files={noteData.files} onFilesChange={(files) => setNoteData({ ...noteData, files })} />
                         <p className="text-[10px] text-gray-500 leading-normal">
                           Upload PDF lectures or images. The AI will prioritize this content over general knowledge.
                         </p>
                      </div>
                   </div>
                 </div>
               </div>

               {/* Right: Structure & Action (8 cols) */}
               <div className="lg:col-span-7 flex flex-col gap-6">
                 <div className="bg-neuro-surface border border-neuro-surfaceHighlight p-6 rounded-2xl shadow-lg flex-1 flex flex-col min-h-[600px]">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2 text-neuro-primary">
                        <BookOpen size={20} />
                        <h3 className="font-bold text-base text-white">Target Structure</h3>
                      </div>
                      <span className="text-[10px] uppercase font-bold text-neuro-textMuted bg-gray-950/50 border border-gray-700 px-3 py-1 rounded-full">
                        Active Mode: {getModeLabel(config.mode)}
                      </span>
                    </div>
                    
                    <p className="text-xs text-neuro-textMuted mb-5 leading-relaxed">
                      This outline dictates the flow of the note. The AI will fill in each section exhaustively. You can edit this skeleton to fit your specific syllabus.
                    </p>

                    <div className="relative flex-1">
                      <textarea 
                        value={noteData.structure}
                        onChange={(e) => setNoteData({ ...noteData, structure: e.target.value })}
                        className="absolute inset-0 w-full h-full bg-gray-950/50 border border-gray-700 rounded-xl p-5 text-sm font-mono text-neuro-text placeholder:text-gray-700 focus:border-neuro-primary focus:ring-1 focus:ring-neuro-primary outline-none resize-none transition-all leading-7"
                        placeholder="Define your note skeleton here..."
                      />
                    </div>
                 </div>

                 <button 
                  onClick={handleGenerate}
                  disabled={config.provider === AIProvider.GEMINI ? !config.apiKey : !config.groqApiKey}
                  className={`w-full py-5 rounded-xl font-bold text-white shadow-xl transition-all transform hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center space-x-3 border border-white/10
                    ${(config.provider === AIProvider.GEMINI ? !config.apiKey : !config.groqApiKey) 
                      ? 'bg-gray-800 cursor-not-allowed opacity-50 text-gray-400' 
                      : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-indigo-500/20'
                    }`}
                 >
                   <Sparkles size={22} className={!(config.provider === AIProvider.GEMINI ? !config.apiKey : !config.groqApiKey) ? 'animate-pulse' : ''} />
                   <span className="tracking-wide text-lg">GENERATE MEDICAL NOTE</span>
                 </button>
               </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default App;