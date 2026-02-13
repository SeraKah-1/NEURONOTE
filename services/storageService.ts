
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { HistoryItem, SavedQueue, NoteMode, Folder, SavedPrompt } from '../types';

export class StorageService {
  private static instance: StorageService;
  private supabase: SupabaseClient | null = null;
  private isSupabaseReady: boolean = false;

  private constructor() {
    this.checkSupabaseConfig();
  }

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  private checkSupabaseConfig() {
      // Try to load from local storage if not passed explicitly during runtime
      const url = localStorage.getItem('neuro_sb_url');
      const key = localStorage.getItem('neuro_sb_key');
      if (url && key) this.initSupabase(url, key);
  }

  public initSupabase(url: string, key: string) {
    const cleanUrl = url?.trim();
    const cleanKey = key?.trim();

    if (cleanUrl && cleanKey && cleanUrl.startsWith('http')) {
      try {
        this.supabase = createClient(cleanUrl, cleanKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          }
        });
        this.isSupabaseReady = true;
        // Persist for reloads
        localStorage.setItem('neuro_sb_url', cleanUrl);
        localStorage.setItem('neuro_sb_key', cleanKey);
        console.log("✅ Supabase Connected");
      } catch (e) {
        console.error("❌ Failed to init Supabase", e);
        this.isSupabaseReady = false;
      }
    } else {
      this.isSupabaseReady = false;
    }
  }

  public isCloudReady() {
    return this.isSupabaseReady;
  }

  /* ========================================================================
     AUTO-TAGGING HEURISTICS & PARSING
  ======================================================================== */
  private generateTags(topic: string, mode: NoteMode, content: string = ''): string[] {
    const tags = new Set<string>();
    const lowerTopic = topic.toLowerCase();

    // 1. EXTRACT EXPLICIT TAGS FROM CONTENT FOOTER (The "Tags: #A #B" line)
    const footerTagRegex = /(?:Tags|Keywords):\s*((?:#[\w-]+\s*)+)/i;
    const footerMatch = content.match(footerTagRegex);
    if (footerMatch) {
      const tagString = footerMatch[1];
      const explicitTags = tagString.split(/\s+/).map(t => t.replace('#', '').trim()).filter(t => t.length > 0);
      explicitTags.forEach(t => tags.add(t));
    }

    // 2. EXTRACT INLINE HASHTAGS (User Defined inside text)
    const hashtagRegex = /#([\w-]+)/g;
    let match;
    while ((match = hashtagRegex.exec(content)) !== null) {
      tags.add(match[1]); 
    }

    // 3. Mode Tags (System)
    if (mode === NoteMode.CHEAT_CODES) tags.add('Exam-Prep');
    if (mode === NoteMode.GENERAL) tags.add('Standard');
    
    // 4. System Heuristics (Fallback if AI fails to tag)
    if (tags.size === 0) {
        if (lowerTopic.match(/heart|cardio|acs|mi|stemi|hypertens|ecg/)) tags.add('Cardiology');
        if (lowerTopic.match(/lung|pneumo|asthma|copd|resp|tb/)) tags.add('Pulmonology');
        if (lowerTopic.match(/brain|neuro|stroke|seizure|head|cns/)) tags.add('Neurology');
        if (lowerTopic.match(/kidney|renal|nephro|uti|aki/)) tags.add('Nephrology');
        if (lowerTopic.match(/liver|hepato|gastro|stomach|bowel|gerd/)) tags.add('Gastroenterology');
        if (lowerTopic.match(/hormone|diabet|thyroid|endo|insulin/)) tags.add('Endocrinology');
        if (lowerTopic.match(/drug|pharma|dose|medic|antibiotic/)) tags.add('Pharmacology');
        if (lowerTopic.match(/trauma|emerg|shock|arrest|als/)) tags.add('Emergency');
    }
    
    return Array.from(tags);
  }

  /* ========================================================================
     FOLDER SYSTEM
  ======================================================================== */
  public saveFolder(folder: Folder): void {
    const folders = this.getFolders();
    const idx = folders.findIndex(f => f.id === folder.id);
    if (idx >= 0) folders[idx] = folder;
    else folders.push(folder);
    localStorage.setItem('neuro_folders', JSON.stringify(folders));
  }

  public getFolders(): Folder[] {
    try {
      const stored = localStorage.getItem('neuro_folders');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  }

  public deleteFolder(id: string): void {
    const folders = this.getFolders().filter(f => f.id !== id);
    localStorage.setItem('neuro_folders', JSON.stringify(folders));
    
    // Move notes in this folder to root
    const notes = this.getLocalNotes();
    const updatedNotes = notes.map(n => n.folderId === id ? { ...n, folderId: null } : n);
    localStorage.setItem('neuro_history', JSON.stringify(updatedNotes));
  }

  public moveNoteToFolder(noteId: string, folderId: string | null): void {
    const notes = this.getLocalNotes();
    const note = notes.find(n => n.id === noteId);
    if (note) {
      note.folderId = folderId;
      this.saveNoteLocal(note);
    }
  }

  /* ========================================================================
     PROMPT TEMPLATES (STRUCTURES)
  ======================================================================== */
  public saveTemplate(template: SavedPrompt): void {
      const templates = this.getTemplates();
      const idx = templates.findIndex(t => t.id === template.id);
      if (idx >= 0) templates[idx] = template;
      else templates.push(template);
      localStorage.setItem('neuro_templates', JSON.stringify(templates));
  }

  public getTemplates(): SavedPrompt[] {
      try {
          const stored = localStorage.getItem('neuro_templates');
          return stored ? JSON.parse(stored) : [];
      } catch { return []; }
  }

  public deleteTemplate(id: string): void {
      const templates = this.getTemplates().filter(t => t.id !== id);
      localStorage.setItem('neuro_templates', JSON.stringify(templates));
  }

  /* ========================================================================
     LOCAL STORAGE SYSTEM
  ======================================================================== */

  public saveNoteLocal(note: HistoryItem): void {
    const notes = this.getLocalNotes();
    
    // Only generate tags if none exist, preserving user edits
    if (!note.tags || note.tags.length === 0) {
        const detectedTags = this.generateTags(note.topic, note.mode, note.content);
        note.tags = detectedTags;
    }

    const existingIdx = notes.findIndex(n => n.id === note.id);
    if (existingIdx >= 0) {
      if (note.folderId === undefined) {
         note.folderId = notes[existingIdx].folderId;
      }
      notes[existingIdx] = note;
    } else {
      notes.unshift(note);
    }
    localStorage.setItem('neuro_history', JSON.stringify(notes));
  }

  public connectNotes(sourceId: string, targetId: string): void {
    const notes = this.getLocalNotes();
    const sourceIdx = notes.findIndex(n => n.id === sourceId);
    const targetIdx = notes.findIndex(n => n.id === targetId);

    if (sourceIdx === -1 || targetIdx === -1) return;

    const source = { ...notes[sourceIdx] };
    const target = { ...notes[targetIdx] };

    // Create bi-directional tags based on topic names
    // Replaces spaces with dashes for clean tagging (e.g. "Heart Failure" -> "Heart-Failure")
    const sourceTag = source.topic.replace(/\s+/g, '-');
    const targetTag = target.topic.replace(/\s+/g, '-');

    if (!source.tags) source.tags = [];
    if (!source.tags.includes(targetTag)) source.tags.push(targetTag);

    if (!target.tags) target.tags = [];
    if (!target.tags.includes(sourceTag)) target.tags.push(sourceTag);

    // Save back
    notes[sourceIdx] = source;
    notes[targetIdx] = target;
    localStorage.setItem('neuro_history', JSON.stringify(notes));

    // If cloud enabled, try syncing there too (fire and forget)
    if (this.isSupabaseReady) {
        this.updateNoteTags(source.id, source.tags);
        this.updateNoteTags(target.id, target.tags);
    }
  }

  public getLocalNotes(): HistoryItem[] {
    try {
      const stored = localStorage.getItem('neuro_history');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  }

  public deleteNoteLocal(id: string): void {
    const notes = this.getLocalNotes();
    const updated = notes.filter(n => n.id !== id);
    localStorage.setItem('neuro_history', JSON.stringify(updated));
  }

  public renameNoteLocal(id: string, newTopic: string): void {
    const notes = this.getLocalNotes();
    const updated = notes.map(n => n.id === id ? { ...n, topic: newTopic } : n);
    localStorage.setItem('neuro_history', JSON.stringify(updated));
  }

  /* ========================================================================
     🔥 SUPABASE CRUD OPERATIONS
  ======================================================================== */

  public async uploadNoteToCloud(note: HistoryItem): Promise<boolean> {
    if (!this.isSupabaseReady || !this.supabase) throw new Error("Cloud not connected");

    // Ensure tags are set
    if(!note.tags) note.tags = this.generateTags(note.topic, note.mode, note.content);

    const { error } = await this.supabase
      .from('neuro_notes')
      .upsert({
        id: note.id,
        topic: note.topic,
        content: note.content,
        mode: note.mode,
        provider: note.provider,
        timestamp: note.timestamp,
        tags: note.tags || [] 
      });

    if (error) {
      console.error("Supabase Upload Error:", error);
      throw new Error(error.message);
    }
    return true;
  }

  public async getCloudNotes(): Promise<HistoryItem[]> {
    if (!this.isSupabaseReady || !this.supabase) return [];

    const { data, error } = await this.supabase
      .from('neuro_notes')
      .select('*')
      .order('timestamp', { ascending: false });

    if (error) {
      console.error("Supabase Fetch Error:", error);
      throw new Error(error.message);
    }

    return (data || []).map((item: any) => ({
      id: item.id,
      topic: item.topic,
      content: item.content,
      mode: item.mode,
      provider: item.provider,
      timestamp: item.timestamp,
      parentId: null,
      tags: item.tags || [],
      folderId: null
    }));
  }

  public async deleteNoteFromCloud(id: string): Promise<void> {
    if (!this.isSupabaseReady || !this.supabase) return;
    
    const { error } = await this.supabase
      .from('neuro_notes')
      .delete()
      .eq('id', id);
    
    if (error) {
        throw new Error(error.message);
    }
  }

  public async updateNoteTags(id: string, newTags: string[]): Promise<void> {
      // 1. Local Update
      const local = this.getLocalNotes();
      const targetIdx = local.findIndex(n => n.id === id);
      
      if (targetIdx >= 0) {
          local[targetIdx].tags = newTags;
          localStorage.setItem('neuro_history', JSON.stringify(local));
      }

      // 2. Cloud Update
      if (this.isSupabaseReady && this.supabase) {
          try {
             await this.supabase.from('neuro_notes').update({ tags: newTags }).eq('id', id);
          } catch (e) {
             console.warn("Failed to sync tags to cloud.", e);
          }
      }
  }

  /* ========================================================================
     UNIFIED DATA MESH
  ======================================================================== */
  public async getUnifiedNotes(): Promise<HistoryItem[]> {
      const local = this.getLocalNotes();
      const unifiedMap = new Map<string, HistoryItem>();

      local.forEach(note => {
          unifiedMap.set(note.id, { ...note, _status: 'local' });
      });

      if (this.isSupabaseReady) {
          try {
              const cloud = await this.getCloudNotes();
              cloud.forEach(cNote => {
                  if (unifiedMap.has(cNote.id)) {
                      const existing = unifiedMap.get(cNote.id)!;
                      // Merge tags properly
                      const mergedTags = Array.from(new Set([...(existing.tags || []), ...(cNote.tags || [])]));
                      
                      unifiedMap.set(cNote.id, { 
                          ...existing, 
                          tags: mergedTags, 
                          _status: 'synced' 
                      });
                  } else {
                      unifiedMap.set(cNote.id, { ...cNote, _status: 'cloud' });
                  }
              });
          } catch (e) {
              console.warn("Could not fetch cloud notes for unification:", e);
          }
      }

      return Array.from(unifiedMap.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  // ... (Queue methods)
  public async saveQueue(queue: SavedQueue): Promise<void> {
    const stored = localStorage.getItem('neuro_saved_queues');
    const queues: SavedQueue[] = stored ? JSON.parse(stored) : [];
    const existingIndex = queues.findIndex(q => q.id === queue.id);
    if (existingIndex >= 0) queues[existingIndex] = queue;
    else queues.unshift(queue);
    localStorage.setItem('neuro_saved_queues', JSON.stringify(queues));
  }

  public async getQueues(): Promise<SavedQueue[]> {
    const stored = localStorage.getItem('neuro_saved_queues');
    return stored ? JSON.parse(stored) : [];
  }

  public async deleteQueue(id: string): Promise<void> {
    const stored = localStorage.getItem('neuro_saved_queues');
    if (stored) {
      const queues: SavedQueue[] = JSON.parse(stored);
      const updated = queues.filter(q => q.id !== id);
      localStorage.setItem('neuro_saved_queues', JSON.stringify(updated));
    }
  }
}
