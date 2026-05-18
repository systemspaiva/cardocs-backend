import { enableFirebaseTelemetry } from "@genkit-ai/firebase";
import { googleAI } from "@genkit-ai/google-genai";
import { genkit, type Part, z } from "genkit";
import {
  DraftInvoiceLineItem,
  InvoiceDocumentExtractionProvider,
  InvoiceDocumentInputWithDocument,
  InvoiceExtraction,
  InvoiceExtractionProvider,
  InvoiceTextInput
} from "../application/invoiceAnalysis.js";
import { ExternalProviderError } from "../application/errors.js";

const genkitInvoiceExtractionSchema = z.object({
  supplierName: z.string().nullable().optional(),
  serviceTitle: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  time: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  mileage: z.number().nullable().optional(),
  expenseKind: z.enum(["vehicleService", "partOrProduct", "unknown"]).nullable().optional(),
  confidence: z.number().int().min(0).max(100).nullable().optional(),
  lineItems: z.array(z.object({
    description: z.string().min(1),
    quantity: z.number().positive().nullable().optional(),
    unitAmount: z.number().positive().nullable().optional(),
    totalAmount: z.number().positive()
  })).default([])
});

const invoiceFlowBaseInputSchema = z.object({
  source: z.string(),
  displayName: z.string(),
  pageCount: z.number().int().nonnegative()
});

const invoiceTextFlowInputSchema = invoiceFlowBaseInputSchema.extend({
  ocrText: z.string()
});

const invoiceDocumentFlowInputSchema = invoiceFlowBaseInputSchema.extend({
  document: z.object({
    mimeType: z.string().min(1),
    base64Data: z.string().min(1)
  })
});

type GenkitInvoiceExtraction = z.infer<typeof genkitInvoiceExtractionSchema>;
type GenkitInvoiceTextFlowInput = z.infer<typeof invoiceTextFlowInputSchema>;
type GenkitInvoiceDocumentFlowInput = z.infer<typeof invoiceDocumentFlowInputSchema>;

let firebaseTelemetryState: "idle" | "starting" | "started" = "idle";
let firebaseTelemetryPromise: Promise<void> | null = null;

export class GenkitInvoiceExtractionProvider implements InvoiceExtractionProvider, InvoiceDocumentExtractionProvider {
  private readonly ai: ReturnType<typeof genkit>;
  private readonly extractTextFlow: (input: GenkitInvoiceTextFlowInput) => Promise<GenkitInvoiceExtraction>;
  private readonly extractDocumentFlow: (input: GenkitInvoiceDocumentFlowInput) => Promise<GenkitInvoiceExtraction>;
  private readonly telemetrySmokeFlow: () => Promise<{ ok: boolean }>;

  private constructor(
    apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number
  ) {
    void ensureGenkitMonitoringTelemetry();
    this.ai = genkit({
      plugins: [googleAI({ apiKey })],
      model: googleAI.model(model)
    });
    this.extractTextFlow = this.ai.defineFlow(
      {
        name: "extractInvoiceFromText",
        inputSchema: invoiceTextFlowInputSchema,
        outputSchema: genkitInvoiceExtractionSchema
      },
      async (input) => this.generateExtraction([{ text: buildTextPrompt(input) }])
    );
    this.extractDocumentFlow = this.ai.defineFlow(
      {
        name: "extractInvoiceFromDocument",
        inputSchema: invoiceDocumentFlowInputSchema,
        outputSchema: genkitInvoiceExtractionSchema
      },
      async (input) => this.generateExtraction([
        {
          media: {
            url: `data:${input.document.mimeType};base64,${input.document.base64Data}`,
            contentType: input.document.mimeType
          }
        },
        { text: buildDocumentPrompt(input) }
      ])
    );
    this.telemetrySmokeFlow = this.ai.defineFlow(
      {
        name: "cardocsBackendTelemetrySmoke",
        outputSchema: z.object({ ok: z.boolean() })
      },
      async () => {
        const response = await this.ai.generate({
          model: googleAI.model(this.model),
          prompt: "Responda somente com JSON valido: {\"ok\": true}",
          config: { temperature: 0 },
          output: { schema: z.object({ ok: z.boolean() }) }
        });
        response.assertValid();
        return response.output ?? { ok: true };
      }
    );
  }

  static fromEnvironment(): GenkitInvoiceExtractionProvider | null {
    const enabled = isEnabled(process.env.GENKIT_INVOICE_EXTRACTION_ENABLED ?? process.env.GEMINI_INVOICE_EXTRACTION_ENABLED);
    if (!enabled) return null;
    const apiKey = process.env.GOOGLE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    return new GenkitInvoiceExtractionProvider(
      apiKey,
      process.env.GENKIT_INVOICE_MODEL ?? process.env.GEMINI_INVOICE_MODEL ?? "gemini-3-flash-preview",
      parseTimeout(process.env.GENKIT_INVOICE_TIMEOUT_MS ?? process.env.GEMINI_INVOICE_TIMEOUT_MS)
    );
  }

  async extract(input: InvoiceTextInput): Promise<Partial<InvoiceExtraction>> {
    return toExtraction(await this.runWithTimeout(
      this.extractTextFlow(input),
      "Genkit excedeu o tempo limite de leitura da nota."
    ));
  }

  async extractFromDocument(input: InvoiceDocumentInputWithDocument): Promise<InvoiceExtraction> {
    return toExtraction(await this.runWithTimeout(
      this.extractDocumentFlow(input),
      "Genkit excedeu o tempo limite de leitura visual da nota."
    ));
  }

  async runTelemetrySmoke(): Promise<void> {
    await ensureGenkitMonitoringTelemetry();
    await this.runWithTimeout(
      this.telemetrySmokeFlow(),
      "Genkit excedeu o tempo limite do smoke de telemetria."
    );
  }

  private async generateExtraction(parts: Part[]): Promise<GenkitInvoiceExtraction> {
    await ensureGenkitMonitoringTelemetry();
    const response = await this.ai.generate({
      model: googleAI.model(this.model),
      prompt: parts,
      config: { temperature: 0 },
      output: { schema: genkitInvoiceExtractionSchema }
    });
    response.assertValid();
    const output = response.output;
    if (!output) {
      throw new ExternalProviderError("Genkit nao retornou extracao estruturada.");
    }

    return output;
  }

  private async runWithTimeout<T>(operation: Promise<T>, timeoutMessage: string): Promise<T> {
    try {
      return await withTimeout(operation, this.timeoutMs, timeoutMessage);
    } catch (error) {
      if (error instanceof ExternalProviderError) throw error;
      throw new ExternalProviderError("Genkit nao conseguiu ler essa nota fiscal.");
    }
  }
}

async function ensureGenkitMonitoringTelemetry(): Promise<void> {
  if (firebaseTelemetryState === "started") return;
  if (firebaseTelemetryPromise) return firebaseTelemetryPromise;
  firebaseTelemetryState = "starting";
  firebaseTelemetryPromise = enableFirebaseTelemetry({
    projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT,
    disableLoggingInputAndOutput: true
  }).then(() => {
    firebaseTelemetryState = "started";
  }).catch(() => {
    firebaseTelemetryState = "idle";
    firebaseTelemetryPromise = null;
    console.warn("genkit_firebase_telemetry_init_failed");
  });
  return firebaseTelemetryPromise;
}

function buildTextPrompt(input: GenkitInvoiceTextFlowInput): string {
  return [
    "Extraia dados de uma nota fiscal, cupom fiscal, recibo ou comprovante automotivo brasileiro.",
    "Use exclusivamente o texto de OCR fornecido. Nao invente fornecedor, data, hora, item, quilometragem ou valor.",
    "Se um campo nao estiver no OCR, retorne null ou lista vazia.",
    "Datas devem ficar em DD/MM/AAAA. Hora deve ficar em HH:mm. Valores monetarios devem ser numero decimal em BRL.",
    "Produtos e servicos devem refletir itens reais encontrados no OCR. Nao crie itens genericos.",
    "Voce deve analisar a natureza economica da nota e retornar expenseKind com exatamente um destes valores: vehicleService, partOrProduct ou unknown.",
    "Classifique expenseKind como vehicleService quando a nota for de servico executado no carro, mao de obra, oficina, troca, revisao, alinhamento ou instalacao.",
    "Classifique expenseKind como partOrProduct quando a nota for compra de peca, produto ou insumo sem evidencia de execucao do servico, como farol, pneu, oleo, filtro ou bateria vendidos no balcao.",
    "Classifique expenseKind como unknown quando a nota nao permitir concluir com seguranca se o valor representa mao de obra/servico ou apenas peca/produto.",
    `Origem: ${input.source}. Paginas: ${input.pageCount}.`,
    "OCR:",
    minimizeInvoiceOCRForAI(input.ocrText)
  ].join("\n");
}

function buildDocumentPrompt(input: GenkitInvoiceDocumentFlowInput): string {
  return [
    "Extraia dados de uma nota fiscal, cupom fiscal, recibo ou comprovante automotivo brasileiro olhando diretamente para a imagem ou PDF anexado.",
    "Nao use OCR externo e nao invente fornecedor, data, hora, item, quilometragem ou valor.",
    "Se um campo nao estiver visivel no documento, retorne null ou lista vazia.",
    "Procure a data em toda a pagina, inclusive rodape, canto inferior direito, cabecalho e area perto de QR code ou SAT.",
    "Datas devem ficar em DD/MM/AAAA. Hora deve ficar em HH:mm. Valores monetarios devem ser numero decimal em BRL.",
    "Produtos e servicos devem refletir itens reais visiveis no documento. Nao crie itens genericos.",
    "Voce deve analisar a natureza economica da nota e retornar expenseKind com exatamente um destes valores: vehicleService, partOrProduct ou unknown.",
    "Classifique expenseKind como vehicleService quando a nota for de servico executado no carro, mao de obra, oficina, troca, revisao, alinhamento ou instalacao.",
    "Classifique expenseKind como partOrProduct quando a nota for compra de peca, produto ou insumo sem evidencia de execucao do servico, como farol, pneu, oleo, filtro ou bateria vendidos no balcao.",
    "Classifique expenseKind como unknown quando a nota nao permitir concluir com seguranca se o valor representa mao de obra/servico ou apenas peca/produto.",
    `Origem: ${input.source}. Paginas informadas pelo app: ${input.pageCount}. Arquivo: ${input.displayName}.`
  ].join("\n");
}

function toExtraction(response: GenkitInvoiceExtraction): InvoiceExtraction {
  return {
    supplierName: response.supplierName ?? null,
    serviceTitle: response.serviceTitle ?? null,
    category: response.category ?? null,
    date: response.date ?? null,
    time: response.time ?? null,
    amount: response.amount ?? null,
    mileage: response.mileage ?? null,
    expenseKind: response.expenseKind ?? "unknown",
    confidence: response.confidence ?? 0,
    lineItems: response.lineItems.map(toLineItem)
  };
}

function toLineItem(item: GenkitInvoiceExtraction["lineItems"][number]): DraftInvoiceLineItem {
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

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutOperation = new Promise<T>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new ExternalProviderError(message)), timeoutMs);
  });

  return Promise.race([operation, timeoutOperation]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
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
