import { z } from "zod";
import {
  PartReplacementRecommendation,
  PartReplacementRecommendationProvider,
  PartReplacementRecommendationRequest
} from "../application/partReplacementRecommendation.js";
import { ExternalProviderError } from "../application/errors.js";

const geminiPartRecommendationSchema = z.object({
  partName: z.string().min(1).max(80),
  lifeKm: z.number().int().positive().max(500_000).nullable(),
  lifeMonths: z.number().int().positive().max(240).nullable(),
  confidence: z.number().int().min(0).max(100),
  rationale: z.string().min(1).max(240)
});

type GeminiPartRecommendationResponse = z.infer<typeof geminiPartRecommendationSchema>;

export class GeminiPartRecommendationProvider implements PartReplacementRecommendationProvider {
  private constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number
  ) {}

  static fromEnvironment(): GeminiPartRecommendationProvider | null {
    if (!isEnabled(process.env.GEMINI_PART_RECOMMENDATION_ENABLED)) return null;
    const apiKey = process.env.GOOGLE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    return new GeminiPartRecommendationProvider(
      apiKey,
      process.env.GEMINI_PART_RECOMMENDATION_MODEL ?? process.env.GEMINI_INVOICE_MODEL ?? "gemini-3-flash-preview",
      parseTimeout(process.env.GEMINI_PART_RECOMMENDATION_TIMEOUT_MS ?? process.env.GEMINI_INVOICE_TIMEOUT_MS)
    );
  }

  async recommend(input: PartReplacementRecommendationRequest): Promise<Partial<PartReplacementRecommendation>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    let response: Response;

    try {
      response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": this.apiKey
        },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [{ text: buildPrompt(input) }]
          }],
          generationConfig: responseGenerationConfig
        })
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new ExternalProviderError("Gemini excedeu o tempo limite para recomendar vida util da peca.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new ExternalProviderError(`Gemini retornou erro ${response.status}.`);
    }

    const payload = await response.json() as GeminiGenerateContentResponse;
    const text = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();

    if (!text) {
      throw new ExternalProviderError("Gemini nao retornou recomendacao estruturada.");
    }

    return toRecommendation(geminiPartRecommendationSchema.parse(JSON.parse(text)));
  }
}

const responseGenerationConfig = {
  temperature: 0.15,
  responseMimeType: "application/json",
  responseSchema: {
    type: "object",
    properties: {
      partName: { type: "string" },
      lifeKm: { type: "integer", nullable: true, minimum: 1, maximum: 500000 },
      lifeMonths: { type: "integer", nullable: true, minimum: 1, maximum: 240 },
      confidence: { type: "integer", minimum: 0, maximum: 100 },
      rationale: { type: "string" }
    },
    required: ["partName", "lifeKm", "lifeMonths", "confidence", "rationale"]
  }
};

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

function buildPrompt(input: PartReplacementRecommendationRequest): string {
  return [
    "Voce e um assistente automotivo para manutencao preventiva no Brasil.",
    "Receba o nome de uma peca ou servico e recomende vida util estimada para acompanhamento pessoal.",
    "Nao afirme que e recomendacao oficial do fabricante. Seja conservador.",
    "Use null quando quilometragem ou meses nao fizer sentido para a peca.",
    "Responda somente JSON no schema solicitado.",
    `Servico ou peca: ${sanitizePartName(input.partName)}`
  ].join("\n");
}

function toRecommendation(response: GeminiPartRecommendationResponse): Partial<PartReplacementRecommendation> {
  return {
    partName: response.partName,
    lifeKm: response.lifeKm,
    lifeMonths: response.lifeMonths,
    confidence: response.confidence,
    rationale: response.rationale,
    source: "ai"
  };
}

function sanitizePartName(value: string): string {
  return value
    .replace(/[^\p{L}\p{N}\s/.-]/gu, " ")
    .split(/\s+/)
    .join(" ")
    .trim()
    .slice(0, 80);
}

function isEnabled(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

function parseTimeout(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1000 && parsed <= 30000 ? parsed : 12000;
}
