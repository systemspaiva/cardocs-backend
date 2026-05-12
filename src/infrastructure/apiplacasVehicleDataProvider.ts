import { ExternalProviderError, NotFoundError, ProviderLimitExceededError, ProviderNotConfiguredError, ValidationError } from "../application/errors.js";
import { VehiclePlateDataProvider } from "../application/vehiclePlateLookup.js";
import { assertValidBrazilianPlate, deterministicUuid, normalizePlate } from "../domain/factories.js";
import { VehicleCandidate, VehicleFipeQuote, VehicleKind, VehiclePlateDetails } from "../domain/models.js";

interface ApiPlacasVehicleDataProviderOptions {
  token: string;
  baseURL?: string;
  timeoutMs?: number;
}

type ApiPlacasPayload = Record<string, unknown> & {
  extra?: Record<string, unknown>;
  fipe?: Record<string, unknown>;
  message?: unknown;
  mensagemRetorno?: unknown;
};

const defaultBaseURL = "https://wdapi2.com.br";
const defaultTimeoutMs = 10_000;

export class ApiPlacasVehicleDataProvider implements VehiclePlateDataProvider {
  private readonly token: string;
  private readonly baseURL: URL;
  private readonly timeoutMs: number;

  constructor(options: ApiPlacasVehicleDataProviderOptions) {
    const token = options.token.trim();
    if (!token) {
      throw new ProviderNotConfiguredError("Token da API Placas nao configurado.");
    }

    this.token = token;
    this.baseURL = new URL(options.baseURL ?? defaultBaseURL);
    if (this.baseURL.protocol !== "https:") {
      throw new ProviderNotConfiguredError("URL da API Placas deve usar HTTPS.");
    }
    this.timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  }

  static fromEnvironment(env: NodeJS.ProcessEnv = process.env): ApiPlacasVehicleDataProvider | null {
    const token = env.APIPLACAS_TOKEN?.trim();
    if (!token) {
      return null;
    }

    return new ApiPlacasVehicleDataProvider({
      token,
      baseURL: env.APIPLACAS_BASE_URL?.trim() || defaultBaseURL
    });
  }

  async lookupByPlate(plate: string): Promise<VehicleCandidate> {
    const normalizedPlate = normalizePlate(plate);
    const url = new URL(
      `/consulta/${encodeURIComponent(normalizedPlate)}/${encodeURIComponent(this.token)}`,
      this.baseURL
    );

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch {
      throw new ExternalProviderError("Nao foi possivel consultar a API Placas agora.");
    }

    const payload = await readPayload(response);
    if (!response.ok) {
      throwProviderError(response.status, payload);
    }

    return toVehicleCandidate(normalizedPlate, payload);
  }
}

async function readPayload(response: Response): Promise<ApiPlacasPayload> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    const payload = JSON.parse(text);
    return isRecord(payload) ? payload : {};
  } catch {
    throw new ExternalProviderError("API Placas retornou uma resposta invalida.");
  }
}

function throwProviderError(statusCode: number, payload: ApiPlacasPayload): never {
  const providerMessage = firstString(payload.message, payload.mensagemRetorno);

  switch (statusCode) {
    case 400:
      throw new ValidationError(providerMessage || "Informe uma placa brasileira valida.");
    case 401:
    case 402:
    case 403:
      throw new ProviderNotConfiguredError("Token da API Placas invalido ou ausente.");
    case 406:
      throw new NotFoundError("Nenhum veiculo encontrado para essa placa.");
    case 429:
      throw new ProviderLimitExceededError();
    default:
      throw new ExternalProviderError("API Placas retornou erro ao consultar o veiculo.");
  }
}

function toVehicleCandidate(requestPlate: string, payload: ApiPlacasPayload): VehicleCandidate {
  const extra = isRecord(payload.extra) ? payload.extra : {};
  const returnedPlate = normalizePlate(
    firstString(payload.placa, extra.placa_modelo_novo, extra.placa, extra.placa_modelo_antigo)
  );
  try {
    assertValidBrazilianPlate(returnedPlate);
  } catch {
    throw new ExternalProviderError("API Placas retornou uma placa invalida.");
  }
  const knownPlates = [
    payload.placa,
    payload.placa_alternativa,
    extra.placa_modelo_novo,
    extra.placa,
    extra.placa_modelo_antigo
  ]
    .map((value) => normalizePlate(firstString(value)))
    .filter(Boolean);
  if (knownPlates.length > 0 && !knownPlates.includes(requestPlate)) {
    throw new ExternalProviderError("API Placas retornou dados de outra placa.");
  }

  const plate = returnedPlate;
  const brand = firstString(payload.marca, payload.MARCA, extra.marca);
  const model = firstString(payload.modelo, payload.MODELO, payload.SUBMODELO, extra.modelo);
  const year = firstString(payload.anoModelo, payload.ano, extra.ano_modelo, extra.ano_fabricacao);
  const color = firstString(payload.cor, extra.cor);

  if (!brand || !model || !year || !color || !plate) {
    throw new ExternalProviderError("Consulta por placa retornou dados incompletos.");
  }

  return {
    id: deterministicUuid("vehicle-candidate", plate),
    kind: detectVehicleKind(payload, extra),
    plate,
    brand,
    model,
    year,
    color,
    image: null,
    fipe: toFipeQuote(payload),
    details: toPlateDetails(payload, extra)
  };
}

function toFipeQuote(payload: ApiPlacasPayload): VehicleFipeQuote | null {
  const fipe = isRecord(payload.fipe) ? payload.fipe : {};
  const data = Array.isArray(fipe.dados) ? fipe.dados.filter(isRecord) : [];
  const bestMatch = data
    .map((entry, index) => ({ entry, index, score: numberValue(entry.score) ?? 0 }))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.entry;

  if (!bestMatch) {
    return null;
  }

  const formattedValue = firstString(bestMatch.texto_valor);
  const quote: VehicleFipeQuote = {
    code: firstString(bestMatch.codigo_fipe),
    brand: firstString(bestMatch.texto_marca),
    model: firstString(bestMatch.texto_modelo),
    modelYear: firstString(bestMatch.ano_modelo),
    fuel: firstString(bestMatch.combustivel, bestMatch.sigla_combustivel),
    referenceMonth: firstString(bestMatch.mes_referencia),
    formattedValue,
    value: parseBrazilianCurrency(formattedValue)
  };

  return hasAnyValue(quote) ? quote : null;
}

function toPlateDetails(payload: ApiPlacasPayload, extra: Record<string, unknown>): VehiclePlateDetails | null {
  const details: VehiclePlateDetails = {
    alternatePlate: nullableString(payload.placa_alternativa, extra.placa_modelo_antigo),
    brandLogoURL: nullableUrlString(payload.logo),
    municipality: nullableString(payload.municipio, extra.municipio),
    state: nullableString(payload.uf, extra.uf_placa, extra.uf),
    origin: nullableString(payload.origem, extra.nacionalidade),
    situation: nullableString(payload.situacao),
    fuel: nullableString(extra.combustivel),
    engineDisplacement: nullableString(extra.cilindradas),
    vehicleType: nullableString(extra.tipo_veiculo, extra.especie),
    segment: nullableString(extra.segmento),
    subSegment: nullableString(extra.sub_segmento),
    passengerCapacity: nullableString(extra.quantidade_passageiro),
    bodyType: nullableString(extra.tipo_carroceria, extra.carroceria)
  };

  return hasAnyValue(details) ? details : null;
}

function detectVehicleKind(payload: ApiPlacasPayload, extra: Record<string, unknown>): VehicleKind {
  const values = [
    payload.tipo,
    payload.tipoVeiculo,
    extra.tipo_veiculo,
    extra.especie,
    extra.segmento,
    extra.sub_segmento
  ].map((value) => normalizeComparable(firstString(value)));

  return values.some((value) => value.includes("moto")) ? "motorcycle" : "car";
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return "";
}

function nullableString(...values: unknown[]): string | null {
  return firstString(...values) || null;
}

function nullableUrlString(value: unknown): string | null {
  const candidate = firstString(value);
  if (!candidate) {
    return null;
  }

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    return parseLocalizedNumber(value);
  }

  return null;
}

function parseBrazilianCurrency(value: string): number | null {
  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .trim();
  const parsed = parseLocalizedNumber(normalized);
  return parsed === null ? null : Math.round(parsed * 100) / 100;
}

function parseLocalizedNumber(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");
  const decimalComma = lastComma > lastDot;
  const standard = decimalComma ?
    normalized.replace(/\./g, "").replace(",", ".") :
    normalized.replace(/,/g, "");
  const parsed = Number.parseFloat(standard);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasAnyValue(value: object): boolean {
  return Object.values(value).some((item) => item !== null && item !== undefined && String(item).trim().length > 0);
}

function normalizeComparable(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
