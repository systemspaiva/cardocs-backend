export interface PartReplacementRecommendationRequest {
  partName: string;
}

export interface PartReplacementRecommendation {
  partName: string;
  lifeKm: number | null;
  lifeMonths: number | null;
  confidence: number;
  rationale: string;
  source: "ai" | "catalog";
}

export interface PartReplacementRecommendationProvider {
  recommend(input: PartReplacementRecommendationRequest): Promise<Partial<PartReplacementRecommendation>>;
}

interface CatalogRecommendation {
  pattern: RegExp;
  partName: string;
  lifeKm: number | null;
  lifeMonths: number | null;
  rationale: string;
}

const catalogRecommendations: CatalogRecommendation[] = [
  {
    pattern: /oleo|oil|filtro/,
    partName: "Oleo e filtros",
    lifeKm: 10000,
    lifeMonths: 12,
    rationale: "Trocas de oleo e filtros costumam ter intervalo curto e devem considerar km e prazo."
  },
  {
    pattern: /pneu|tire|roda/,
    partName: "Pneus",
    lifeKm: 45000,
    lifeMonths: 48,
    rationale: "Pneus variam por uso e alinhamento, mas esse intervalo ajuda a monitorar desgaste geral."
  },
  {
    pattern: /freio|brake|pastilha|disco/,
    partName: "Pastilhas de freio",
    lifeKm: 30000,
    lifeMonths: 24,
    rationale: "Freios dependem do estilo de condução; acompanhar por km e prazo evita desgaste esquecido."
  },
  {
    pattern: /bateria|battery/,
    partName: "Bateria",
    lifeKm: null,
    lifeMonths: 36,
    rationale: "Bateria costuma envelhecer mais por tempo de uso do que por quilometragem."
  },
  {
    pattern: /suspens|amortecedor/,
    partName: "Suspensao",
    lifeKm: 50000,
    lifeMonths: 48,
    rationale: "Suspensao sofre com piso e carga; este plano cria um alerta conservador."
  },
  {
    pattern: /correia|belt/,
    partName: "Correia",
    lifeKm: 60000,
    lifeMonths: 60,
    rationale: "Correias pedem controle preventivo por km e por envelhecimento do componente."
  },
  {
    pattern: /vela|ignicao/,
    partName: "Velas de ignicao",
    lifeKm: 40000,
    lifeMonths: 36,
    rationale: "Velas perdem eficiencia gradualmente; esse intervalo ajuda a manter partida e consumo."
  }
];

export class PartReplacementRecommendationUseCase {
  constructor(
    private readonly provider: PartReplacementRecommendationProvider | null = null
  ) {}

  async recommend(
    input: PartReplacementRecommendationRequest,
    options: { useProvider?: boolean } = {}
  ): Promise<PartReplacementRecommendation> {
    const fallback = catalogRecommendationFor(input.partName);
    const useProvider = options.useProvider ?? true;

    if (!this.provider || !useProvider) {
      return fallback;
    }

    try {
      return normalizeRecommendation(input.partName, await this.provider.recommend(input), fallback);
    } catch {
      return fallback;
    }
  }
}

function catalogRecommendationFor(partName: string): PartReplacementRecommendation {
  const normalized = normalizePartName(partName);
  const match = catalogRecommendations.find((item) => item.pattern.test(normalized));
  const recommendation = match ?? {
    partName: readablePartName(partName),
    lifeKm: 20000,
    lifeMonths: 24,
    rationale: "Sem categoria clara, usamos um intervalo conservador para manter a peca em acompanhamento."
  };

  return {
    partName: recommendation.partName,
    lifeKm: recommendation.lifeKm,
    lifeMonths: recommendation.lifeMonths,
    confidence: match ? 82 : 58,
    rationale: recommendation.rationale,
    source: "catalog"
  };
}

function normalizeRecommendation(
  requestedPartName: string,
  providerRecommendation: Partial<PartReplacementRecommendation>,
  fallback: PartReplacementRecommendation
): PartReplacementRecommendation {
  const lifeKm = positiveIntOrNull(providerRecommendation.lifeKm);
  const lifeMonths = positiveIntOrNull(providerRecommendation.lifeMonths);

  if (lifeKm === null && lifeMonths === null) {
    return fallback;
  }

  return {
    partName: cleanText(providerRecommendation.partName, readablePartName(requestedPartName)).slice(0, 80),
    lifeKm,
    lifeMonths,
    confidence: clampInt(providerRecommendation.confidence ?? fallback.confidence, 40, 96),
    rationale: cleanText(providerRecommendation.rationale, fallback.rationale).slice(0, 220),
    source: "ai"
  };
}

function positiveIntOrNull(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.trunc(value);
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function cleanText(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value.split(/\s+/).join(" ").trim();
  return cleaned || fallback;
}

function readablePartName(value: string): string {
  const cleaned = cleanText(value, "Peca");
  return cleaned
    .replace(/^(troca|substituicao|revisao|servico|manutencao)\s+(de|do|da|dos|das)?\s*/i, "")
    .trim() || cleaned;
}

function normalizePartName(value: string): string {
  return readablePartName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}
