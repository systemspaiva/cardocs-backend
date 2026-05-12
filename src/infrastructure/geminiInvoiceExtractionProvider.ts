import { z } from "zod";
import {
  DraftInvoiceLineItem,
  InvoiceDocumentExtractionProvider,
  InvoiceDocumentInputWithDocument,
  InvoiceExtraction,
  InvoiceExtractionProvider,
  InvoiceTextInput
} from "../application/invoiceAnalysis.js";
import { ExternalProviderError } from "../application/errors.js";

const geminiExtractionSchema = z.object({
  supplierName: z.string().nullable().optional(),
  serviceTitle: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  time: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  mileage: z.number().nullable().optional(),
  confidence: z.number().int().min(0).max(100).nullable().optional(),
  lineItems: z.array(z.object({
    description: z.string().min(1),
    quantity: z.number().positive().nullable().optional(),
    unitAmount: z.number().positive().nullable().optional(),
    totalAmount: z.number().positive()
  })).default([])
});

type GeminiExtractionResponse = z.infer<typeof geminiExtractionSchema>;

export class GeminiInvoiceExtractionProvider implements InvoiceExtractionProvider, InvoiceDocumentExtractionProvider {
  private constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number
  ) {}

  static fromEnvironment(): GeminiInvoiceExtractionProvider | null {
    if (!isEnabled(process.env.GEMINI_INVOICE_EXTRACTION_ENABLED)) return null;
    const apiKey = process.env.GOOGLE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    return new GeminiInvoiceExtractionProvider(
      apiKey,
      process.env.GEMINI_INVOICE_MODEL ?? "gemini-3-flash-preview",
      parseTimeout(process.env.GEMINI_INVOICE_TIMEOUT_MS)
    );
  }

  async extract(input: InvoiceTextInput): Promise<Partial<InvoiceExtraction>> {
    return this.generateExtraction(
      [{ text: buildTextPrompt(input) }],
      "Gemini excedeu o tempo limite de leitura da nota."
    );
  }

  async extractFromDocument(input: InvoiceDocumentInputWithDocument): Promise<InvoiceExtraction> {
    return this.generateExtraction(
      [
        {
          inline_data: {
            mime_type: input.document.mimeType,
            data: input.document.base64Data
          }
        },
        { text: buildDocumentPrompt(input) }
      ],
      "Gemini excedeu o tempo limite de leitura visual da nota."
    );
  }

  private async generateExtraction(
    parts: GeminiContentPart[],
    timeoutMessage: string
  ): Promise<InvoiceExtraction> {
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
            parts
          }],
          generationConfig: responseGenerationConfig
        })
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new ExternalProviderError(timeoutMessage);
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
      throw new ExternalProviderError("Gemini nao retornou extracao estruturada.");
    }

    return toExtraction(geminiExtractionSchema.parse(JSON.parse(text)));
  }
}

type GeminiContentPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

const responseGenerationConfig = {
  temperature: 0,
  responseMimeType: "application/json",
  responseSchema: {
    type: "object",
    properties: {
      supplierName: { type: "string", nullable: true },
      serviceTitle: { type: "string", nullable: true },
      category: { type: "string", nullable: true },
      date: { type: "string", nullable: true },
      time: { type: "string", nullable: true },
      amount: { type: "number", nullable: true },
      mileage: { type: "number", nullable: true },
      confidence: { type: "integer", minimum: 0, maximum: 100 },
      lineItems: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            quantity: { type: "number", nullable: true },
            unitAmount: { type: "number", nullable: true },
            totalAmount: { type: "number" }
          },
          required: ["description", "totalAmount"]
        }
      }
    },
    required: ["supplierName", "serviceTitle", "category", "date", "time", "amount", "mileage", "confidence", "lineItems"]
  }
};

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

function buildTextPrompt(input: InvoiceTextInput): string {
  return [
    "Extraia dados de uma nota fiscal, cupom fiscal, recibo ou comprovante automotivo brasileiro.",
    "Use exclusivamente o texto de OCR fornecido. Nao invente fornecedor, data, hora, item, quilometragem ou valor.",
    "Se um campo nao estiver no OCR, retorne null ou lista vazia.",
    "Datas devem ficar em DD/MM/AAAA. Hora deve ficar em HH:mm. Valores monetarios devem ser numero decimal em BRL.",
    "Produtos e servicos devem refletir itens reais encontrados no OCR. Nao crie itens genericos.",
    `Origem: ${input.source}. Paginas: ${input.pageCount}.`,
    "OCR:",
    minimizeInvoiceOCRForAI(input.ocrText)
  ].join("\n");
}

function buildDocumentPrompt(input: InvoiceDocumentInputWithDocument): string {
  return [
    "Extraia dados de uma nota fiscal, cupom fiscal, recibo ou comprovante automotivo brasileiro olhando diretamente para a imagem ou PDF anexado.",
    "Nao use OCR externo e nao invente fornecedor, data, hora, item, quilometragem ou valor.",
    "Se um campo nao estiver visivel no documento, retorne null ou lista vazia.",
    "Procure a data em toda a pagina, inclusive rodape, canto inferior direito, cabecalho e area perto de QR code ou SAT.",
    "Datas devem ficar em DD/MM/AAAA. Hora deve ficar em HH:mm. Valores monetarios devem ser numero decimal em BRL.",
    "Produtos e servicos devem refletir itens reais visiveis no documento. Nao crie itens genericos.",
    `Origem: ${input.source}. Paginas informadas pelo app: ${input.pageCount}. Arquivo: ${input.displayName}.`
  ].join("\n");
}

function toExtraction(response: GeminiExtractionResponse): InvoiceExtraction {
  return {
    supplierName: response.supplierName ?? null,
    serviceTitle: response.serviceTitle ?? null,
    category: response.category ?? null,
    date: response.date ?? null,
    time: response.time ?? null,
    amount: response.amount ?? null,
    mileage: response.mileage ?? null,
    confidence: response.confidence ?? 0,
    lineItems: response.lineItems.map(toLineItem)
  };
}

function toLineItem(item: GeminiExtractionResponse["lineItems"][number]): DraftInvoiceLineItem {
  return {
    description: item.description,
    quantity: item.quantity ?? null,
    unitAmount: item.unitAmount ?? null,
    totalAmount: item.totalAmount
  };
}

function isEnabled(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

function parseTimeout(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1000 && parsed <= 30000 ? parsed : 30000;
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/\b(?:\d[\s.-]?){44}\b/g, "[CHAVE_ACESSO_REDACTED]")
    .replace(/\b[A-HJ-NPR-Z0-9]{17}\b/gi, "[CHASSI_REDACTED]")
    .replace(/\b[A-Z]{3}[-\s]?\d[A-Z0-9]\d{2}\b/gi, "[PLACA_REDACTED]")
    .replace(/\b(?:renavam|ie|inscricao estadual|inscri[cç][aã]o estadual)\s*[:.-]?\s*[A-Z0-9./-]+\b/gi, "[DOCUMENTO_REDACTED]")
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[CNPJ_REDACTED]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF_REDACTED]")
    .replace(/\b\d{5}-?\d{3}\b/g, "[CEP_REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL_REDACTED]")
    .replace(/\b(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}\b/g, "[TELEFONE_REDACTED]");
}

function minimizeInvoiceOCRForAI(value: string): string {
  const fiscalLines: string[] = [];

  for (const rawLine of value.split("\n")) {
    const line = redactSensitiveText(rawLine).replace(/\s+/g, " ").trim();
    if (!line || shouldDropSensitiveLine(line)) continue;

    if (isFiscalEvidenceLine(line)) {
      fiscalLines.push(sanitizeFiscalEvidenceLine(line));
    }
  }

  return fiscalLines.join("\n").slice(0, 60000);
}

function isFiscalEvidenceLine(line: string): boolean {
  return /(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2}/.test(line) ||
    /\b[0-3]?\d[\/.-][01]?\d[\/.-](?:20)?\d{2}\b/.test(line) ||
    /\b[0-2]?\d:[0-5]\d\b/.test(line) ||
    /(valor\s+total|total\s+(da\s+)?nota|total\s+a\s+pagar|produto|servi[cç]o|qtde?|qtd|un|oleo|filtro|pneu|freio|pastilha|bateria|alinhamento|balanceamento|revis[aã]o|manuten[cç][aã]o|oficina|auto center|mecanica|mec[aâ]nica|pe[cç]a|ipva|licenciamento)/i.test(line);
}

function sanitizeFiscalEvidenceLine(line: string): string {
  if (/(valor\s+total|total\s+(da\s+)?nota|total\s+a\s+pagar|data|emiss[aã]o|hora|produto|servi[cç]o|qtde?|qtd|un|oleo|filtro|pneu|freio|pastilha|bateria|alinhamento|balanceamento|revis[aã]o|manuten[cç][aã]o|oficina|auto center|mecanica|mec[aâ]nica|pe[cç]a|ipva|licenciamento)/i.test(line)) {
    return line;
  }

  const preserved = [
    ...line.matchAll(/(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2}/g),
    ...line.matchAll(/\b[0-3]?\d[\/.-][01]?\d[\/.-](?:20)?\d{2}\b/g),
    ...line.matchAll(/\b[0-2]?\d:[0-5]\d\b/g)
  ].map((match) => match[0]);

  return ["ITEM", ...preserved].join(" ");
}

function shouldDropSensitiveLine(line: string): boolean {
  return /(endere[cç]o|logradouro|rua\b|avenida|av\.|bairro|cidade|municipio|município|cep|fone|telefone|email|e-mail|consumidor|cliente|destinatario|destinatário|cpf|cnpj|chassi|renavam|placa|inscri[cç][aã]o estadual|\[CHAVE_ACESSO_REDACTED\]|\[CPF_REDACTED\]|\[CNPJ_REDACTED\]|\[CEP_REDACTED\]|\[EMAIL_REDACTED\]|\[TELEFONE_REDACTED\]|\[PLACA_REDACTED\]|\[CHASSI_REDACTED\]|\[DOCUMENTO_REDACTED\])/i.test(line);
}
