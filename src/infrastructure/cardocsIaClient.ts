import { GoogleAuth, IdTokenClient } from "google-auth-library";
import { AppError, ExternalProviderError, ProviderNotConfiguredError } from "../application/errors.js";
import {
  CardocsIaGateway,
  PartReplacementRecommendation,
  PartReplacementRecommendationRequest
} from "../application/cardocsIaGateway.js";
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
      parseTimeout(process.env.CARDOCS_IA_TIMEOUT_MS)
    );
  }

  async analyzeInvoice(input: InvoiceDocumentInput): Promise<InvoiceScanDraft> {
    return this.post("/internal/v1/invoices/analyze", input);
  }

  async recommendPartReplacement(input: PartReplacementRecommendationRequest): Promise<PartReplacementRecommendation> {
    return this.post("/internal/v1/part-replacements/recommendation", input);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseURL}${path}`;
    if (isLocalURL(this.baseURL)) {
      return this.fetchLocal<T>(url, body);
    }

    try {
      const client = await this.idTokenClient();
      const response = await client.request<T>({
        url,
        method: "POST",
        data: body,
        headers: { "content-type": "application/json" },
        timeout: this.timeoutMs
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

  private async fetchLocal<T>(url: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
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

  private idTokenClient(): Promise<IdTokenClient> {
    if (!this.idTokenClientPromise) {
      this.idTokenClientPromise = this.auth.getIdTokenClient(this.baseURL);
    }
    return this.idTokenClientPromise;
  }
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

function toAppError(statusCode: number, payload: ErrorPayload | undefined): AppError {
  return new AppError(
    payload?.message ?? "Backend de IA nao conseguiu processar a requisicao.",
    statusCode,
    payload?.error ?? "cardocs_ia_error"
  );
}

function parseTimeout(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1000 && parsed <= 60000 ? parsed : 30000;
}
