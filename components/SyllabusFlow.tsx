import React, { useState, useEffect } from 'react';
import { Upload, FileText, CheckCircle, Circle, Play, RefreshCw, Trash2, ListChecks, ArrowRight, FolderOpen, Save, Type, Edit2, Archive } from 'lucide-react';
import { SyllabusItem, UploadedFile, GenerationConfig, SavedQueue } from '../types';
import FileUploader from './FileUploader';
import { parseSyllabusToTopics, parseSyllabusFromText } from '../services/geminiService';
import { StorageService } from '../services/storageService';

interface SyllabusFlowProps {
  config: GenerationConfig;
  onSelectTopic: (topic: string) => void;
}

type TabMode = 'upload' | 'text' | 'library';

const SyllabusFlow: React.FC<SyllabusFlowProps> = ({ config, onSelectTopic }) => {
  const [syllabusFile, setSyllabusFile] = useState<UploadedFile[]>([]);
  const [rawText, setRawText] = useState('');
  const [queue, setQueue] = useState<SyllabusItem[]>([]);
  const [queueName, setQueueName] = useState('My Curriculum');
  const [queueId, setQueueId] = useState<string | null>(null);
  
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabMode>('library');
  
  const [savedQueues, setSavedQueues] = useState<SavedQueue[]>([]);
  const [storageService] = useState(StorageService.getInstance());

  useEffect(() => {
    const savedActive = localStorage.getItem('neuro_syllabus_queue');
    const savedMeta = localStorage.getItem('neuro_syllabus_meta');
    
    if (savedActive) {
      setQueue(JSON.parse(savedActive));
    }
    if (savedMeta) {
      const meta = JSON.parse(savedMeta);
      setQueueName(meta.name);
      setQueueId(meta.id);
    }

    loadLibrary();
  }, []);

  useEffect(() => {
    localStorage.setItem('neuro_syllabus_queue', JSON.stringify(queue));
    localStorage.setItem('neuro_syllabus_meta', JSON.stringify({ id: queueId, name: queueName }));
  }, [queue, queueName, queueId]);

  const loadLibrary = async () => {
    const queues = await storageService.getQueues();
    setSavedQueues(queues);
    if (queues.length === 0 && queue.length === 0) {
        setActiveTab('upload');
    }
  };

  const handleParse = async () => {
    setError(null);
    setIsParsing(true);
    
    try {
      let topics: SyllabusItem[] = [];
      if (activeTab === 'upload') {
        if (syllabusFile.length === 0) throw new Error("Please upload a file.");
        topics = await parseSyllabusToTopics(config, syllabusFile[0]);
        setSyllabusFile([]);
      } else if (activeTab === 'text') {
        if (!rawText.trim()) throw new Error("Please enter syllabus text.");
        topics = await parseSyllabusFromText(config, rawText);
        setRawText('');
      }

      setQueue(topics);
      setQueueId(Date.now().toString());
      setQueueName("New Curriculum");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsParsing(false);
    }
  };

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
    if (queue.length > 0 && confirm("Overwrite current active queue?") === false) return;
    
    setQueue(saved.items);
    setQueueName(saved.name);
    setQueueId(saved.id);
    setActiveTab('upload');
  };

  const handleDeleteFromLibrary = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Delete this curriculum permanently?")) {
      await storageService.deleteQueue(id);
      await loadLibrary();
    }
  };

  const handleRenameLibraryItem = async (id: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newName = prompt("Rename curriculum:", currentName);
    if (newName && newName.trim()) {
      await storageService.renameQueue(id, newName.trim());
      await loadLibrary();
    }
  };

  const handleStartTopic = (id: string, topic: string) => {
    const updated = queue.map(item => 
      item.id === id ? { ...item, status: 'active' as const } : 
      item.status === 'active' ? { ...item, status: 'pending' as const } : item
    );
    setQueue(updated);
    onSelectTopic(topic);
  };

  const handleMarkDone = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = queue.map(item => 
      item.id === id ? { ...item, status: 'done' as const } : item
    );
    setQueue(updated);
  };

  const handleClearActive = () => {
    if (confirm("Clear active workspace? (Saved version in library will remain)")) {
      setQueue([]);
      setQueueId(null);
      setQueueName('My Curriculum');
      localStorage.removeItem('neuro_syllabus_queue');
      localStorage.removeItem('neuro_syllabus_meta');
    }
  };

  const completedCount = queue.filter(q => q.status === 'done').length;
  const progress = queue.length > 0 ? (completedCount / queue.length) * 100 : 0;

  return (
    <div className="max-w-4xl mx-auto h-full flex flex-col animate-fade-in p-6">
      
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <ListChecks className="text-neuro-accent" />
            Curriculum Auto-Queue
          </h2>
          <p className="text-neuro-textMuted text-sm mt-1">
            Organize study topics sequentially. Parse from syllabus or create manually.
          </p>
        </div>
        
        {/* View Switcher */}
        <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-700">
           <button 
             onClick={() => setActiveTab('library')}
             className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${activeTab === 'library' ? 'bg-neuro-surfaceHighlight text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
           >
             <FolderOpen size={14} /> Library
           </button>
           <button 
             onClick={() => setActiveTab('upload')}
             className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${(activeTab === 'upload' || activeTab === 'text') && queue.length === 0 ? 'bg-neuro-surfaceHighlight text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
           >
             <RefreshCw size={14} /> Generator
           </button>
        </div>
      </div>

      {/* --- LIBRARY VIEW --- */}
      {activeTab === 'library' && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto custom-scrollbar pr-2 pb-20">
             {/* Create New Card */}
             <div 
               onClick={() => { setQueue([]); setQueueId(null); setQueueName("New Curriculum"); setActiveTab('upload'); }}
               className="border-2 border-dashed border-gray-700 bg-gray-900/20 hover:bg-gray-800 hover:border-neuro-primary rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all min-h-[150px] group"
             >
                <div className="bg-gray-800 p-3 rounded-full mb-3 group-hover:bg-neuro-primary group-hover:text-white transition-colors text-gray-400">
                   <RefreshCw size={24} />
                </div>
                <span className="font-bold text-gray-300 group-hover:text-white">Create New Queue</span>
             </div>

             {savedQueues.map(saved => (
               <div key={saved.id} className="relative bg-neuro-surface border border-gray-800 hover:border-gray-600 rounded-xl p-5 transition-all group">
                  <div className="flex justify-between items-start mb-3">
                     <div className="flex items-center gap-2">
                        <FolderOpen className="text-neuro-accent" size={18} />
                        <h3 className="font-bold text-white truncate max-w-[150px]">{saved.name}</h3>
                     </div>
                     <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => handleRenameLibraryItem(saved.id, saved.name, e)} className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white"><Edit2 size={14} /></button>
                        <button onClick={(e) => handleDeleteFromLibrary(saved.id, e)} className="p-1.5 hover:bg-red-900/50 rounded text-gray-400 hover:text-red-400"><Trash2 size={14} /></button>
                     </div>
                  </div>
                  
                  <div className="text-xs text-gray-500 mb-4 space-y-1">
                     <p>{saved.items.length} Topics</p>
                     <p>Modified: {new Date(saved.timestamp).toLocaleDateString()}</p>
                  </div>

                  <button 
                    onClick={() => handleLoadFromLibrary(saved)}
                    className="w-full py-2 bg-gray-800 hover:bg-neuro-surfaceHighlight text-xs font-bold text-white rounded-lg transition-colors border border-gray-700"
                  >
                    Load Workspace
                  </button>
               </div>
             ))}
          </div>
        </div>
      )}

      {/* --- GENERATOR / ACTIVE VIEW --- */}
      {(activeTab === 'upload' || activeTab === 'text') && (
        <>
          {/* Active Queue Toolbar */}
          {queue.length > 0 && (
             <div className="bg-neuro-surface border border-gray-800 p-3 rounded-xl mb-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                   <div className="bg-neuro-primary/20 p-2 rounded-lg text-neuro-primary">
                      <Archive size={18} />
                   </div>
                   <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-white text-sm">{queueName}</h3>
                        <button onClick={() => {
                           const n = prompt("Rename Active Queue:", queueName);
                           if(n) setQueueName(n);
                        }} className="text-gray-500 hover:text-white"><Edit2 size={12} /></button>
                      </div>
                      <p className="text-[10px] text-gray-500">{queue.length} Topics</p>
                   </div>
                </div>
                <div className="flex items-center gap-2">
                   <button onClick={handleSaveToLibrary} className="flex items-center gap-1 px-3 py-1.5 bg-neuro-primary hover:bg-neuro-primaryHover text-white text-xs font-bold rounded-lg transition-colors shadow-lg shadow-neuro-primary/20">
                      <Save size={14} /> Save
                   </button>
                   <button onClick={handleClearActive} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors">
                      <Trash2 size={16} />
                   </button>
                </div>
             </div>
          )}

          {/* Empty State / Input Area */}
          {queue.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-800 rounded-3xl bg-neuro-surface/20">
              <div className="w-full max-w-md space-y-6">
                
                {/* Input Type Toggle */}
                <div className="flex bg-gray-900 p-1 rounded-lg self-center mx-auto w-fit">
                   <button onClick={() => setActiveTab('upload')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'upload' ? 'bg-gray-700 text-white' : 'text-gray-500'}`}>File Upload</button>
                   <button onClick={() => setActiveTab('text')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'text' ? 'bg-gray-700 text-white' : 'text-gray-500'}`}>Raw Text</button>
                </div>

                {activeTab === 'upload' ? (
                   <FileUploader files={syllabusFile} onFilesChange={setSyllabusFile} />
                ) : (
                   <textarea 
                     value={rawText}
                     onChange={(e) => setRawText(e.target.value)}
                     placeholder="Paste your syllabus text, JSON list, or loose topics here..."
                     className="w-full h-32 bg-gray-900/50 border border-gray-700 rounded-xl p-3 text-sm text-gray-300 focus:border-neuro-primary outline-none resize-none"
                   />
                )}
                
                {error && (
                  <div className="p-3 bg-red-900/20 border border-red-900 rounded text-red-200 text-sm text-center">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleParse}
                  disabled={isParsing || (activeTab === 'upload' ? syllabusFile.length === 0 : !rawText.trim())}
                  className={`w-full py-4 rounded-xl font-bold text-white shadow-lg transition-all flex items-center justify-center space-x-2
                    ${isParsing || (activeTab === 'upload' ? syllabusFile.length === 0 : !rawText.trim())
                      ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500'
                    }`}
                >
                  {isParsing ? (
                    <>
                      <RefreshCw className="animate-spin" size={20} />
                      <span>Parsing...</span>
                    </>
                  ) : (
                    <>
                      {activeTab === 'upload' ? <FileText size={20} /> : <Type size={20} />}
                      <span>Generate Queue</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Active Queue View */
            <div className="flex-1 flex flex-col overflow-hidden">
              
              <div className="mb-4 bg-gray-800 h-2 rounded-full overflow-hidden relative border border-gray-700">
                <div 
                  className="absolute top-0 left-0 h-full bg-gradient-to-r from-neuro-primary to-neuro-accent transition-all duration-500"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-2 pb-10">
                {queue.map((item, index) => {
                  const isActive = item.status === 'active';
                  const isDone = item.status === 'done';

                  return (
                    <div 
                      key={item.id}
                      onClick={() => !isDone && handleStartTopic(item.id, item.topic)}
                      className={`relative p-3 rounded-lg border transition-all duration-300 group ${
                        isActive 
                          ? 'bg-neuro-primary/10 border-neuro-primary shadow-sm' 
                          : isDone
                            ? 'bg-gray-900/30 border-gray-800 opacity-60'
                            : 'bg-neuro-surface/40 border-gray-800 hover:bg-neuro-surface hover:border-gray-600 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <span className="text-[10px] font-mono text-gray-500 w-5">
                            {(index + 1).toString().padStart(2, '0')}
                          </span>
                          
                          <div className={`p-1.5 rounded-full ${
                            isActive ? 'bg-neuro-primary text-white' : 
                            isDone ? 'bg-green-500/20 text-green-500' : 'bg-gray-800 text-gray-500'
                          }`}>
                             {isDone ? <CheckCircle size={14} /> : isActive ? <Play size={14} fill="currentColor" /> : <Circle size={14} />}
                          </div>

                          <div className={`text-sm ${isDone ? 'line-through text-gray-500' : 'text-gray-200 font-medium'}`}>
                            {item.topic}
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                           {!isDone && (
                             <button
                                onClick={(e) => handleMarkDone(item.id, e)}
                                className="p-1.5 text-gray-500 hover:text-green-400 hover:bg-green-400/10 rounded-full transition-colors"
                                title="Mark as Done"
                             >
                               <CheckCircle size={16} />
                             </button>
                           )}
                           {isActive && (
                             <button className="flex items-center space-x-1 bg-neuro-primary hover:bg-neuro-primaryHover text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg">
                               <span>START</span>
                               <ArrowRight size={10} />
                             </button>
                           )}
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
    </div>
  );
};

export default SyllabusFlow;