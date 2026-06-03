import { GoogleAuth, IdTokenClient } from "google-auth-library";
import { AppError, ExternalProviderError, ProviderNotConfiguredError } from "../application/errors.js";
import {
  AutomotiveChatRequest,
  AutomotiveChatStreamEvent,
  AutomotiveChatStreamOptions,
  CardocsIaGateway,
  PartLifeSuggestionRequest,
  PartLifeSuggestionResponse,
  PartReplacementRecommendation,
  PartReplacementRecommendationRequest,
  ResaleDossierAiResponse,
  ResaleDossierGenerationInput
} from "../application/cardocsIaGateway.js";
import { buildInvoiceScanDraft, InvoiceExtraction } from "../application/invoiceDraftBuilder.js";
import {
  InvoiceDocumentInput,
  InvoiceScanDraft
} from "../domain/models.js";

interface ErrorPayload {
  error?: string;
  message?: string;
}

export class CardocsIaClient implements CardocsIaGateway {
  private readonly auth = new GoogleAuth();
  private idTokenClientPromise: Promise<IdTokenClient> | null = null;

  private constructor(
    private readonly baseURL: string,
    private readonly timeoutMs: number
  ) {}

  static fromEnvironment(): CardocsIaClient | null {
    const baseURL = process.env.CARDOCS_IA_BASE_URL?.trim();
    if (!baseURL) return null;
    return new CardocsIaClient(
      baseURL.replace(/\/+$/, ""),
      parseTimeout(process.env.CARDOCS_IA_TIMEOUT_MS, 120000)
    );
  }

  async analyzeInvoice(input: InvoiceDocumentInput): Promise<InvoiceScanDraft> {
    if (!input.document) {
      throw new AppError("Documento da nota fiscal obrigatorio.", 400, "validation_error");
    }
    const extraction = await this.post<InvoiceExtraction>("/internal/v1/invoices/extract", {
      source: input.source,
      displayName: input.displayName,
      pageCount: input.pageCount,
      document: input.document
    });

    const partLifeSuggestions = await this.fetchPartLifeSuggestions(extraction);
    return buildInvoiceScanDraft(extraction, input, partLifeSuggestions);
  }

  // Best-effort: a quebra do enrich nunca derruba a leitura da NF; sempre
  // retornamos algum draft mesmo quando a IA de vida útil estiver indisponível.
  private async fetchPartLifeSuggestions(extraction: InvoiceExtraction) {
    const allowedKinds = new Set(["vehicleService", "partOrProduct"]);
    if (!allowedKinds.has(extraction.expenseKind)) return [];
    if (!extraction.items || extraction.items.length === 0) return [];

    try {
      const response = await this.suggestPartLife({
        items: extraction.items
          .map((item) => ({
            description: item.description,
            quantity: typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : null
          }))
          .filter((item) => item.description && item.description.trim().length > 0),
        context: {
          expenseKind: extraction.expenseKind as "vehicleService" | "partOrProduct"
        }
      });
      return response.recommendations.map((rec) => ({
        partName: rec.partName,
        lifeKm: rec.lifeKm,
        lifeMonths: rec.lifeMonths,
        confidence: rec.confidence,
        rationale: rec.rationale,
        sourceDescriptions: rec.sourceDescriptions ?? [],
        expectedQuantity: rec.expectedQuantity ?? null,
        detectedQuantity: rec.detectedQuantity ?? null,
        scope: rec.scope ?? null
      }));
    } catch (error) {
      console.warn(JSON.stringify({
        severity: "WARNING",
        message: "part_life_enrichment_failed",
        errorName: error instanceof Error ? error.name : "unknown"
      }));
      return [];
    }
  }

  async recommendPartReplacement(input: PartReplacementRecommendationRequest): Promise<PartReplacementRecommendation> {
    return this.post("/internal/v1/parts/recommendation", input);
  }

  async suggestPartLife(input: PartLifeSuggestionRequest): Promise<PartLifeSuggestionResponse> {
    return this.post("/internal/v1/parts/life-suggestions", input);
  }

  async generateResaleDossier(input: ResaleDossierGenerationInput): Promise<ResaleDossierAiResponse> {
    return this.post("/internal/v1/resale-dossiers/generate", sanitizeResaleDossierGenerationInput(input));
  }

  async *streamAutomotiveChat(
    input: AutomotiveChatRequest,
    options: AutomotiveChatStreamOptions = {}
  ): AsyncIterable<AutomotiveChatStreamEvent> {
    for await (const event of this.postStream("/internal/v1/chat/stream", input, options)) {
      yield event;
    }
  }

  private async post<T>(path: string, body: unknown, timeoutMs = this.timeoutMs): Promise<T> {
    const url = `${this.baseURL}${path}`;
    if (isLocalURL(this.baseURL)) {
      return this.fetchLocal<T>(url, body, timeoutMs);
    }

    try {
      const client = await this.idTokenClient();
      const response = await client.request<T>({
        url,
        method: "POST",
        data: body,
        headers: { "content-type": "application/json" },
        timeout: timeoutMs
      });
      return response.data;
    } catch (error) {
      const response = (error as { response?: { status?: number; data?: ErrorPayload } }).response;
      if (response?.status) {
        throw toAppError(response.status, response.data);
      }
      throw new ExternalProviderError("Backend de IA indisponivel.");
    }
  }

  private async fetchLocal<T>(url: string, body: unknown, timeoutMs: number): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await parseJSON(response);
      if (!response.ok) {
        throw toAppError(response.status, payload as ErrorPayload);
      }
      return payload as T;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ExternalProviderError("Backend de IA indisponivel.");
    } finally {
      clearTimeout(timeout);
    }
  }

  private async *postStream(
    path: string,
    body: unknown,
    options: AutomotiveChatStreamOptions
  ): AsyncIterable<AutomotiveChatStreamEvent> {
    const url = `${this.baseURL}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    let receivedDone = false;

    try {
      const response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: await this.streamHeaders(url),
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw toAppError(response.status, await parseErrorPayload(response));
      }

      if (!response.body) {
        throw new ExternalProviderError("Backend de IA nao retornou stream.");
      }

      for await (const event of readSseEvents(response.body)) {
        if (event.event === "delta") {
          const payload = parseStreamPayload<{ type?: string; text?: string }>(event.data);
          if (typeof payload.text === "string" && payload.text.length > 0) {
            yield { type: "delta", text: payload.text };
          }
          continue;
        }

        if (event.event === "reference") {
          const payload = parseStreamPayload<AutomotiveChatStreamEvent>(event.data);
          if (payload.type === "reference") {
            yield payload;
          }
          continue;
        }

        if (event.event === "done") {
          const payload = parseStreamPayload<{ type?: string; scope?: "automotive" | "out_of_scope" }>(event.data);
          receivedDone = true;
          yield {
            type: "done",
            scope: payload.scope === "out_of_scope" ? "out_of_scope" : "automotive"
          };
          return;
        }

        if (event.event === "error") {
          throw new ExternalProviderError("Backend de IA nao conseguiu processar o chat.");
        }
      }

      if (!receivedDone) {
        throw new ExternalProviderError("Backend de IA encerrou o stream antes de concluir a resposta.");
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ExternalProviderError("Backend de IA indisponivel.");
    } finally {
      options.signal?.removeEventListener("abort", abort);
      clearTimeout(timeout);
    }
  }

  private async streamHeaders(url: string): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "accept": "text/event-stream",
      "content-type": "application/json"
    };

    if (isLocalURL(this.baseURL)) return headers;

    const client = await this.idTokenClient();
    const authHeaders = await client.getRequestHeaders(url);
    authHeaders.forEach((value, key) => {
      headers[key] = value;
    });
    return headers;
  }

  private idTokenClient(): Promise<IdTokenClient> {
    if (!this.idTokenClientPromise) {
      this.idTokenClientPromise = this.auth.getIdTokenClient(this.baseURL);
    }
    return this.idTokenClientPromise;
  }
}

function sanitizeResaleDossierGenerationInput(input: ResaleDossierGenerationInput) {
  const garage = input.garage;
  const vehicle = garage.vehicle;
  return {
    trigger: input.trigger,
    vehicle: {
      kind: vehicle.kind,
      brand: vehicle.brand,
      model: vehicle.model,
      year: vehicle.year,
      color: vehicle.color,
      mileage: vehicle.mileage,
      statusTags: vehicle.statusTags,
      fipe: vehicle.fipe,
      details: vehicle.details ? {
        fuel: vehicle.details.fuel,
        engineDisplacement: vehicle.details.engineDisplacement,
        vehicleType: vehicle.details.vehicleType,
        segment: vehicle.details.segment,
        subSegment: vehicle.details.subSegment,
        bodyType: vehicle.details.bodyType,
        origin: vehicle.details.origin
      } : null
    },
    garage: {
      investment: garage.investment,
      timeline: garage.timeline.slice(0, 80).map((record) => ({
        date: record.date,
        amount: record.amount,
        isAIValidated: record.isAIValidated,
        serviceTitle: record.serviceTitle ?? null,
        expenseKind: record.expenseKind ?? null
      })),
      vaultDocuments: garage.vaultDocuments.slice(0, 80).map((document) => ({
        date: document.date,
        amount: document.amount,
        status: document.status,
        kind: document.kind ?? null,
        checklistKind: document.checklistKind ?? null,
        documentType: document.documentType ?? null,
        serviceTitle: document.serviceTitle ?? null,
        expenseKind: document.expenseKind ?? null,
        lineItems: (document.lineItems ?? []).slice(0, 50).map((item) => ({
          quantity: item.quantity ?? null,
          unitAmount: item.unitAmount ?? null,
          totalAmount: item.totalAmount
        }))
      })),
      insurance: garage.insurance ? {
        premiumAmount: garage.insurance.premiumAmount,
        premiumPeriod: garage.insurance.premiumPeriod,
        deductibleAmount: garage.insurance.deductibleAmount ?? null,
        validUntil: garage.insurance.validUntil
      } : null,
      partReplacements: garage.partReplacements.slice(0, 120).map((replacement) => ({
        partName: replacement.partName,
        brandName: replacement.brandName ?? null,
        serviceDate: replacement.serviceDate,
        amount: replacement.amount,
        mileageAtService: replacement.mileageAtService,
        lifeKm: replacement.lifeKm ?? null,
        lifeMonths: replacement.lifeMonths ?? null,
        scheduledRevisionMileage: replacement.scheduledRevisionMileage ?? null,
        scheduledRevisionWorkshopKind: replacement.scheduledRevisionWorkshopKind ?? null,
        quantity: replacement.quantity ?? null,
        expectedQuantity: replacement.expectedQuantity ?? null,
        position: replacement.position ?? null
      }))
    }
  };
}

function isLocalURL(value: string): boolean {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    throw new ProviderNotConfiguredError("CARDOCS_IA_BASE_URL invalida.");
  }
}

async function parseJSON(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

async function parseErrorPayload(response: Response): Promise<ErrorPayload | undefined> {
  const payload = await parseJSON(response);
  return payload && typeof payload === "object" ? payload as ErrorPayload : undefined;
}

interface SseEvent {
  event: string;
  data: string;
}

async function* readSseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, "\n");

    let boundaryIndex = buffer.indexOf("\n\n");
    while (boundaryIndex >= 0) {
      const rawEvent = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);
      const event = parseSseEvent(rawEvent);
      if (event) yield event;
      boundaryIndex = buffer.indexOf("\n\n");
    }
  }

  buffer += decoder.decode();
  const event = parseSseEvent(buffer.replace(/\r\n/g, "\n"));
  if (event) yield event;
}

function parseSseEvent(rawEvent: string): SseEvent | null {
  const lines = rawEvent.split("\n");
  const event = lines
    .find((line) => line.startsWith("event:"))
    ?.slice("event:".length)
    .trim() || "message";
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n");
  return data ? { event, data } : null;
}

function parseStreamPayload<T>(data: string): T {
  try {
    return JSON.parse(data) as T;
  } catch {
    throw new ExternalProviderError("Backend de IA retornou stream invalido.");
  }
}

function toAppError(statusCode: number, payload: ErrorPayload | undefined): AppError {
  return new AppError(
    payload?.message ?? "Backend de IA nao conseguiu processar a requisicao.",
    statusCode,
    payload?.error ?? "cardocs_ia_error"
  );
}

function parseTimeout(value: string | undefined, fallback: number, min = 1000, max = 120000): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}
