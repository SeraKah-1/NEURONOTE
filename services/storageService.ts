import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { HistoryItem, SavedQueue, StorageType } from '../types';

export class StorageService {
  private static instance: StorageService;
  private supabase: SupabaseClient | null = null;
  private currentType: StorageType = StorageType.LOCAL;

  private constructor() {}

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

  public setStorageType(type: StorageType) {
    this.currentType = type;
  }

  public getStorageType(): StorageType {
    return this.currentType;
  }

  /* --- NOTE HISTORY METHODS --- */

  public async saveNote(note: HistoryItem): Promise<boolean> {
    if (this.currentType === StorageType.LOCAL) {
      try {
        const stored = localStorage.getItem('neuro_history');
        const history: HistoryItem[] = stored ? JSON.parse(stored) : [];
        const updated = [note, ...history].slice(0, 50); // Keep last 50 locally
        localStorage.setItem('neuro_history', JSON.stringify(updated));
        return true;
      } catch (e) {
        console.error("Local Storage Error", e);
        return false;
      }
    } else {
      if (!this.supabase) throw new Error("Supabase client not initialized");
      
      const { error } = await this.supabase
        .from('neuro_notes')
        .insert([{
          id: note.id,
          topic: note.topic,
          content: note.content,
          mode: note.mode,
          provider: note.provider,
          timestamp: note.timestamp
        }]);
      
      if (error) {
        console.error("Supabase Error", error);
        throw new Error(`Supabase Error: ${error.message}`);
      }
      return true;
    }
  }

  public async getNotes(): Promise<HistoryItem[]> {
    if (this.currentType === StorageType.LOCAL) {
      const stored = localStorage.getItem('neuro_history');
      return stored ? JSON.parse(stored) : [];
    } else {
      if (!this.supabase) throw new Error("Supabase client not initialized");

      const { data, error } = await this.supabase
        .from('neuro_notes')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(50);

      if (error) {
         console.error("Supabase Fetch Error", error);
         throw new Error(`Failed to fetch from cloud: ${error.message}`);
      }
      
      return (data || []) as HistoryItem[];
    }
  }

  public async deleteNote(id: string): Promise<void> {
    if (this.currentType === StorageType.LOCAL) {
      const stored = localStorage.getItem('neuro_history');
      if (stored) {
        const history: HistoryItem[] = JSON.parse(stored);
        const updated = history.filter(h => h.id !== id);
        localStorage.setItem('neuro_history', JSON.stringify(updated));
      }
    } else {
      if (!this.supabase) throw new Error("Supabase client not initialized");
      
      const { error } = await this.supabase
        .from('neuro_notes')
        .delete()
        .eq('id', id);

      if (error) throw error;
    }
  }

  public async renameNote(id: string, newTopic: string): Promise<void> {
    if (this.currentType === StorageType.LOCAL) {
      const stored = localStorage.getItem('neuro_history');
      if (stored) {
        const history: HistoryItem[] = JSON.parse(stored);
        const updated = history.map(h => h.id === id ? { ...h, topic: newTopic } : h);
        localStorage.setItem('neuro_history', JSON.stringify(updated));
      }
    } else {
      if (!this.supabase) throw new Error("Supabase client not initialized");
      const { error } = await this.supabase
        .from('neuro_notes')
        .update({ topic: newTopic })
        .eq('id', id);
      if (error) throw error;
    }
  }

  /* --- SYLLABUS QUEUE METHODS --- */

  public async saveQueue(queue: SavedQueue): Promise<void> {
    // Currently only supporting Local Storage for Queues to keep complexity low for this feature
    // Can be expanded to Supabase table 'neuro_queues' later
    const stored = localStorage.getItem('neuro_saved_queues');
    const queues: SavedQueue[] = stored ? JSON.parse(stored) : [];
    
    // Check if exists, update if so
    const existingIndex = queues.findIndex(q => q.id === queue.id);
    if (existingIndex >= 0) {
      queues[existingIndex] = queue;
    } else {
      queues.unshift(queue);
    }
    
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

  public async renameQueue(id: string, newName: string): Promise<void> {
    const stored = localStorage.getItem('neuro_saved_queues');
    if (stored) {
      const queues: SavedQueue[] = JSON.parse(stored);
      const updated = queues.map(q => q.id === id ? { ...q, name: newName } : q);
      localStorage.setItem('neuro_saved_queues', JSON.stringify(updated));
    }
  }
}