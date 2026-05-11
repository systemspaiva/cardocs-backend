import {
  ExternalProviderError,
  NotFoundError,
  ProviderLimitExceededError,
  ProviderNotConfiguredError,
  ValidationError
} from "../application/errors.js";
import { VehicleImageLookupInput, VehicleImageProvider } from "../application/vehicleImageLookup.js";
import { VehicleImage } from "../domain/models.js";

interface CarsXeVehicleImageProviderOptions {
  apiKey: string;
  baseURL?: string;
  timeoutMs?: number;
}

type CarsXeImagePayload = Record<string, unknown>;

type CarsXeImagesPayload = Record<string, unknown> & {
  success?: unknown;
  images?: unknown;
  error?: unknown;
};

const defaultBaseURL = "https://api.carsxe.com";
const defaultTimeoutMs = 10_000;

export class CarsXeVehicleImageProvider implements VehicleImageProvider {
  private readonly apiKey: string;
  private readonly baseURL: URL;
  private readonly timeoutMs: number;

  constructor(options: CarsXeVehicleImageProviderOptions) {
    const apiKey = options.apiKey.trim();
    if (!apiKey) {
      throw new ProviderNotConfiguredError("Chave da CarsXE nao configurada.");
    }

    this.apiKey = apiKey;
    this.baseURL = new URL(options.baseURL ?? defaultBaseURL);
    if (this.baseURL.protocol !== "https:") {
      throw new ProviderNotConfiguredError("URL da CarsXE deve usar HTTPS.");
    }
    this.timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  }

  static fromEnvironment(env: NodeJS.ProcessEnv = process.env): CarsXeVehicleImageProvider | null {
    const apiKey = env.CARSXE_API_KEY?.trim();
    if (!apiKey) {
      return null;
    }

    return new CarsXeVehicleImageProvider({
      apiKey,
      baseURL: env.CARSXE_BASE_URL?.trim() || defaultBaseURL
    });
  }

  async lookupImage(vehicle: VehicleImageLookupInput): Promise<VehicleImage | null> {
    const url = new URL("/images", this.baseURL);
    url.searchParams.set("key", this.apiKey);
    url.searchParams.set("make", vehicle.brand);
    url.searchParams.set("model", vehicle.model);
    url.searchParams.set("year", vehicle.year);
    url.searchParams.set("transparent", "true");
    url.searchParams.set("format", "json");

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch {
      throw new ExternalProviderError("Nao foi possivel consultar imagens na CarsXE agora.");
    }

    const payload = await readPayload(response);
    if (!response.ok) {
      throwProviderError(response.status, payload);
    }

    if (payload.success === false) {
      throw new ExternalProviderError(firstString(payload.error) || "CarsXE retornou erro ao consultar imagens do veiculo.");
    }

    const images = Array.isArray(payload.images) ? payload.images.filter(isRecord) : [];
    if (images.length === 0) {
      return null;
    }

    return toVehicleImage(images);
  }
}

async function readPayload(response: Response): Promise<CarsXeImagesPayload> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    const payload = JSON.parse(text);
    return isRecord(payload) ? payload : {};
  } catch {
    throw new ExternalProviderError("CarsXE retornou uma resposta invalida.");
  }
}

function throwProviderError(statusCode: number, payload: CarsXeImagesPayload): never {
  const providerMessage = firstString(payload.error);

  switch (statusCode) {
    case 400:
      throw new ValidationError(providerMessage || "Dados do veiculo invalidos para buscar imagem.");
    case 401:
    case 402:
    case 403:
      throw new ProviderNotConfiguredError("Chave da CarsXE invalida, ausente ou sem acesso ao recurso.");
    case 404:
      throw new NotFoundError("Nenhuma imagem encontrada para esse veiculo.");
    case 429:
      throw new ProviderLimitExceededError();
    default:
      throw new ExternalProviderError("CarsXE retornou erro ao consultar imagens do veiculo.");
  }
}

function toVehicleImage(images: CarsXeImagePayload[]): VehicleImage | null {
  const image = images
    .map(toCandidateImage)
    .filter((candidate): candidate is VehicleImage & { area: number } => candidate !== null)
    .sort((left, right) => right.area - left.area)[0];

  if (!image) {
    return null;
  }

  const { area: _area, ...vehicleImage } = image;
  return vehicleImage;
}

function toCandidateImage(payload: CarsXeImagePayload): (VehicleImage & { area: number }) | null {
  const url = firstString(payload.link);
  if (!isHttpsUrl(url)) {
    return null;
  }

  const mime = firstString(payload.mime);
  if (mime && !mime.toLowerCase().startsWith("image/")) {
    return null;
  }

  const thumbnailUrl = firstString(payload.thumbnailLink);
  const width = positiveInteger(payload.width);
  const height = positiveInteger(payload.height);

  return {
    url,
    thumbnailUrl: isHttpsUrl(thumbnailUrl) ? thumbnailUrl : null,
    mime: mime || null,
    width,
    height,
    accentColor: firstString(payload.accentColor) || null,
    source: "CarsXE",
    area: (width ?? 0) * (height ?? 0)
  };
}

function positiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return "";
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
