
import { GoogleGenAI } from "@google/genai";
import { GenerationConfig, UploadedFile, SyllabusItem } from '../types';
import { getStrictPrompt, UNIVERSAL_STRUCTURE_PROMPT } from '../utils/prompts';
import { processGeneratedNote } from '../utils/formatter';

// Helper to get authenticated AI instance
const getAIClient = (config: GenerationConfig) => {
  const apiKey = config.apiKey || process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing. Please unlock with your NeuroKey Card or check Settings.");
  }
  return new GoogleGenAI({ apiKey });
};

export const generateNoteContent = async (
  config: GenerationConfig,
  topic: string,
  structure: string,
  files: UploadedFile[],
  onProgress: (status: string) => void
): Promise<string> => {
  
  onProgress("Checking configurations...");
  const ai = getAIClient(config);
  const modelName = config.model;

  onProgress(`Connecting to ${modelName} in ${config.mode.toUpperCase()} mode...`);

  try {
    const textPrompt = getStrictPrompt(topic, structure, config.mode, config.customContentPrompt);
    
    const parts: any[] = [{ text: textPrompt }];

    if (files && files.length > 0) {
      onProgress(`Processing ${files.length} attachment(s)...`);
      files.forEach(file => {
        parts.push({
          inlineData: {
            mimeType: file.mimeType,
            data: file.data
          }
        });
      });
    }

    onProgress("Synthesizing content (High Context Mode)...");
    
    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts },
      config: {
        temperature: config.temperature,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 65536, 
      }
    });

    const rawText = response.text;

    if (!rawText) {
      throw new Error("Received empty response from AI.");
    }

    onProgress("Formatting & Cleaning Mermaid syntax...");
    const finalContent = processGeneratedNote(rawText);

    return finalContent;

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    if (error.message?.includes("429")) {
      throw new Error("Quota Exceeded (429). Please wait a moment.");
    }
    // Handle 404 specifically for clearer UX
    if (error.message?.includes("404")) {
       throw new Error(`Model not found (404). The model '${config.model}' may not be available in your account/region or the API Key is invalid.`);
    }
    throw error;
  }
};

/* -------------------------------------------------------------------------- */
/*                    AUTO-STRUCTURE GENERATOR                                */
/* -------------------------------------------------------------------------- */

export const generateDetailedStructure = async (
  config: GenerationConfig,
  topic: string
): Promise<string> => {
  const ai = getAIClient(config);
  // Use config.structureModel if available, else standard config.model
  const modelName = config.structureModel || (config.model.includes('gemini') ? config.model : 'gemini-2.5-flash');

  try {
    const systemPrompt = config.customStructurePrompt || UNIVERSAL_STRUCTURE_PROMPT;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [{ text: `${systemPrompt}\n\nINPUT TOPIC: ${topic}` }]
      },
      config: { temperature: 0.3 }
    });

    return response.text || "";
  } catch (e: any) {
    console.error("Structure Auto-Gen Error", e);
    throw new Error("Failed to auto-generate structure: " + e.message);
  }
};

/* -------------------------------------------------------------------------- */
/*                             SYLLABUS PARSERS                               */
/* -------------------------------------------------------------------------- */

const SYLLABUS_PROMPT = `
  TASK: Analyze the provided Syllabus content (Text/JSON/PDF).
  GOAL: Extract a logical, sequential learning path of specific medical topics.
  RETURN JSON STRING ARRAY ONLY.
`;

export const parseSyllabusToTopics = async (
  config: GenerationConfig,
  file: UploadedFile
): Promise<SyllabusItem[]> => {
  const ai = getAIClient(config);
  // Use config.model if it seems valid for Gemini
  const modelName = config.model.includes('gemini') ? config.model : 'gemini-2.5-flash';

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          { text: SYLLABUS_PROMPT },
          {
            inlineData: {
              mimeType: file.mimeType,
              data: file.data
            }
          }
        ]
      },
      config: {
        temperature: 0.2, 
        responseMimeType: "application/json"
      }
    });

    const text = response.text || "[]";
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const topics: string[] = JSON.parse(cleanJson);

    return topics.map((t, index) => ({
      id: `topic-${Date.now()}-${index}`,
      topic: t,
      status: 'pending'
    }));

  } catch (e: any) {
    console.error("Syllabus Parsing Error", e);
    throw new Error("Failed to parse syllabus file.");
  }
};

export const parseSyllabusFromText = async (
  config: GenerationConfig,
  rawText: string
): Promise<SyllabusItem[]> => {
  const ai = getAIClient(config);
  const modelName = config.model.includes('gemini') ? config.model : 'gemini-2.5-flash';

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [{ text: `${SYLLABUS_PROMPT}\n\nINPUT TEXT:\n${rawText}` }]
      },
      config: {
        temperature: 0.2, 
        responseMimeType: "application/json"
      }
    });

    const text = response.text || "[]";
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const topics: string[] = JSON.parse(cleanJson);

    return topics.map((t, index) => ({
      id: `topic-${Date.now()}-${index}`,
      topic: t,
      status: 'pending'
    }));

  } catch (e: any) {
    console.error("Syllabus Text Parsing Error", e);
    throw new Error("Failed to parse syllabus text.");
  }
};
