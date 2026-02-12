
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Upload, FileText, CheckCircle, Circle, Play, RefreshCw, Trash2, ListChecks, ArrowRight, FolderOpen, Save, Type, Edit2, Archive, Zap, PauseCircle, StopCircle, Layout, AlertCircle, CheckCircle2, Loader2, BookOpen, Settings2, Eye, ShieldAlert, GripVertical, ChevronDown, ChevronUp, Split, Cpu, Sparkles } from 'lucide-react';
import { SyllabusItem, UploadedFile, GenerationConfig, SavedQueue, AIProvider, AppModel } from '../types';
import FileUploader from './FileUploader';
import { parseSyllabusToTopics, parseSyllabusFromText } from '../services/geminiService';
import { parseSyllabusFromTextGroq } from '../services/groqService';
import { StorageService } from '../services/storageService';
import { QueueService } from '../services/queueService';

interface SyllabusFlowProps {
  config: GenerationConfig;
  onSelectTopic: (topic: string) => void;
}

// Redefine locally to avoid circular deps or prop drilling if App.tsx doesn't export them
// Ideally these come from a shared constants file, but for now we duplicate small arrays for the UI dropdown.
const GEMINI_MODELS = [
  { value: AppModel.GEMINI_3_PRO, label: 'Gemini 3.0 Pro' },
  { value: AppModel.GEMINI_3_FLASH, label: 'Gemini 3.0 Flash' },
  { value: AppModel.GEMINI_2_5_FLASH, label: 'Gemini 2.5 Flash' },
];

const GROQ_MODELS = [
  { value: AppModel.GROQ_LLAMA_3_3_70B, label: 'Llama 3.3 70B' },
  { value: AppModel.GROQ_LLAMA_3_1_8B, label: 'Llama 3.1 8B (Fast)' },
  { value: AppModel.GROQ_MIXTRAL_8X7B, label: 'Mixtral 8x7B' },
];

type TabMode = 'upload' | 'text' | 'library';

const SyllabusFlow: React.FC<SyllabusFlowProps> = ({ config, onSelectTopic }) => {
  const [syllabusFile, setSyllabusFile] = useState<UploadedFile[]>([]);
  const [rawText, setRawText] = useState('');
  
  // Queue state
  const [queue, setQueue] = useState<SyllabusItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [circuitStatus, setCircuitStatus] = useState<string | null>(null);
  
  const [queueName, setQueueName] = useState('My Curriculum');
  const [queueId, setQueueId] = useState<string | null>(null);
  
  // UX State
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabMode>('library');
  const [autoApprove, setAutoApprove] = useState(true); 
  
  // Advanced Config State (Dual Engine)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [batchConfig, setBatchConfig] = useState<{
      structureProvider: AIProvider | null;
      structureModel: string;
      customStructurePrompt: string;
      customContentPrompt: string;
  }>({
      structureProvider: null, // null means use main provider
      structureModel: '',
      customStructurePrompt: '',
      customContentPrompt: ''
  });

  // Drag State
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  
  // Review Modal State
  const [viewingItem, setViewingItem] = useState<SyllabusItem | null>(null);
  const [editedStructure, setEditedStructure] = useState('');

  const [savedQueues, setSavedQueues] = useState<SavedQueue[]>([]);
  const [storageService] = useState(StorageService.getInstance());
  const [queueService] = useState(QueueService.getInstance());

  // --- INIT & SUBSCRIPTION ---
  useEffect(() => {
    const savedMeta = localStorage.getItem('neuro_syllabus_meta');
    if (savedMeta) {
      const meta = JSON.parse(savedMeta);
      setQueueName(meta.name);
      setQueueId(meta.id);
    }
    
    const savedQueue = localStorage.getItem('neuro_syllabus_queue');
    if (savedQueue) {
       const parsed = JSON.parse(savedQueue);
       setQueue(parsed);
       queueService.setQueue(parsed);
    }

    loadLibrary();

    const unsubscribe = queueService.subscribe((updatedQueue, processing, cStatus) => {
       setQueue(updatedQueue);
       setIsProcessing(processing);
       setCircuitStatus(cStatus || null);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    localStorage.setItem('neuro_syllabus_meta', JSON.stringify({ id: queueId, name: queueName }));
  }, [queueName, queueId]);

  const loadLibrary = async () => {
    const queues = await storageService.getQueues();
    setSavedQueues(queues);
    const savedQueue = localStorage.getItem('neuro_syllabus_queue');
    if (queues.length === 0 && (!savedQueue || JSON.parse(savedQueue).length === 0)) {
        setActiveTab('upload');
    }
  };

  // --- PARSING ---
  const handleParse = async () => {
    setError(null);
    setIsParsing(true);
    
    try {
      let topics: SyllabusItem[] = [];
      const currentProvider = config.provider;

      if (activeTab === 'upload') {
        if (syllabusFile.length === 0) throw new Error("Please upload a file.");
        
        if (currentProvider === AIProvider.GEMINI) {
            topics = await parseSyllabusToTopics(config, syllabusFile[0]);
        } else if (currentProvider === AIProvider.GROQ) {
            const file = syllabusFile[0];
            if (file.mimeType.includes('text') || file.name.match(/\.(md|txt|json)$/i)) {
                const decoded = atob(file.data);
                topics = await parseSyllabusFromTextGroq(config, decoded);
            } else {
                throw new Error("Groq currently supports text-based files (.txt, .md, .json) for syllabus parsing. For PDF/Images, please switch Neural Engine to Gemini.");
            }
        }
        setSyllabusFile([]);

      } else if (activeTab === 'text') {
        if (!rawText.trim()) throw new Error("Please enter syllabus text.");
        if (currentProvider === AIProvider.GEMINI) {
            topics = await parseSyllabusFromText(config, rawText);
        } else {
            topics = await parseSyllabusFromTextGroq(config, rawText);
        }
        setRawText('');
      }

      setQueue(topics);
      queueService.setQueue(topics);
      setQueueId(Date.now().toString());
      setQueueName("New Curriculum");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsParsing(false);
    }
  };

  // --- DRAG AND DROP HANDLERS ---
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedItemIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault(); 
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedItemIndex === null || draggedItemIndex === dropIndex) return;

    const newQueue = [...queue];
    const [movedItem] = newQueue.splice(draggedItemIndex, 1);
    newQueue.splice(dropIndex, 0, movedItem);

    setQueue(newQueue);
    queueService.setQueue(newQueue); 
    setDraggedItemIndex(null);
  };

  // --- BATCH GENERATION CONTROLS ---
  const handleStartBatch = () => {
     // MERGE GLOBAL CONFIG WITH BATCH CONFIG
     const runConfig: GenerationConfig = { 
         ...config, 
         autoApprove,
         // Inject Advanced Options if set
         structureProvider: batchConfig.structureProvider || undefined,
         structureModel: batchConfig.structureModel || undefined,
         customStructurePrompt: batchConfig.customStructurePrompt || undefined,
         customContentPrompt: batchConfig.customContentPrompt || undefined
     };

     if (circuitStatus && circuitStatus.includes("CIRCUIT")) {
         queueService.resetCircuit();
     }
     queueService.startProcessing(runConfig);
  };

  const handleStopBatch = () => {
     queueService.stop();
  };

  // --- REVIEW MODAL HANDLERS ---
  const openReview = (item: SyllabusItem) => {
      setViewingItem(item);
      setEditedStructure(item.structure || "# Generating Structure...");
  };

  const handleApprove = () => {
      if (viewingItem) {
          queueService.updateItemStructure(viewingItem.id, editedStructure);
          setViewingItem(null);
      }
  };

  // --- LIBRARY ACTIONS ---
  const handleSaveToLibrary = async () => {
    if (queue.length === 0) return;
    const idToSave = queueId || Date.now().toString();
    const newQueue: SavedQueue = {
      id: idToSave,
      name: queueName,
      items: queue,
      timestamp: Date.now()
    };
    await storageService.saveQueue(newQueue);
    setQueueId(idToSave);
    await loadLibrary();
    alert("Curriculum saved to Library!");
  };

  const handleLoadFromLibrary = (saved: SavedQueue) => {
    if (isProcessing) return alert("Please stop processing before loading a new queue.");
    if (queue.length > 0 && confirm("Overwrite active queue?") === false) return;
    
    setQueue(saved.items);
    queueService.setQueue(saved.items);
    setQueueName(saved.name);
    setQueueId(saved.id);
    setActiveTab('upload');
  };

  const handleDeleteFromLibrary = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Delete this curriculum?")) {
      await storageService.deleteQueue(id);
      await loadLibrary();
    }
  };

  const handleClearActive = () => {
    if (isProcessing) return alert("Stop processing first.");
    if (confirm("Clear active workspace?")) {
      setQueue([]);
      queueService.setQueue([]);
      setQueueId(null);
      setQueueName('My Curriculum');
      localStorage.removeItem('neuro_syllabus_queue');
      localStorage.removeItem('neuro_syllabus_meta');
      // Reset batch config
      setBatchConfig({
          structureProvider: null,
          structureModel: '',
          customStructurePrompt: '',
          customContentPrompt: ''
      });
    }
  };

  // --- HELPERS ---
  const completedCount = queue.filter(q => q.status === 'done').length;
  const phase1Count = queue.filter(q => ['struct_ready', 'generating_note', 'done', 'paused_for_review'].includes(q.status)).length;
  const phase1Progress = queue.length > 0 ? (phase1Count / queue.length) * 100 : 0;
  const phase2Count = queue.filter(q => q.status === 'done').length;
  const phase2Progress = queue.length > 0 ? (phase2Count / queue.length) * 100 : 0;

  const getStatusIcon = (item: SyllabusItem) => {
      if (item.retryCount && item.retryCount > 0 && item.status !== 'done') {
          return <AlertCircle size={14} className="text-amber-500 animate-pulse" />;
      }
      switch(item.status) {
          case 'pending': return <Circle size={14} className="text-gray-600" />;
          case 'drafting_struct': return <Loader2 size={14} className="text-blue-400 animate-spin" />;
          case 'struct_ready': return <CheckCircle2 size={14} className="text-blue-500" />; 
          case 'paused_for_review': return <Eye size={14} className="text-amber-400 animate-pulse" />;
          case 'generating_note': return <RefreshCw size={14} className="text-purple-400 animate-spin" />;
          case 'done': return <CheckCircle2 size={14} className="text-green-500" />;
          case 'error': return <ShieldAlert size={14} className="text-red-500" />;
          default: return <Circle size={14} />;
      }
  };

  return (
    <div className="max-w-4xl mx-auto h-full flex flex-col animate-fade-in p-6 relative">
      
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <ListChecks className="text-neuro-accent" />
            Autonomous Curriculum Engine
          </h2>
          <p className="text-neuro-textMuted text-sm mt-1">
            Batch Processor with Circuit Breaker & Human-in-the-Loop Review.
          </p>
          <div className="text-[10px] text-gray-500 mt-1 font-mono uppercase">
             ACTIVE ENGINE: <span className="text-neuro-primary font-bold">{config.provider.toUpperCase()}</span> ({config.model})
          </div>
        </div>
        
        {/* View Switcher */}
        <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-700">
           <button onClick={() => setActiveTab('library')} className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${activeTab === 'library' ? 'bg-neuro-surfaceHighlight text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}>
             <FolderOpen size={14} /> Library
           </button>
           <button onClick={() => setActiveTab('upload')} className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${(activeTab === 'upload' || activeTab === 'text') && queue.length === 0 ? 'bg-neuro-surfaceHighlight text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}>
             <RefreshCw size={14} /> Generator
           </button>
        </div>
      </div>

      {/* --- LIBRARY VIEW --- */}
      {activeTab === 'library' && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto custom-scrollbar pr-2 pb-20">
             <div onClick={() => { if(!isProcessing) { setQueue([]); setQueueId(null); setQueueName("New Curriculum"); setActiveTab('upload'); } else alert("Processing active."); }}
               className="border-2 border-dashed border-gray-700 bg-gray-900/20 hover:bg-gray-800 hover:border-neuro-primary rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all min-h-[150px] group"
             >
                <div className="bg-gray-800 p-3 rounded-full mb-3 group-hover:bg-neuro-primary group-hover:text-white transition-colors text-gray-400"><RefreshCw size={24} /></div>
                <span className="font-bold text-gray-300 group-hover:text-white">Create New Curriculum</span>
             </div>
             {savedQueues.map(saved => (
               <div key={saved.id} className="relative bg-neuro-surface border border-gray-800 hover:border-gray-600 rounded-xl p-5 transition-all group">
                  <div className="flex justify-between items-start mb-3">
                     <div className="flex items-center gap-2">
                        <FolderOpen className="text-neuro-accent" size={18} />
                        <h3 className="font-bold text-white truncate max-w-[150px]">{saved.name}</h3>
                     </div>
                     <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => handleDeleteFromLibrary(saved.id, e)} className="p-1.5 hover:bg-red-900/50 rounded text-gray-400 hover:text-red-400"><Trash2 size={14} /></button>
                     </div>
                  </div>
                  <div className="text-xs text-gray-500 mb-4 space-y-1">
                     <p>{saved.items.length} Topics</p>
                     <p>Status: {saved.items.filter(i => i.status === 'done').length}/{saved.items.length} Complete</p>
                  </div>
                  <button onClick={() => handleLoadFromLibrary(saved)} className="w-full py-2 bg-gray-800 hover:bg-neuro-surfaceHighlight text-xs font-bold text-white rounded-lg transition-colors border border-gray-700">Load Workspace</button>
               </div>
             ))}
          </div>
        </div>
      )}

      {/* --- GENERATOR / ACTIVE VIEW --- */}
      {(activeTab === 'upload' || activeTab === 'text') && (
        <>
          {queue.length > 0 && (
             <div className="bg-neuro-surface border border-gray-800 p-4 rounded-xl mb-4 flex flex-col gap-4 shrink-0 shadow-lg">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-neuro-primary/20 p-2 rounded-lg text-neuro-primary"><Archive size={18} /></div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-white text-sm">{queueName}</h3>
                                <button onClick={() => { const n = prompt("Rename:", queueName); if(n) setQueueName(n); }} className="text-gray-500 hover:text-white"><Edit2 size={12} /></button>
                            </div>
                            <p className="text-[10px] text-gray-500">{queue.length} Topics Loaded</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        {/* Auto Approve Toggle */}
                        {!isProcessing && (
                            <div className="flex items-center gap-2 bg-gray-900 p-1.5 rounded-lg border border-gray-700">
                                <span className={`text-[10px] font-bold ${autoApprove ? 'text-gray-500' : 'text-amber-400'}`}>REVIEW</span>
                                <div 
                                    onClick={() => setAutoApprove(!autoApprove)}
                                    className={`w-8 h-4 rounded-full cursor-pointer relative transition-colors ${autoApprove ? 'bg-neuro-primary' : 'bg-gray-600'}`}
                                >
                                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all shadow ${autoApprove ? 'left-4.5' : 'left-0.5'}`} style={{left: autoApprove ? '18px' : '2px'}}></div>
                                </div>
                                <span className={`text-[10px] font-bold ${autoApprove ? 'text-green-400' : 'text-gray-500'}`}>AUTO</span>
                            </div>
                        )}

                        {/* START / STOP */}
                        {!isProcessing ? (
                            <button 
                                onClick={handleStartBatch}
                                disabled={completedCount === queue.length}
                                className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-colors shadow-lg
                                ${completedCount === queue.length ? 'bg-gray-800 text-gray-500' : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white'}`}
                            >
                                <Zap size={14} fill="currentColor" /> {circuitStatus?.includes("BREAKER") ? "RESET & RETRY" : "START BATCH"}
                            </button>
                        ) : (
                            <button onClick={handleStopBatch} className="flex items-center gap-2 px-4 py-2 bg-red-900/80 hover:bg-red-800 text-white text-xs font-bold rounded-lg transition-colors shadow-lg animate-pulse">
                                <StopCircle size={14} /> STOP
                            </button>
                        )}

                        <div className="flex gap-1">
                            <button onClick={handleSaveToLibrary} className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg"><Save size={16} /></button>
                            <button onClick={handleClearActive} className="p-2 bg-gray-800 hover:bg-red-900/30 text-gray-400 hover:text-red-400 rounded-lg"><Trash2 size={16} /></button>
                        </div>
                    </div>
                </div>

                {/* --- ADVANCED BATCH CONFIGURATION --- */}
                {!isProcessing && (
                  <div className="border border-gray-800 rounded-xl bg-gray-900/30 overflow-hidden">
                     <button 
                       onClick={() => setShowAdvanced(!showAdvanced)} 
                       className="w-full flex items-center justify-between p-3 text-xs font-bold text-gray-400 hover:bg-gray-800/50 hover:text-white transition-colors"
                     >
                       <span className="flex items-center gap-2"><Settings2 size={14}/> Advanced Circuit Configuration (Dual-Engine)</span>
                       {showAdvanced ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                     </button>
                     
                     {showAdvanced && (
                       <div className="p-4 bg-black/20 grid grid-cols-1 md:grid-cols-2 gap-6 animate-slide-up border-t border-gray-800">
                          
                          {/* Left: Architect (Phase 1) */}
                          <div className="space-y-3">
                             <div className="flex items-center gap-2 text-neuro-accent font-bold text-[10px] uppercase tracking-widest mb-1">
                                <Split size={12}/> Phase 1: Structure Architect
                             </div>
                             
                             <div className="p-3 bg-gray-800/40 rounded-lg border border-gray-700/50 space-y-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] text-gray-500 font-bold">Provider Override</label>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => setBatchConfig({...batchConfig, structureProvider: null})}
                                            className={`flex-1 py-1.5 text-[10px] font-bold rounded border transition-colors ${batchConfig.structureProvider === null ? 'bg-neuro-primary/20 border-neuro-primary text-white' : 'bg-gray-900 border-gray-700 text-gray-500'}`}
                                        >
                                            Same as Main
                                        </button>
                                        <button 
                                            onClick={() => setBatchConfig({...batchConfig, structureProvider: AIProvider.GEMINI, structureModel: AppModel.GEMINI_3_FLASH})}
                                            className={`flex-1 py-1.5 text-[10px] font-bold rounded border transition-colors ${batchConfig.structureProvider === AIProvider.GEMINI ? 'bg-indigo-900/40 border-indigo-500 text-indigo-200' : 'bg-gray-900 border-gray-700 text-gray-500'}`}
                                        >
                                            Gemini
                                        </button>
                                        <button 
                                            onClick={() => setBatchConfig({...batchConfig, structureProvider: AIProvider.GROQ, structureModel: AppModel.GROQ_LLAMA_3_1_8B})}
                                            className={`flex-1 py-1.5 text-[10px] font-bold rounded border transition-colors ${batchConfig.structureProvider === AIProvider.GROQ ? 'bg-orange-900/40 border-orange-500 text-orange-200' : 'bg-gray-900 border-gray-700 text-gray-500'}`}
                                        >
                                            Groq
                                        </button>
                                    </div>
                                </div>
                                
                                {batchConfig.structureProvider && (
                                    <div className="space-y-1 animate-fade-in">
                                        <label className="text-[10px] text-gray-500 font-bold">Specific Model</label>
                                        <select 
                                            value={batchConfig.structureModel} 
                                            onChange={(e) => setBatchConfig({...batchConfig, structureModel: e.target.value})}
                                            className="w-full bg-black/40 border border-gray-700 rounded p-2 text-xs text-white outline-none"
                                        >
                                            {(batchConfig.structureProvider === AIProvider.GEMINI ? GEMINI_MODELS : GROQ_MODELS).map(m => (
                                                <option key={m.value} value={m.value}>{m.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div className="space-y-1">
                                    <label className="text-[10px] text-gray-500 font-bold">Custom Blueprint Instructions</label>
                                    <textarea 
                                        value={batchConfig.customStructurePrompt}
                                        onChange={(e) => setBatchConfig({...batchConfig, customStructurePrompt: e.target.value})}
                                        className="w-full h-16 bg-black/40 border border-gray-700 rounded p-2 text-[10px] text-gray-300 outline-none resize-none"
                                        placeholder="E.g. Focus on pediatric cases only..."
                                    />
                                </div>
                             </div>
                          </div>

                          {/* Right: Manufacturer (Phase 2) */}
                          <div className="space-y-3">
                             <div className="flex items-center gap-2 text-green-400 font-bold text-[10px] uppercase tracking-widest mb-1">
                                <Cpu size={12}/> Phase 2: Content Factory
                             </div>

                             <div className="p-3 bg-gray-800/40 rounded-lg border border-gray-700/50 space-y-3 h-full">
                                <div className="flex items-center justify-between text-[10px] text-gray-500 bg-black/20 p-2 rounded">
                                    <span>Uses Global Config:</span>
                                    <span className="font-bold text-white">{config.provider.toUpperCase()} / {config.model.split('/').pop()}</span>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] text-gray-500 font-bold">Custom Fabrication Instructions</label>
                                    <textarea 
                                        value={batchConfig.customContentPrompt}
                                        onChange={(e) => setBatchConfig({...batchConfig, customContentPrompt: e.target.value})}
                                        className="w-full h-24 bg-black/40 border border-gray-700 rounded p-2 text-[10px] text-gray-300 outline-none resize-none"
                                        placeholder="E.g. Include specific drug dosages for Indonesia..."
                                    />
                                </div>
                             </div>
                          </div>
                       </div>
                     )}
                  </div>
                )}

                {/* Circuit Status */}
                {circuitStatus && (
                    <div className={`text-xs text-center font-mono py-1 rounded ${circuitStatus.includes('BREAKER') ? 'bg-red-900/20 text-red-400 border border-red-900' : 'bg-blue-900/20 text-blue-400'}`}>
                        STATUS: {circuitStatus}
                    </div>
                )}

                {/* VISUAL PROGRESS */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-black/30 p-2 rounded-lg border border-gray-800">
                        <div className="flex justify-between text-[10px] text-gray-400 mb-1 uppercase font-bold">
                            <span>Phase 1: Blueprints</span>
                            <span>{Math.round(phase1Progress)}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${phase1Progress}%` }}></div>
                        </div>
                    </div>
                    <div className="bg-black/30 p-2 rounded-lg border border-gray-800">
                        <div className="flex justify-between text-[10px] text-gray-400 mb-1 uppercase font-bold">
                            <span>Phase 2: Manufacturing</span>
                            <span>{Math.round(phase2Progress)}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${phase2Progress}%` }}></div>
                        </div>
                    </div>
                </div>
             </div>
          )}

          {queue.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-800 rounded-3xl bg-neuro-surface/20">
              <div className="w-full max-w-md space-y-6">
                <div className="flex bg-gray-900 p-1 rounded-lg self-center mx-auto w-fit">
                   <button onClick={() => setActiveTab('upload')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'upload' ? 'bg-gray-700 text-white' : 'text-gray-500'}`}>File Upload</button>
                   <button onClick={() => setActiveTab('text')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'text' ? 'bg-gray-700 text-white' : 'text-gray-500'}`}>Raw Text</button>
                </div>

                {activeTab === 'upload' ? <FileUploader files={syllabusFile} onFilesChange={setSyllabusFile} /> : <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} placeholder="Paste syllabus text, JSON list, or loose topics here..." className="w-full h-32 bg-gray-900/50 border border-gray-700 rounded-xl p-3 text-sm text-gray-300 focus:border-neuro-primary outline-none resize-none" />}
                
                {error && <div className="text-red-400 text-xs text-center bg-red-900/10 p-2 rounded">{error}</div>}

                <button onClick={handleParse} disabled={isParsing || (activeTab === 'upload' ? syllabusFile.length === 0 : !rawText.trim())} className="w-full py-4 rounded-xl font-bold text-white shadow-lg transition-all bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50">
                  {isParsing ? <><RefreshCw className="animate-spin inline mr-2"/> Parsing...</> : "Generate Queue"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-2 pb-10">
                {queue.map((item, index) => {
                  const isActive = ['generating_note', 'drafting_struct'].includes(item.status);
                  const isPaused = item.status === 'paused_for_review';
                  const isDone = item.status === 'done';
                  const isError = item.status === 'error';
                  const hasRetry = item.retryCount && item.retryCount > 0;

                  return (
                    <div 
                      key={item.id} 
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                      className={`relative p-3 rounded-lg border transition-all duration-300 group cursor-grab active:cursor-grabbing ${
                        isActive ? 'bg-neuro-primary/10 border-neuro-primary shadow-[0_0_15px_rgba(99,102,241,0.2)]' : 
                        isPaused ? 'bg-amber-900/10 border-amber-500/50 border-dashed' :
                        isDone ? 'bg-green-900/10 border-green-900/30' : 
                        isError ? 'bg-red-900/10 border-red-900/30' : 'bg-neuro-surface/40 border-gray-800'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3 overflow-hidden flex-1" onClick={() => !isProcessing && onSelectTopic(item.topic)}>
                          <div className="text-gray-600 cursor-move" title="Drag to reorder">
                            <GripVertical size={14} />
                          </div>
                          <span className="text-[10px] font-mono text-gray-500 w-5 shrink-0">{(index + 1).toString().padStart(2, '0')}</span>
                          <div className={`p-1.5 rounded-full shrink-0 ${isPaused ? 'bg-amber-500/20 text-amber-500' : 'bg-gray-800 text-gray-500'}`}>
                             {getStatusIcon(item)}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <div className={`text-sm truncate ${isDone ? 'text-gray-400' : 'text-gray-200 font-bold'}`}>{item.topic}</div>
                            <div className={`text-[10px] truncate ${isActive ? 'text-neuro-primary animate-pulse' : isError ? 'text-red-400' : isPaused ? 'text-amber-400' : 'text-gray-500'}`}>
                                {hasRetry ? `(Retry ${item.retryCount}) ` : ''} 
                                {isPaused ? 'Waiting for Review (Click Eye)' : item.status}
                                {item.errorMsg && ` - ${item.errorMsg}`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                           {isPaused && (
                               <button onClick={() => openReview(item)} className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded animate-pulse shadow-lg">REVIEW</button>
                           )}
                           {isDone && <button className="p-1.5 bg-gray-800 hover:bg-green-900/30 text-gray-500 hover:text-green-400 rounded"><BookOpen size={14} /></button>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* --- REVIEW MODAL --- */}
      {viewingItem && (
          <div className="absolute inset-0 z-50 bg-[#0a0f18]/95 backdrop-blur-md flex flex-col p-6 animate-fade-in">
              <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-800">
                  <div>
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                          <Settings2 className="text-amber-400"/> Blueprint Review
                      </h3>
                      <p className="text-xs text-gray-500">Edit the AI-generated structure before full generation.</p>
                  </div>
                  <div className="flex gap-2">
                      <button onClick={() => setViewingItem(null)} className="px-4 py-2 rounded-lg text-xs font-bold text-gray-400 hover:text-white hover:bg-gray-800">Cancel</button>
                      <button onClick={handleApprove} className="px-4 py-2 rounded-lg text-xs font-bold bg-green-600 hover:bg-green-500 text-white flex items-center gap-2 shadow-lg">
                          <CheckCircle2 size={16}/> Approve & Continue
                      </button>
                  </div>
              </div>
              
              <div className="flex-1 relative bg-black/30 rounded-xl border border-gray-700 overflow-hidden">
                  <textarea 
                     value={editedStructure} 
                     onChange={(e) => setEditedStructure(e.target.value)}
                     className="absolute inset-0 w-full h-full bg-transparent p-6 text-sm font-mono text-gray-300 resize-none outline-none custom-scrollbar"
                  />
              </div>
          </div>
      )}

    </div>
  );
};

export default SyllabusFlow;
