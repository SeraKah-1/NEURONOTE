
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { HistoryItem, Folder } from '../types';
import { StorageService } from '../services/storageService';
import { FileText, Trash2, Edit2, UploadCloud, RefreshCw, Clock, Search, ChevronDown, ChevronRight, Tag, Cloud, Laptop, CheckCircle2, Folder as FolderIcon, FolderPlus, ArrowLeft, CornerDownRight, Grid } from 'lucide-react';

interface FileSystemProps {
  onSelectNote: (note: HistoryItem) => void;
  activeNoteId: string | null;
}

const FileSystem: React.FC<FileSystemProps> = ({ onSelectNote, activeNoteId }) => {
  const [notes, setNotes] = useState<HistoryItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [storage] = useState(StorageService.getInstance());
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  
  // Navigation State
  const [activeTab, setActiveTab] = useState<'recent' | 'library'>('recent');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // --- CORE: DATA LOADER ---
  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
        const n = await storage.getUnifiedNotes();
        n.sort((a, b) => b.timestamp - a.timestamp);
        setNotes([...n]);
        
        const f = storage.getFolders();
        setFolders(f);
    } catch (e) {
        console.error("FileSystem Load Error", e);
    } finally {
        setLoading(false);
    }
  }, [storage]);

  // Initial Load
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // --- ACTIONS ---
  const handleDeleteNote = async (note: HistoryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`🗑️ Delete "${note.topic}"?\nThis cannot be undone.`)) {
      try {
          if (note._status === 'cloud' || note._status === 'synced') {
             await storage.deleteNoteFromCloud(note.id);
          }
          if (note._status === 'local' || note._status === 'synced') {
             storage.deleteNoteLocal(note.id);
          }
          refreshData();
      } catch(err) {
          alert("Error deleting note.");
      }
    }
  };
  
  const handleRenameNote = (id: string, current: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newName = prompt("✏️ Rename Topic:", current);
    if (newName && newName.trim()) {
       storage.renameNoteLocal(id, newName.trim());
       refreshData();
    }
  };

  const handleEditTags = async (note: HistoryItem, e: React.MouseEvent) => {
      e.stopPropagation();
      const currentTags = note.tags ? note.tags.join(', ') : '';
      const input = prompt("🏷️ Edit Tags (comma separated):", currentTags);
      
      if (input !== null) {
          const newTags = input.split(',').map(t => t.trim()).filter(t => t.length > 0);
          await storage.updateNoteTags(note.id, newTags);
          refreshData();
      }
  };

  const handleUpload = async (note: HistoryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!storage.isCloudReady()) {
        alert("❌ Supabase Not Configured.\nGo to Settings > Storage to connect.");
        return;
    }
    const yes = confirm(`☁️ Upload "${note.topic}" to Cloud Archive?`);
    if(yes) {
        try {
            await storage.uploadNoteToCloud(note);
            refreshData(); 
            alert("✅ Upload Success!");
        } catch (err: any) { 
            alert("❌ Upload Failed: " + err.message); 
        }
    }
  };

  // Folder Actions
  const handleCreateFolder = () => {
    const name = prompt("New Folder Name:");
    if (name && name.trim()) {
      const newFolder: Folder = {
        id: Date.now().toString(),
        name: name.trim(),
        timestamp: Date.now()
      };
      storage.saveFolder(newFolder);
      refreshData();
    }
  };

  const handleDeleteFolder = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Delete this folder? Notes inside will be moved to root.")) {
      storage.deleteFolder(id);
      refreshData();
    }
  };

  const handleMoveToFolder = (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Simple prompt for now, could be a modal
    const folderNames = folders.map(f => f.name).join('\n');
    const targetName = prompt(`Move to Folder?\nEnter name exactly:\n\n[Root]\n${folderNames}`);
    
    if (targetName !== null) {
      if (targetName.toLowerCase() === '[root]' || targetName.trim() === '') {
        storage.moveNoteToFolder(noteId, null);
      } else {
        const target = folders.find(f => f.name.toLowerCase() === targetName.toLowerCase());
        if (target) {
          storage.moveNoteToFolder(noteId, target.id);
        } else {
          alert("Folder not found.");
          return;
        }
      }
      refreshData();
    }
  };

  const toggleGroup = (groupTitle: string) => {
      setCollapsedGroups(prev => ({...prev, [groupTitle]: !prev[groupTitle]}));
  };

  // --- MEMOIZED FILTERING & GROUPING ---
  const filteredNotes = useMemo(() => {
      let result = notes;
      
      // 1. Folder Filtering (Only applies in Library Mode)
      if (activeTab === 'library') {
          result = result.filter(n => n.folderId === currentFolderId || (!n.folderId && currentFolderId === null));
      }

      // 2. Search Filtering
      if (searchQuery) {
          const q = searchQuery.toLowerCase();
          result = notes.filter(n => {
              const matchTitle = n.topic.toLowerCase().includes(q);
              const matchTags = n.tags?.some(t => t.toLowerCase().includes(q));
              return matchTitle || matchTags;
          });
      }

      return result;
  }, [notes, searchQuery, activeTab, currentFolderId]);

  const groupedNotes = useMemo(() => {
      // Grouping only for "Recent" tab
      if (activeTab !== 'recent') return [];

      const getGroupTitle = (timestamp: number): string => {
          const date = new Date(timestamp);
          const now = new Date();
          const diffTime = Math.abs(now.getTime() - date.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (date.toDateString() === now.toDateString()) return "Today";
          
          const yesterday = new Date(now);
          yesterday.setDate(now.getDate() - 1);
          if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

          if (diffDays <= 7) return "Previous 7 Days";
          if (diffDays <= 30) return "This Month";
          
          return "Older";
      };

      const groups: Record<string, HistoryItem[]> = {};
      const order = ["Today", "Yesterday", "Previous 7 Days", "This Month", "Older"];

      filteredNotes.forEach(note => {
          const group = getGroupTitle(note.timestamp);
          if (!groups[group]) groups[group] = [];
          groups[group].push(note);
      });

      return order
        .filter(key => groups[key] && groups[key].length > 0)
        .map(key => ({ title: key, notes: groups[key] }));
  }, [filteredNotes, activeTab]);

  const currentFolderName = useMemo(() => {
    return folders.find(f => f.id === currentFolderId)?.name || 'Library Root';
  }, [folders, currentFolderId]);

  return (
    <div className="flex flex-col h-full bg-[var(--ui-sidebar)] rounded-xl border border-[var(--ui-border)] overflow-hidden">
       {/* Header Toolbar */}
       <div className="flex flex-col gap-2 p-3 border-b border-[var(--ui-border)] bg-[var(--ui-surface)]">
         <div className="flex justify-between items-center mb-1">
            <div className="flex bg-[var(--ui-bg)] rounded-lg p-0.5 border border-[var(--ui-border)]">
               <button 
                  onClick={() => setActiveTab('recent')} 
                  className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${activeTab === 'recent' ? 'bg-[var(--ui-primary)] text-white shadow' : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]'}`}
               >
                 <Clock size={12} className="inline mr-1"/> Recent
               </button>
               <button 
                  onClick={() => setActiveTab('library')} 
                  className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${activeTab === 'library' ? 'bg-[var(--ui-primary)] text-white shadow' : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]'}`}
               >
                 <Grid size={12} className="inline mr-1"/> Library
               </button>
            </div>
            <button onClick={refreshData} className="p-1.5 bg-[var(--ui-bg)] hover:bg-[var(--ui-surface)] rounded text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)] transition-colors" title="Force Refresh">
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
         </div>
         
         {/* Search Bar */}
         <div className="relative">
            <Search size={12} className="absolute left-2 top-2 text-[var(--ui-text-muted)]"/>
            <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notes..." 
                className="w-full bg-[var(--ui-bg)] border border-[var(--ui-border)] rounded-lg py-1.5 pl-7 pr-2 text-xs text-[var(--ui-text-main)] focus:border-[var(--ui-primary)] outline-none transition-all focus:bg-[var(--ui-surface)]"
            />
         </div>
       </div>
       
       {/* List Area */}
       <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-4">
          
          {/* --- VIEW: LIBRARY HEADER --- */}
          {activeTab === 'library' && !searchQuery && (
             <div className="flex items-center justify-between px-2 pb-2 border-b border-[var(--ui-border)] mb-2">
                <div className="flex items-center gap-2">
                   {currentFolderId && (
                      <button onClick={() => setCurrentFolderId(null)} className="p-1 hover:bg-[var(--ui-surface)] rounded text-[var(--ui-text-muted)]">
                         <ArrowLeft size={14} />
                      </button>
                   )}
                   <span className="text-xs font-bold text-[var(--ui-text-main)] flex items-center gap-2">
                      <FolderIcon size={14} className="text-[var(--ui-primary)]"/> {currentFolderName}
                   </span>
                </div>
                {!currentFolderId && (
                   <button onClick={handleCreateFolder} className="p-1.5 hover:bg-[var(--ui-surface)] rounded text-[var(--ui-primary)] hover:text-[var(--ui-text-main)] transition-colors" title="New Folder">
                      <FolderPlus size={16} />
                   </button>
                )}
             </div>
          )}

          {/* --- FOLDER LIST (Library Root Only) --- */}
          {activeTab === 'library' && !currentFolderId && !searchQuery && (
             <div className="grid grid-cols-2 gap-2 mb-4">
                {folders.map(folder => (
                   <div 
                      key={folder.id} 
                      onClick={() => setCurrentFolderId(folder.id)}
                      className="bg-[var(--ui-surface)] border border-[var(--ui-border)] hover:border-[var(--ui-primary)]/50 hover:bg-[var(--ui-bg)] p-3 rounded-lg cursor-pointer group transition-all"
                   >
                      <div className="flex justify-between items-start">
                         <FolderIcon size={24} className="text-[var(--ui-text-muted)] group-hover:text-[var(--ui-primary)] mb-2 transition-colors"/>
                         <button onClick={(e) => handleDeleteFolder(folder.id, e)} className="text-[var(--ui-text-muted)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={12}/></button>
                      </div>
                      <span className="text-xs font-medium text-[var(--ui-text-main)] block truncate">{folder.name}</span>
                   </div>
                ))}
             </div>
          )}

          {/* --- NOTES LIST --- */}
          {loading && notes.length === 0 ? (
              <div className="flex items-center justify-center h-20 text-[10px] text-[var(--ui-text-muted)] gap-2">
                  <RefreshCw size={12} className="animate-spin"/> Loading...
              </div>
          ) : activeTab === 'recent' ? (
             /* RECENT VIEW (Grouped) */
             groupedNotes.map(group => (
                <div key={group.title} className="animate-slide-up">
                    <div 
                        onClick={() => toggleGroup(group.title)}
                        className="flex items-center gap-2 px-2 py-1 text-[10px] font-bold text-[var(--ui-text-muted)] uppercase tracking-widest cursor-pointer hover:text-[var(--ui-text-main)] transition-colors mb-1"
                    >
                        {collapsedGroups[group.title] ? <ChevronRight size={10}/> : <ChevronDown size={10}/>}
                        {group.title} 
                        <span className="bg-[var(--ui-bg)] text-[var(--ui-text-muted)] px-1.5 rounded-full text-[9px]">{group.notes.length}</span>
                    </div>
                    
                    {!collapsedGroups[group.title] && (
                        <div className="space-y-1">
                           {group.notes.map(note => <NoteItem key={note.id} note={note} activeNoteId={activeNoteId} onSelectNote={onSelectNote} onEditTags={handleEditTags} onUpload={handleUpload} onRename={handleRenameNote} onDelete={handleDeleteNote} onMove={handleMoveToFolder} isLocal={note._status === 'local'} />)}
                        </div>
                    )}
                </div>
            ))
          ) : (
             /* LIBRARY VIEW (Flat List for current folder) */
             <div className="space-y-1">
                {filteredNotes.length === 0 && !loading && (
                   <p className="text-center text-[10px] text-[var(--ui-text-muted)] italic py-4">No notes in this location.</p>
                )}
                {filteredNotes.map(note => (
                   <NoteItem key={note.id} note={note} activeNoteId={activeNoteId} onSelectNote={onSelectNote} onEditTags={handleEditTags} onUpload={handleUpload} onRename={handleRenameNote} onDelete={handleDeleteNote} onMove={handleMoveToFolder} isLocal={note._status === 'local'} />
                ))}
             </div>
          )}
       </div>
    </div>
  );
};

// Extracted for cleaner render
const NoteItem: React.FC<{
  note: HistoryItem, 
  activeNoteId: string | null, 
  onSelectNote: (n: HistoryItem) => void,
  onEditTags: (n: HistoryItem, e: React.MouseEvent) => void,
  onUpload: (n: HistoryItem, e: React.MouseEvent) => void,
  onRename: (id: string, t: string, e: React.MouseEvent) => void,
  onDelete: (n: HistoryItem, e: React.MouseEvent) => void,
  onMove: (id: string, e: React.MouseEvent) => void,
  isLocal: boolean
}> = ({ note, activeNoteId, onSelectNote, onEditTags, onUpload, onRename, onDelete, onMove, isLocal }) => (
    <div 
        onClick={() => onSelectNote(note)}
        className={`
            flex items-center justify-between p-2.5 rounded-lg cursor-pointer group border transition-all select-none relative overflow-hidden
            ${activeNoteId === note.id 
            ? 'bg-[var(--ui-primary-glow)] border-[var(--ui-primary)] text-white shadow-[inset_3px_0_0_0_var(--ui-primary)]' 
            : 'bg-transparent border-transparent hover:bg-[var(--ui-bg)] text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]'
            }
        `}
    >
        {activeNoteId === note.id && (
            <div className="absolute inset-0 bg-gradient-to-r from-[var(--ui-primary)]/10 to-transparent pointer-events-none"/>
        )}

        <div className="flex items-center gap-3 overflow-hidden flex-1 relative z-10">
            <div className={`p-1.5 rounded-md transition-colors shrink-0 ${
                note._status === 'cloud' ? 'text-cyan-400 bg-cyan-900/20' :
                note._status === 'synced' ? 'text-green-400 bg-green-900/20' :
                activeNoteId === note.id ? 'text-[var(--ui-primary)] bg-[var(--ui-primary)]/20' : 'text-[var(--ui-text-muted)] bg-[var(--ui-bg)]'
            }`}>
                {note._status === 'cloud' ? <Cloud size={14}/> : <FileText size={14} />}
            </div>
            <div className="flex flex-col min-w-0 w-full">
                <div className="flex items-center justify-between w-full">
                    <span className={`text-xs font-bold truncate transition-colors pr-2 ${activeNoteId === note.id ? 'text-white' : 'text-[var(--ui-text-muted)] group-hover:text-[var(--ui-text-main)]'}`}>{note.topic}</span>
                </div>
                
                {note.tags && note.tags.length > 0 && (
                    <div className="flex gap-1 mt-1 overflow-x-hidden">
                        {note.tags.slice(0, 3).map(tag => (
                            <span key={tag} className="text-[8px] bg-[var(--ui-bg)] px-1 rounded text-[var(--ui-text-muted)] truncate max-w-[50px]">{tag}</span>
                        ))}
                    </div>
                )}

                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] opacity-50 font-mono">
                        {note.mode.toUpperCase()}
                    </span>
                    {note._status === 'synced' && <CheckCircle2 size={8} className="text-green-500" />}
                    {note._status === 'cloud' && <Cloud size={8} className="text-cyan-500" />}
                    {note._status === 'local' && <Laptop size={8} className="text-[var(--ui-text-muted)]" />}
                </div>
            </div>
        </div>
        
        <div className={`flex items-center gap-1 transition-opacity bg-[var(--ui-surface)]/90 rounded px-1 backdrop-blur-sm relative z-20 ${activeNoteId === note.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
            <button onClick={(e) => onMove(note.id, e)} title="Move to Folder" className="p-1.5 hover:text-[var(--ui-text-main)] hover:bg-[var(--ui-bg)] rounded"><CornerDownRight size={12}/></button>
            <button onClick={(e) => onEditTags(note, e)} title="Edit Tags" className="p-1.5 hover:text-[var(--ui-text-main)] hover:bg-[var(--ui-bg)] rounded"><Tag size={12}/></button>
            {isLocal && (
                <button onClick={(e) => onUpload(note, e)} title="Upload Cloud" className="p-1.5 hover:text-cyan-400 hover:bg-cyan-900/30 rounded"><UploadCloud size={12}/></button>
            )}
            <button onClick={(e) => onRename(note.id, note.topic, e)} title="Rename" className="p-1.5 hover:text-[var(--ui-text-main)] hover:bg-[var(--ui-bg)] rounded"><Edit2 size={12}/></button>
            <button onClick={(e) => onDelete(note, e)} title="Delete" className="p-1.5 hover:text-red-400 hover:bg-red-900/30 rounded"><Trash2 size={12}/></button>
        </div>
    </div>
);

export default FileSystem;
