
import React, { useState, useEffect } from 'react';
import { 
  Database, CloudLightning, HardDrive, Plus, RefreshCw, 
  FileText, Trash2, CheckCircle2, AlertTriangle, 
  FolderOpen, Link as LinkIcon, Lock, X, BrainCircuit, Shuffle, Play
} from 'lucide-react';
import { StorageService } from '../services/storageService';
import { DriveService } from '../services/driveService';
import { KnowledgeSource, KnowledgeFile } from '../types';

const KnowledgeBase: React.FC = () => {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [allFiles, setAllFiles] = useState<KnowledgeFile[]>([]);
  
  // UI State
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [driveFolders, setDriveFolders] = useState<any[]>([]);
  
  // Mix & Match State
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  
  const storage = StorageService.getInstance();
  const drive = DriveService.getInstance();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    const s = storage.getKnowledgeSources();
    setSources(s);
    
    // Aggregate all files
    let files: KnowledgeFile[] = [];
    s.forEach(source => {
        const sourceFiles = storage.getKnowledgeFiles(source.id);
        files = [...files, ...sourceFiles];
    });
    setAllFiles(files);
  };

  // --- ACTIONS ---

  const handleConnectDrive = async () => {
      setIsConnecting(true);
      try {
          await drive.connectDrive(); // Simulate Auth
          const folders = await drive.listFolders();
          setDriveFolders(folders);
          setShowDriveModal(true);
      } catch (e) {
          alert("Failed to connect to Drive");
      } finally {
          setIsConnecting(false);
      }
  };

  const handleSelectDriveFolder = async (folder: any) => {
      setShowDriveModal(false);
      
      const newSource: KnowledgeSource = {
          id: `drive-source-${folder.id}`,
          name: folder.name,
          type: 'drive',
          status: 'syncing',
          lastSync: Date.now(),
          fileCount: 0,
          sizeBytes: 0,
          config: { driveFolderId: folder.id }
      };

      // Optimistic Update
      const updatedSources = [...sources, newSource];
      storage.saveKnowledgeSource(newSource);
      setSources(updatedSources);

      // Start Sync
      await performSync(newSource);
  };

  const performSync = async (source: KnowledgeSource) => {
      setIsSyncing(source.id);
      try {
          // Simulate Drive Sync
          const files = await drive.syncFolder(source.config?.driveFolderId || '');
          
          // Update Source Stats
          const updatedSource: KnowledgeSource = {
              ...source,
              status: 'ready',
              lastSync: Date.now(),
              fileCount: files.length,
              sizeBytes: files.reduce((acc, f) => acc + f.size, 0)
          };
          
          storage.saveKnowledgeSource(updatedSource);
          storage.saveKnowledgeFiles(source.id, files);
          
          loadData(); // Refresh UI
      } catch (e) {
          console.error(e);
      } finally {
          setIsSyncing(null);
      }
  };

  const handleDeleteSource = (id: string) => {
      if(confirm("Disconnect this source? Files will be removed from Knowledge Base.")) {
          storage.deleteKnowledgeSource(id);
          loadData();
      }
  };

  const toggleSelection = (fileId: string) => {
      const newSet = new Set(selectedFiles);
      if (newSet.has(fileId)) {
          newSet.delete(fileId);
      } else {
          newSet.add(fileId);
      }
      setSelectedFiles(newSet);
  };

  const handleMixAndMatch = () => {
      alert(`Mixing ${selectedFiles.size} sources into context window for next generation... (Mock Action)`);
      // In real app: Push these IDs to the GenerationConfig context
  };

  // --- RENDERERS ---

  const formatBytes = (bytes: number) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="flex flex-col h-full overflow-hidden animate-fade-in">
      
      {/* Header / Stats */}
      <div className="p-6 border-b border-[var(--ui-border)] bg-[var(--ui-surface)] shrink-0">
         <div className="flex justify-between items-start mb-6">
            <div>
               <h2 className="text-2xl font-bold text-[var(--ui-text-main)] flex items-center gap-2">
                  <Database className="text-[var(--ui-primary)]" /> Knowledge Base
               </h2>
               <p className="text-[var(--ui-text-muted)] text-sm mt-1">
                  Centralized "Brain". Tokenize once, query forever with any model.
               </p>
            </div>
            <div className="flex gap-4 text-center">
               <div className="bg-[var(--ui-bg)] p-3 rounded-xl border border-[var(--ui-border)]">
                  <div className="text-2xl font-bold text-[var(--ui-text-main)]">{sources.length}</div>
                  <div className="text-[10px] uppercase text-[var(--ui-text-muted)] font-bold">Active Sources</div>
               </div>
               <div className="bg-[var(--ui-bg)] p-3 rounded-xl border border-[var(--ui-border)]">
                  <div className="text-2xl font-bold text-[var(--ui-text-main)]">{allFiles.length}</div>
                  <div className="text-[10px] uppercase text-[var(--ui-text-muted)] font-bold">Files Indexed</div>
               </div>
            </div>
         </div>

         {/* Connect Buttons */}
         <div className="flex justify-between items-center">
             <div className="flex gap-4">
                <button 
                    onClick={handleConnectDrive}
                    disabled={isConnecting}
                    className="flex items-center gap-3 px-6 py-4 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] hover:border-[#4285F4]/50 hover:bg-[#4285F4]/5 transition-all group"
                >
                    <div className="bg-[#4285F4]/10 p-2 rounded-lg text-[#4285F4]">
                    {isConnecting ? <RefreshCw className="animate-spin"/> : <CloudLightning/>}
                    </div>
                    <div className="text-left">
                    <div className="text-sm font-bold text-[var(--ui-text-main)] group-hover:text-[#4285F4]">Google Drive</div>
                    <div className="text-[10px] text-[var(--ui-text-muted)]">Connect Folder</div>
                    </div>
                </button>
             </div>

             {/* Mix & Match Action Bar */}
             {selectedFiles.size > 0 && (
                 <div className="flex items-center gap-4 bg-[var(--ui-primary)]/10 border border-[var(--ui-primary)] px-4 py-2 rounded-xl animate-slide-up">
                     <span className="text-xs font-bold text-[var(--ui-text-main)]">{selectedFiles.size} Selected</span>
                     <button onClick={handleMixAndMatch} className="flex items-center gap-2 px-4 py-2 bg-[var(--ui-primary)] hover:opacity-90 text-white rounded-lg text-xs font-bold transition-all shadow-lg">
                         <Shuffle size={14}/> Generate Quiz / Note
                     </button>
                 </div>
             )}
         </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
          
          {/* Active Sources Grid */}
          <section>
              <h3 className="text-xs font-bold text-[var(--ui-text-muted)] uppercase tracking-widest mb-4 flex items-center gap-2">
                 <LinkIcon size={12}/> Connected Streams
              </h3>
              
              {sources.length === 0 ? (
                  <div className="border-2 border-dashed border-[var(--ui-border)] rounded-xl p-8 text-center text-[var(--ui-text-muted)]">
                     <CloudLightning size={32} className="mx-auto mb-3 opacity-20"/>
                     <p>No knowledge sources connected.</p>
                  </div>
              ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {sources.map(source => (
                          <div key={source.id} className="bg-[var(--ui-bg)] border border-[var(--ui-border)] rounded-xl p-4 shadow-sm hover:border-[var(--ui-primary)]/30 transition-all relative group overflow-hidden">
                              {/* Sync Progress Bar */}
                              {isSyncing === source.id && (
                                  <div className="absolute top-0 left-0 right-0 h-1 bg-[var(--ui-surface)]">
                                      <div className="h-full bg-[var(--ui-primary)] animate-pulse w-2/3"></div>
                                  </div>
                              )}
                              
                              <div className="flex justify-between items-start mb-3">
                                  <div className="flex items-center gap-3">
                                      <div className="bg-blue-500/10 p-2 rounded text-blue-500">
                                         <FolderOpen size={18}/>
                                      </div>
                                      <div>
                                          <div className="font-bold text-sm text-[var(--ui-text-main)]">{source.name}</div>
                                          <div className="text-[10px] text-[var(--ui-text-muted)]">Google Drive</div>
                                      </div>
                                  </div>
                                  <div className="flex gap-1">
                                      <button onClick={() => performSync(source)} disabled={!!isSyncing} className="p-1.5 hover:bg-[var(--ui-surface)] rounded text-[var(--ui-text-muted)] hover:text-[var(--ui-primary)]">
                                         <RefreshCw size={14} className={isSyncing === source.id ? 'animate-spin' : ''}/>
                                      </button>
                                      <button onClick={() => handleDeleteSource(source.id)} className="p-1.5 hover:bg-red-900/10 rounded text-[var(--ui-text-muted)] hover:text-red-500">
                                         <Trash2 size={14}/>
                                      </button>
                                  </div>
                              </div>
                              
                              <div className="flex justify-between items-center text-[10px] text-[var(--ui-text-muted)] bg-[var(--ui-surface)] p-2 rounded-lg">
                                  <div className="flex items-center gap-2">
                                     <CheckCircle2 size={12} className="text-green-500"/>
                                     <span>{source.status === 'syncing' ? 'Syncing...' : 'Ready'}</span>
                                  </div>
                                  <div>
                                      {source.fileCount} Files ({formatBytes(source.sizeBytes)})
                                  </div>
                              </div>
                          </div>
                      ))}
                  </div>
              )}
          </section>

          {/* Files List */}
          <section>
              <h3 className="text-xs font-bold text-[var(--ui-text-muted)] uppercase tracking-widest mb-4 flex items-center gap-2">
                 <FileText size={12}/> Index Repository
              </h3>
              
              <div className="bg-[var(--ui-bg)] border border-[var(--ui-border)] rounded-xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                      <thead className="bg-[var(--ui-surface)] text-[var(--ui-text-muted)] text-[10px] uppercase font-bold">
                          <tr>
                              <th className="p-3 w-10 text-center">
                                  <input 
                                    type="checkbox" 
                                    checked={allFiles.length > 0 && selectedFiles.size === allFiles.length}
                                    onChange={(e) => {
                                        if (e.target.checked) setSelectedFiles(new Set(allFiles.map(f => f.id)));
                                        else setSelectedFiles(new Set());
                                    }}
                                    className="accent-[var(--ui-primary)]"
                                  />
                              </th>
                              <th className="p-3">File Name</th>
                              <th className="p-3 text-center">Brain Status</th>
                              <th className="p-3 text-right">Size</th>
                              <th className="p-3 text-center">Status</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--ui-border)]">
                          {allFiles.length === 0 ? (
                              <tr>
                                  <td colSpan={5} className="p-8 text-center text-[var(--ui-text-muted)] text-xs">Repository Empty</td>
                              </tr>
                          ) : (
                              allFiles.map(file => (
                                  <tr key={file.id} className="hover:bg-[var(--ui-surface)] transition-colors">
                                      <td className="p-3 text-center">
                                          <input 
                                            type="checkbox" 
                                            checked={selectedFiles.has(file.id)}
                                            onChange={() => toggleSelection(file.id)}
                                            className="accent-[var(--ui-primary)]"
                                          />
                                      </td>
                                      <td className="p-3 text-[var(--ui-text-main)] font-medium flex items-center gap-2">
                                          <FileText size={14} className="text-[var(--ui-primary)]"/>
                                          {file.name}
                                      </td>
                                      <td className="p-3 text-center">
                                          {file.indexed ? (
                                              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 text-[9px] font-bold border border-green-500/20">
                                                  <BrainCircuit size={10}/> TOKENIZED
                                              </div>
                                          ) : (
                                              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-500/10 text-gray-500 text-[9px] font-bold border border-gray-500/20">
                                                  <FileText size={10}/> RAW FILE
                                              </div>
                                          )}
                                      </td>
                                      <td className="p-3 text-[var(--ui-text-muted)] text-xs font-mono text-right">{formatBytes(file.size)}</td>
                                      <td className="p-3 text-center">
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 text-[9px] font-bold border border-blue-500/20">
                                              READY
                                          </span>
                                      </td>
                                  </tr>
                              ))
                          )}
                      </tbody>
                  </table>
              </div>
          </section>

      </div>

      {/* Drive Selection Modal (Mock) */}
      {showDriveModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-[#0f172a] border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-slide-up">
                  <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                      <h3 className="font-bold text-white flex items-center gap-2"><CloudLightning size={18} className="text-[#4285F4]"/> Select Drive Folder</h3>
                      <button onClick={() => setShowDriveModal(false)}><X size={18} className="text-gray-500"/></button>
                  </div>
                  <div className="p-2 max-h-64 overflow-y-auto custom-scrollbar">
                      {driveFolders.map(folder => (
                          <div 
                             key={folder.id} 
                             onClick={() => handleSelectDriveFolder(folder)}
                             className="p-3 hover:bg-white/5 rounded-lg cursor-pointer flex items-center gap-3 group transition-colors"
                          >
                             <div className="bg-gray-800 p-2 rounded text-gray-400 group-hover:bg-[#4285F4]/20 group-hover:text-[#4285F4] transition-colors"><FolderOpen size={20}/></div>
                             <span className="text-gray-300 font-medium">{folder.name}</span>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};

export default KnowledgeBase;
