import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { HistoryItem, Folder, SavedPrompt, SavedQueue, KnowledgeSource, KnowledgeFile, LibraryMaterial } from '../types';

// --- INDEXED DB HELPER (Raw Implementation to avoid external deps) ---
const DB_NAME = 'NeuroNoteDB';
const DB_VERSION = 1;
const STORE_CONTENT = 'note_content';
const STORE_FILES = 'knowledge_files';

class IDBAdapter {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_CONTENT)) {
          db.createObjectStore(STORE_CONTENT); // Key: Note ID, Value: Content String
        }
        if (!db.objectStoreNames.contains(STORE_FILES)) {
          db.createObjectStore(STORE_FILES); // Key: SourceId_FileId, Value: Blob/Base64
        }
      };
      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };
      request.onerror = (event) => reject(event);
    });
  }

  async put(storeName: string, key: string, value: any): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async get(storeName: string, key: string): Promise<any> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async delete(storeName: string, key: string): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

export class StorageService {
  private static instance: StorageService;
  private supabase: SupabaseClient | null = null;
  private idb: IDBAdapter;
  
  private constructor() {
    this.idb = new IDBAdapter();
    this.idb.init().catch(err => console.error("Failed to init IDB", err));
  }

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  public initSupabase(url: string, key: string) {
    if (url && key) {
      this.supabase = createClient(url, key);
    }
  }

  public isCloudReady(): boolean {
    return !!this.supabase;
  }

  // --- NOTES (Hybrid: Metadata in LS, Content in IDB) ---
  
  // Helper to strip heavy content for LocalStorage
  private stripContent(note: HistoryItem): HistoryItem {
    return { ...note, content: "" }; 
  }

  // Metadata is fast and synchronous (LocalStorage)
  public getLocalNotesMetadata(): HistoryItem[] {
    const data = localStorage.getItem('neuro_notes');
    return data ? JSON.parse(data) : [];
  }

  // Content is heavy and asynchronous (IndexedDB)
  public async getNoteContent(id: string): Promise<string> {
    const content = await this.idb.get(STORE_CONTENT, id);
    return content || "";
  }

  // Returns full notes (Metadata + Content) - Expensive, use carefully
  // Used for initial migration or full exports
  public async getUnifiedNotes(): Promise<HistoryItem[]> {
      const localMeta = this.getLocalNotesMetadata();
      
      // We return metadata immediately for the UI to be snappy.
      // The content will be loaded on demand when a note is clicked.
      // However, if some components RELY on content being present in the list (e.g. search),
      // we might need this. But for performance, we prefer returning metadata only.
      
      // For backward compatibility with existing components that expect 'content':
      // We will return empty content strings here, and the UI must fetch content via ID.
      
      return localMeta;
  }

  public async saveNoteLocal(note: HistoryItem) {
    // 1. Save Content to IDB
    await this.idb.put(STORE_CONTENT, note.id, note.content);

    // 2. Save Metadata to LS
    const meta = this.getLocalNotesMetadata();
    const existingIndex = meta.findIndex(n => n.id === note.id);
    const lightweightNote = this.stripContent({ ...note, _status: 'local' });

    if (existingIndex >= 0) {
      meta[existingIndex] = lightweightNote;
    } else {
      meta.push(lightweightNote);
    }
    localStorage.setItem('neuro_notes', JSON.stringify(meta));
  }

  public async deleteNoteLocal(id: string) {
    await this.idb.delete(STORE_CONTENT, id);
    const notes = this.getLocalNotesMetadata().filter(n => n.id !== id);
    localStorage.setItem('neuro_notes', JSON.stringify(notes));
  }
  
  public renameNoteLocal(id: string, newTopic: string) {
      const notes = this.getLocalNotesMetadata();
      const note = notes.find(n => n.id === id);
      if (note) {
          note.topic = newTopic;
          localStorage.setItem('neuro_notes', JSON.stringify(notes));
      }
  }

  public async uploadNoteToCloud(note: HistoryItem) {
      if (!this.supabase) throw new Error("Supabase not connected");
      
      const { _status, ...cleanNote } = note;
      const { error } = await this.supabase.from('neuro_notes').upsert(cleanNote);
      if (error) throw error;
      
      // Update local status
      const notes = this.getLocalNotesMetadata();
      const idx = notes.findIndex(n => n.id === note.id);
      if (idx >= 0) {
          notes[idx]._status = 'synced';
          localStorage.setItem('neuro_notes', JSON.stringify(notes));
      }
  }

  public async deleteNoteFromCloud(id: string) {
      if (!this.supabase) return;
      await this.supabase.from('neuro_notes').delete().eq('id', id);
  }

  // --- FOLDERS ---
  public getFolders(): Folder[] {
    const data = localStorage.getItem('neuro_folders');
    return data ? JSON.parse(data) : [];
  }

  public saveFolder(folder: Folder) {
    const folders = this.getFolders();
    folders.push(folder);
    localStorage.setItem('neuro_folders', JSON.stringify(folders));
  }

  public deleteFolder(id: string) {
    const folders = this.getFolders().filter(f => f.id !== id);
    localStorage.setItem('neuro_folders', JSON.stringify(folders));
    
    // Move notes in this folder to root
    const notes = this.getLocalNotesMetadata();
    notes.forEach(n => {
        if (n.folderId === id) n.folderId = undefined; // Root
    });
    localStorage.setItem('neuro_notes', JSON.stringify(notes));
  }

  public moveNoteToFolder(noteId: string, folderId: string | null) {
      const notes = this.getLocalNotesMetadata();
      const note = notes.find(n => n.id === noteId);
      if (note) {
          note.folderId = folderId;
          if (folderId === 'ROOT') note.folderId = undefined;
          localStorage.setItem('neuro_notes', JSON.stringify(notes));
      }
  }

  // --- TEMPLATES ---
  public getTemplates(): SavedPrompt[] {
      const data = localStorage.getItem('neuro_templates');
      return data ? JSON.parse(data) : [];
  }

  public saveTemplate(template: SavedPrompt) {
      const templates = this.getTemplates();
      templates.push(template);
      localStorage.setItem('neuro_templates', JSON.stringify(templates));
  }

  public deleteTemplate(id: string) {
      const templates = this.getTemplates().filter(t => t.id !== id);
      localStorage.setItem('neuro_templates', JSON.stringify(templates));
  }

  // --- QUEUES ---
  public async getQueues(): Promise<SavedQueue[]> {
     const data = localStorage.getItem('neuro_saved_queues');
     return data ? JSON.parse(data) : [];
  }

  public async saveQueue(queue: SavedQueue) {
      const queues = await this.getQueues();
      const idx = queues.findIndex(q => q.id === queue.id);
      if (idx >= 0) queues[idx] = queue;
      else queues.push(queue);
      localStorage.setItem('neuro_saved_queues', JSON.stringify(queues));
  }

  public async deleteQueue(id: string) {
      const queues = await this.getQueues();
      const filtered = queues.filter(q => q.id !== id);
      localStorage.setItem('neuro_saved_queues', JSON.stringify(filtered));
  }

  // --- KNOWLEDGE BASE (Hybrid) ---
  public getKnowledgeSources(): KnowledgeSource[] {
      const data = localStorage.getItem('neuro_kb_sources');
      return data ? JSON.parse(data) : [];
  }

  public saveKnowledgeSource(source: KnowledgeSource) {
      const sources = this.getKnowledgeSources();
      const idx = sources.findIndex(s => s.id === source.id);
      if (idx >= 0) sources[idx] = source;
      else sources.push(source);
      localStorage.setItem('neuro_kb_sources', JSON.stringify(sources));
  }

  public deleteKnowledgeSource(id: string) {
      const sources = this.getKnowledgeSources().filter(s => s.id !== id);
      localStorage.setItem('neuro_kb_sources', JSON.stringify(sources));
      // Cleanup files meta
      const files = this.getKnowledgeFilesMeta(id);
      files.forEach(f => this.idb.delete(STORE_FILES, f.id)); // Delete content
      localStorage.removeItem(`neuro_kb_files_${id}`); // Delete meta
  }

  public getKnowledgeFilesMeta(sourceId: string): KnowledgeFile[] {
      const data = localStorage.getItem(`neuro_kb_files_${sourceId}`);
      return data ? JSON.parse(data) : [];
  }

  public async getKnowledgeFileContent(fileId: string): Promise<string> {
      return await this.idb.get(STORE_FILES, fileId);
  }

  public async saveKnowledgeFiles(sourceId: string, files: KnowledgeFile[]) {
      // 1. Separate heavy data from metadata
      const metaFiles: KnowledgeFile[] = [];
      
      for (const f of files) {
          if (f.data) {
             await this.idb.put(STORE_FILES, f.id, f.data);
          }
          const { data, ...meta } = f;
          metaFiles.push(meta);
      }

      // 2. Update Metadata Store (Append/Update)
      const existing = this.getKnowledgeFilesMeta(sourceId);
      const updated = [...existing];
      
      metaFiles.forEach(f => {
          const idx = updated.findIndex(ex => ex.id === f.id);
          if (idx >= 0) updated[idx] = f;
          else updated.push(f);
      });
      
      localStorage.setItem(`neuro_kb_files_${sourceId}`, JSON.stringify(updated));
  }

  public markFileAsIndexed(sourceId: string, fileId: string) {
      const files = this.getKnowledgeFilesMeta(sourceId);
      const idx = files.findIndex(f => f.id === fileId);
      if (idx >= 0) {
          files[idx].indexed = true;
          localStorage.setItem(`neuro_kb_files_${sourceId}`, JSON.stringify(files));
      }
  }

  // --- CONNECTIONS ---
  public connectNotes(idA: string, idB: string) {
      const notes = this.getLocalNotesMetadata();
      const noteA = notes.find(n => n.id === idA);
      const noteB = notes.find(n => n.id === idB);
      
      if (noteA && noteB) {
          const linkTagA = `link:${idB}`;
          const linkTagB = `link:${idA}`;
          
          if (!noteA.tags) noteA.tags = [];
          if (!noteA.tags.includes(linkTagA)) noteA.tags.push(linkTagA);
          
          if (!noteB.tags) noteB.tags = [];
          if (!noteB.tags.includes(linkTagB)) noteB.tags.push(linkTagB);
          
          localStorage.setItem('neuro_notes', JSON.stringify(notes));
      }
  }

  // --- LIBRARY MATERIALS (Cloud Only) ---
  public async getLibraryMaterials(): Promise<LibraryMaterial[]> {
    if (!this.supabase) throw new Error("Supabase not connected");
    
    const { data, error } = await this.supabase
      .from('library_materials')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    return data as LibraryMaterial[];
  }

  public async saveLibraryMaterial(material: LibraryMaterial) {
    if (!this.supabase) throw new Error("Supabase not connected");
    
    // Ensure tags is array (Supabase text[] handling)
    const payload = {
        ...material,
        tags: material.tags || []
    };

    const { error } = await this.supabase
      .from('library_materials')
      .upsert(payload);
      
    if (error) throw error;
  }

  public async deleteLibraryMaterial(id: string) {
    if (!this.supabase) throw new Error("Supabase not connected");
    
    const { error } = await this.supabase
      .from('library_materials')
      .delete()
      .eq('id', id);
      
    if (error) throw error;
  }
}