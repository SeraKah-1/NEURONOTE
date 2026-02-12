
export enum AIProvider {
  GEMINI = 'gemini',
  GROQ = 'groq'
}

export enum AppModel {
  // --- GEMINI MODELS (Deep Reasoning & Multimodal) ---
  GEMINI_3_PRO = 'gemini-3-pro-preview',         // Top Tier Reasoning
  GEMINI_3_FLASH = 'gemini-3-flash-preview',     // Balanced
  GEMINI_2_5_PRO = 'gemini-2.5-pro',             // Stable High Intelligence
  GEMINI_2_5_FLASH = 'gemini-2.5-flash',         // Fast Production
  GEMINI_2_5_FLASH_LITE = 'gemini-2.5-flash-lite', // Cost Effective
  GEMINI_1_5_PRO = 'gemini-1.5-pro',             // Legacy High Context
  GEMINI_1_5_FLASH = 'gemini-1.5-flash',         // Legacy Fast

  // --- GROQ MODELS (Extreme Speed LPU) ---
  GROQ_LLAMA_4_MAVERICK_17B = 'meta-llama/llama-4-maverick-17b-128e-instruct', // CORRECTED SLUG
  GROQ_LLAMA_3_3_70B = 'llama-3.3-70b-versatile', // Best Open Source Overall
  GROQ_LLAMA_3_1_8B = 'llama-3.1-8b-instant',     // Fastest
  GROQ_MIXTRAL_8X7B = 'mixtral-8x7b-32768',       // High Context
  GROQ_GEMMA2_9B = 'gemma2-9b-it'                 // Google Efficient
}

export enum NoteMode {
  GENERAL = 'general',
  CHEAT_CODES = 'cheat_codes',
  FIRST_PRINCIPLES = 'principles',
  VISUALIZER = 'visualizer', // NEW MODE
  CUSTOM = 'custom'
}

export enum StorageType {
  LOCAL = 'local',
  SUPABASE = 'supabase'
}

export enum AppView {
  WORKSPACE = 'workspace',
  SETTINGS = 'settings',
  ARCHIVE = 'archive',
  SYLLABUS = 'syllabus',
  GRAPH = 'graph'
}

export interface UploadedFile {
  name: string;
  mimeType: string;
  data: string; // Base64
}

export interface Folder {
  id: string;
  name: string;
  timestamp: number;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  topic: string;
  mode: NoteMode;
  content: string;
  provider: AIProvider;
  parentId?: string | null; // For threading/continuations
  tags?: string[];
  _status?: 'local' | 'cloud' | 'synced';
  folderId?: string | null; 
}

export interface NoteData {
  topic: string;
  files: UploadedFile[];
  structure: string;
}

export interface GenerationConfig {
  provider: AIProvider;
  model: AppModel | string; // Allow string for flexibility
  temperature: number;
  apiKey: string;
  groqApiKey: string;
  mode: NoteMode;
  storageType: StorageType;
  supabaseUrl: string;
  supabaseKey: string;
  autoApprove: boolean; // Toggle for Human-in-the-Loop
  
  // --- BATCH ENGINE ADVANCED CONFIG ---
  structureProvider?: AIProvider; // Specific provider for Phase 1
  structureModel?: string;        // Specific model for Phase 1
  customStructurePrompt?: string; // Override system instruction for Phase 1
  customContentPrompt?: string;   // Append instruction for Phase 2
}

export interface AppState {
  isLoading: boolean;
  generatedContent: string | null;
  error: string | null;
  progressStep: string;
  currentView: AppView;
  activeNoteId: string | null;
}

export const MODE_STRUCTURES: Record<NoteMode, string> = {
  [NoteMode.GENERAL]: `# 1. Definition & Core Concept
# 2. Pathophysiology (Mechanism)
# 3. Clinical Presentation
# 4. Diagnostic Workup
# 5. Management & Treatment
# 6. Prognosis`,
  [NoteMode.CHEAT_CODES]: `# 1. High-Yield Facts
# 2. Mnemonics
# 3. Must-Know Associations
# 4. Exam Pitfalls
# 5. Rapid Tables`,
  [NoteMode.FIRST_PRINCIPLES]: `# 1. Molecular Origin
# 2. Cellular Mechanism
# 3. Tissue/Organ Impact
# 4. Systemic Manifestation
# 5. Why the Treatment Works`,
  [NoteMode.VISUALIZER]: `# 1. Concept Map (Mindmap)
# 2. Process Flow (Flowchart)
# 3. Structural Relations (Graph)
# 4. Timeline / Sequence
# 5. Visual Summary`,
  [NoteMode.CUSTOM]: `# Custom Structure`
};

export type SyllabusStatus = 
  'pending' | 
  'drafting_struct' | 
  'struct_ready' | // Paused here if autoApprove is false
  'generating_note' | 
  'done' | 
  'error' | 
  'active' |
  'paused_for_review'; // Explicit pause state

export interface SyllabusItem {
  id: string;
  topic: string;
  status: SyllabusStatus;
  structure?: string; // Cached structure from Phase 1
  errorMsg?: string;
  retryCount?: number; // Robustness tracking
}

export interface SavedQueue {
  id: string;
  name: string;
  items: SyllabusItem[];
  timestamp: number;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface NeuroKeyFile {
  version: string;
  meta: {
    issuedTo: string;
    issuedAt: number;
    issuer: string;
  };
  security: {
    iv: string;
    salt: string;
    data: string;
  };
}

export interface EncryptedPayload {
  geminiKey?: string;
  groqKey?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
}
