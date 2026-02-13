
import { SyllabusItem, GenerationConfig, AIProvider, HistoryItem } from '../types';
import { generateDetailedStructure, generateNoteContent } from './geminiService';
import { generateDetailedStructureGroq, generateNoteContentGroq } from './groqService';
import { StorageService } from './storageService';

type UpdateCallback = (items: SyllabusItem[], isProcessing: boolean, circuitStatus?: string) => void;

const MAX_RETRIES = 3;
const BASE_DELAY = 2000;
const CIRCUIT_THRESHOLD = 3; // Consecutive failures to trip circuit

export class QueueService {
  private static instance: QueueService;
  private queue: SyllabusItem[] = [];
  private config: GenerationConfig | null = null;
  private isProcessing: boolean = false;
  private shouldStop: boolean = false;
  private listeners: UpdateCallback[] = [];
  private storage: StorageService;
  
  // Robustness State
  private consecutiveFailures: number = 0;
  private circuitOpen: boolean = false;

  private constructor() {
    this.storage = StorageService.getInstance();
  }

  public static getInstance(): QueueService {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService();
    }
    return QueueService.instance;
  }

  public subscribe(callback: UpdateCallback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  private notify() {
    const statusMsg = this.circuitOpen ? "CIRCUIT BREAKER ACTIVE (PAUSED)" : this.isProcessing ? "PROCESSING" : "IDLE";
    this.listeners.forEach(cb => cb([...this.queue], this.isProcessing, statusMsg));
  }

  public setQueue(items: SyllabusItem[]) {
    this.queue = items;
    this.notify();
  }

  public updateItemStructure(id: string, newStructure: string) {
    const idx = this.queue.findIndex(i => i.id === id);
    if (idx !== -1) {
      // If user manually updates structure, assume they approve it
      const updatedQueue = [...this.queue];
      updatedQueue[idx] = { 
        ...updatedQueue[idx], 
        structure: newStructure, 
        status: 'struct_ready' // Ready for Phase 2
      };
      this.queue = updatedQueue;
      this.notify();
      this.persistQueue();
    }
  }

  public approveItem(id: string) {
    // Manually force an item to be ready for Phase 2
    const idx = this.queue.findIndex(i => i.id === id);
    if (idx !== -1) {
        this.updateItemStatus(idx, 'struct_ready');
    }
  }

  public stop() {
    this.shouldStop = true;
    this.isProcessing = false;
    this.notify();
  }

  public resetCircuit() {
    this.circuitOpen = false;
    this.consecutiveFailures = 0;
    this.notify();
  }

  public async startProcessing(config: GenerationConfig) {
    if (this.isProcessing || this.circuitOpen) return;
    
    this.config = config;
    this.isProcessing = true;
    this.shouldStop = false;
    this.notify();

    try {
      while (!this.shouldStop && !this.circuitOpen) {
        // PRIORITY LOGIC:
        // 1. Find items that need Structure (Phase 1)
        // 2. Find items that need Content (Phase 2) - ONLY IF structure is ready
        
        // Strategy: We iterate linearly. If we hit a 'paused_for_review', we skip it.
        const nextItemIndex = this.queue.findIndex(
          item => 
             item.status === 'pending' || 
             item.status === 'error' ||
             (item.status === 'struct_ready' && (config.autoApprove || item.structure)) 
             // Note: 'paused_for_review' items are skipped until user approves them
        );

        if (nextItemIndex === -1) break; // Nothing actionable

        const item = this.queue[nextItemIndex];
        
        // If item is 'struct_ready' but autoApprove is OFF, we should only process it if it was explicitly approved (which sets it to struct_ready).
        // If it was just generated and waiting review, we need to mark it.
        
        await this.processItem(nextItemIndex);
        
        // Cooldown
        await new Promise(r => setTimeout(r, 1000));
      }
    } finally {
      this.isProcessing = false;
      this.notify();
    }
  }

  private async processItem(index: number) {
    if (!this.config || this.shouldStop) return;

    let item = this.queue[index];

    // --- PHASE 1: BLUEPRINTING (Structure) ---
    if (item.status === 'pending' || item.status === 'error') {
        
        // DUAL-ENGINE: Check if we have a specialized provider for structure
        // This splits rate limits.
        const structConfig = { ...this.config };
        
        // If structureProvider is set, override the provider in the config passed to generators
        // Note: The generator functions check config.structureModel internally if passed, 
        // but we need to route to the correct service function first.
        const activeProvider = this.config.structureProvider || this.config.provider;

        const success = await this.executeWithRetry(index, async () => {
            this.updateItemStatus(index, 'drafting_struct');
            
            let structure = '';
            
            // Route to correct service based on (Structure ProviderOverride OR Default Provider)
            if (activeProvider === AIProvider.GEMINI) {
               structure = await generateDetailedStructure(structConfig, item.topic);
            } else {
               structure = await generateDetailedStructureGroq(structConfig, item.topic);
            }
            return structure;
        });

        if (success) {
            // DECISION POINT: AUTO-APPROVE VS REVIEW
            if (this.config.autoApprove) {
                this.updateItemStatus(index, 'struct_ready', { structure: success, retryCount: 0 });
            } else {
                this.updateItemStatus(index, 'paused_for_review', { structure: success, retryCount: 0 });
                return; // STOP processing this item. Move to next.
            }
        } else {
            return; // Failed after retries
        }
    }

    // Refresh item reference after Phase 1 updates
    item = this.queue[index];

    // --- PHASE 2: MANUFACTURING (Content) ---
    // Content always uses the MAIN configured model (this.config.provider)
    if (item.status === 'struct_ready' && item.structure) {
        
        const success = await this.executeWithRetry(index, async () => {
            this.updateItemStatus(index, 'generating_note');
            
            let content = '';
            const noOp = () => {}; 
            
            if (this.config!.provider === AIProvider.GEMINI) {
               content = await generateNoteContent(this.config!, item.topic, item.structure!, [], noOp);
            } else {
               content = await generateNoteContentGroq(this.config!, item.topic, item.structure!, noOp);
            }
            return content;
        });

        if (success) {
            // Save Data
            const newNote: HistoryItem = {
                id: Date.now().toString(),
                timestamp: Date.now(),
                topic: item.topic,
                mode: this.config.mode,
                content: success,
                provider: this.config.provider,
                parentId: null,
                tags: ['Auto-Curriculum']
            };
            this.storage.saveNoteLocal(newNote);
            if (this.config.storageType === 'supabase' && this.storage.isCloudReady()) {
                try { await this.storage.uploadNoteToCloud(newNote); newNote._status = 'synced'; } catch(e){}
            }

            this.updateItemStatus(index, 'done', { retryCount: 0 });
        }
    }
  }

  // --- ROBUSTNESS ENGINE ---
  private async executeWithRetry<T>(index: number, operation: () => Promise<T>): Promise<T | null> {
      let attempts = 0;
      while (attempts < MAX_RETRIES && !this.shouldStop) {
          try {
              const result = await operation();
              this.consecutiveFailures = 0; // Reset circuit counter on success
              return result;
          } catch (e: any) {
              attempts++;
              console.warn(`Attempt ${attempts} failed for item ${index}:`, e);
              
              // Update status to show retry
              this.updateItemStatus(index, this.queue[index].status, { 
                  retryCount: attempts,
                  errorMsg: `Retry ${attempts}/${MAX_RETRIES}: ${e.message}` 
              });

              // Circuit Breaker Logic
              this.consecutiveFailures++;
              if (this.consecutiveFailures >= CIRCUIT_THRESHOLD) {
                  this.circuitOpen = true;
                  this.shouldStop = true;
                  this.updateItemStatus(index, 'error', { errorMsg: "Circuit Breaker Tripped. API Unstable." });
                  return null;
              }

              // Exponential Backoff
              const delay = BASE_DELAY * Math.pow(2, attempts);
              await new Promise(r => setTimeout(r, delay));
          }
      }
      
      // If we get here, all retries failed
      this.updateItemStatus(index, 'error', { errorMsg: "Max Retries Exceeded" });
      return null;
  }

  private updateItemStatus(index: number, status: SyllabusItem['status'], extra?: Partial<SyllabusItem>) {
    const newQueue = [...this.queue];
    newQueue[index] = { ...newQueue[index], status, ...extra };
    this.queue = newQueue;
    this.notify();
    this.persistQueue();
  }

  private persistQueue() {
      localStorage.setItem('neuro_syllabus_queue', JSON.stringify(this.queue));
  }
}
