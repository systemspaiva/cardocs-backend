import { GoogleAuth } from "google-auth-library";
import {
  GooglePlayPurchaseVerifier,
  GooglePlaySubscriptionVerification,
  GooglePlaySubscriptionSyncInput,
  VerifiedGooglePlaySubscription,
  googlePlayAccountIdForOwner,
  googlePlayPurchaseTokenHash
} from "../application/subscriptions.js";
import { ExternalProviderError, ValidationError } from "../application/errors.js";
import { SubscriptionPlan } from "../domain/models.js";

const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const DEFAULT_ANDROID_PACKAGE_NAME = "com.luhenpa.cardocs";

const ENTITLED_SUBSCRIPTION_STATES = new Set([
  "SUBSCRIPTION_STATE_ACTIVE",
  "SUBSCRIPTION_STATE_CANCELED",
  "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"
]);

const NOT_ENTITLED_SUBSCRIPTION_STATES = new Set([
  "SUBSCRIPTION_STATE_PENDING",
  "SUBSCRIPTION_STATE_PAUSED",
  "SUBSCRIPTION_STATE_ON_HOLD",
  "SUBSCRIPTION_STATE_EXPIRED",
  "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED"
]);

export interface GooglePlayProductConfiguration {
  plan: SubscriptionPlan;
  productId: string;
  basePlanId: string;
}

interface GooglePlayExternalAccountIdentifiers {
  obfuscatedExternalAccountId?: string | null;
}

interface GooglePlayOfferDetails {
  basePlanId?: string | null;
  offerId?: string | null;
}

interface GooglePlaySubscriptionLineItem {
  productId?: string | null;
  expiryTime?: string | null;
  offerDetails?: GooglePlayOfferDetails | null;
}

export interface GooglePlaySubscriptionPurchaseV2 {
  subscriptionState?: string | null;
  acknowledgementState?: string | null;
  linkedPurchaseToken?: string | null;
  externalAccountIdentifiers?: GooglePlayExternalAccountIdentifiers | null;
  lineItems?: GooglePlaySubscriptionLineItem[] | null;
}

export interface GooglePlayPublisherClient {
  getSubscription(
    packageName: string,
    purchaseToken: string
  ): Promise<GooglePlaySubscriptionPurchaseV2>;

  acknowledgeSubscription(
    packageName: string,
    productId: string,
    purchaseToken: string
  ): Promise<void>;
}

export class GooglePlayPublisherApiClient implements GooglePlayPublisherClient {
  constructor(
    private readonly auth: GoogleAuth = new GoogleAuth({
      scopes: [ANDROID_PUBLISHER_SCOPE]
    })
  ) {}

  async getSubscription(
    packageName: string,
    purchaseToken: string
  ): Promise<GooglePlaySubscriptionPurchaseV2> {
    const client = await this.auth.getClient();
    const response = await client.request<GooglePlaySubscriptionPurchaseV2>({
      method: "GET",
      url: subscriptionLookupURL(packageName, purchaseToken)
    });
    return response.data;
  }

  async acknowledgeSubscription(
    packageName: string,
    productId: string,
    purchaseToken: string
  ): Promise<void> {
    const client = await this.auth.getClient();
    await client.request({
      method: "POST",
      url: subscriptionAcknowledgementURL(packageName, productId, purchaseToken),
      data: {}
    });
  }
}

export class GooglePlaySubscriptionVerifier implements GooglePlayPurchaseVerifier {
  constructor(
    private readonly client: GooglePlayPublisherClient,
    private readonly packageName: string,
    private readonly products: GooglePlayProductConfiguration[],
    private readonly now: () => Date = () => new Date()
  ) {
    if (!packageName.trim() || products.length === 0) {
      throw new Error("Google Play subscription verifier configuration is empty.");
    }
    const productKeys = products.map((product) =>
      `${product.productId}\u0000${product.basePlanId}`
    );
    if (new Set(productKeys).size !== productKeys.length) {
      throw new Error("Google Play subscription product configuration is ambiguous.");
    }
  }

  static fromEnvironment(
    environment: NodeJS.ProcessEnv = process.env
  ): GooglePlaySubscriptionVerifier | null {
    const products = [
      productConfigurationFromEnvironment(environment, "monthly"),
      productConfigurationFromEnvironment(environment, "annual")
    ].filter((product): product is GooglePlayProductConfiguration => product !== null);

    if (products.length === 0) return null;

    return new GooglePlaySubscriptionVerifier(
      new GooglePlayPublisherApiClient(),
      environment.CARDOCS_ANDROID_PACKAGE_NAME?.trim() || DEFAULT_ANDROID_PACKAGE_NAME,
      products
    );
  }

  async verify(
    input: GooglePlaySubscriptionSyncInput,
    ownerId: string
  ): Promise<GooglePlaySubscriptionVerification> {
    if (input.packageName !== this.packageName) {
      throw new ValidationError("Pacote Android nao autorizado para esta assinatura.");
    }

    if (!this.products.some((product) => product.productId === input.productId)) {
      throw new ValidationError("Produto Google Play nao autorizado.");
    }

    const purchase = await this.loadPurchase(input.packageName, input.purchaseToken);
    const expectedAccountId = googlePlayAccountIdForOwner(ownerId);
    if (
      purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId !==
      expectedAccountId
    ) {
      throw new ValidationError("Assinatura Google Play vinculada a outra conta.");
    }

    const configuredLineItems = (purchase.lineItems ?? [])
      .map((lineItem) => {
        const configuration = this.products.find((product) =>
          product.productId === input.productId &&
          product.productId === lineItem.productId &&
          product.basePlanId === lineItem.offerDetails?.basePlanId
        );
        return configuration ? { configuration, lineItem } : null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (configuredLineItems.length === 0) {
      throw new ValidationError("Produto ou plano-base Google Play invalido.");
    }

    const purchaseTokenHash = googlePlayPurchaseTokenHash(input.purchaseToken);
    if (
      purchase.subscriptionState &&
      NOT_ENTITLED_SUBSCRIPTION_STATES.has(purchase.subscriptionState)
    ) {
      return {
        status: "notEntitled",
        purchaseTokenHash
      };
    }

    if (
      !purchase.subscriptionState ||
      !ENTITLED_SUBSCRIPTION_STATES.has(purchase.subscriptionState)
    ) {
      throw new ValidationError("Estado da assinatura Google Play invalido.");
    }

    const now = this.now();
    const eligibleLineItems = configuredLineItems
      .map(({ configuration, lineItem }) => {
        const expiresAt = parseFutureDate(lineItem.expiryTime, now);
        return expiresAt ? { configuration, expiresAt, lineItem } : null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((left, right) => right.expiresAt.getTime() - left.expiresAt.getTime());

    const activeLineItem = eligibleLineItems[0];
    if (!activeLineItem) {
      throw new ValidationError("Plano Google Play invalido ou expirado.");
    }

    if (
      purchase.acknowledgementState !== "ACKNOWLEDGEMENT_STATE_PENDING" &&
      purchase.acknowledgementState !== "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED"
    ) {
      throw new ValidationError("Estado de confirmacao da compra Google Play invalido.");
    }

    const linkedPurchaseTokenHash = purchase.linkedPurchaseToken
      ? googlePlayPurchaseTokenHash(purchase.linkedPurchaseToken)
      : null;

    return {
      status: "entitled",
      purchase: {
        subscription: {
          plan: activeLineItem.configuration.plan,
          productId: activeLineItem.configuration.productId,
          expiresAt: activeLineItem.expiresAt.toISOString(),
          transactionId: purchaseTokenHash,
          originalTransactionId: linkedPurchaseTokenHash ?? purchaseTokenHash
        },
        metadata: {
          store: "googlePlay",
          purchaseTokenHash,
          linkedPurchaseTokenHash,
          purchaseTokenLineageHashes: linkedPurchaseTokenHash
            ? [linkedPurchaseTokenHash]
            : [],
          packageName: this.packageName,
          basePlanId: activeLineItem.configuration.basePlanId,
          offerId: activeLineItem.lineItem.offerDetails?.offerId ?? null
        },
        packageName: this.packageName,
        productId: activeLineItem.configuration.productId,
        purchaseToken: input.purchaseToken,
        needsAcknowledgement:
          purchase.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING"
      }
    };
  }

  async acknowledge(subscription: VerifiedGooglePlaySubscription): Promise<void> {
    if (!subscription.needsAcknowledgement) return;

    try {
      await this.client.acknowledgeSubscription(
        subscription.packageName,
        subscription.productId,
        subscription.purchaseToken
      );
    } catch {
      try {
        const current = await this.client.getSubscription(
          subscription.packageName,
          subscription.purchaseToken
        );
        if (current.acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED") {
          return;
        }
      } catch {
        // Preserve the acknowledgement failure below without exposing the token.
      }
      throw new ExternalProviderError(
        "Google Play indisponivel para confirmar a assinatura."
      );
    }
  }

  private async loadPurchase(
    packageName: string,
    purchaseToken: string
  ): Promise<GooglePlaySubscriptionPurchaseV2> {
    try {
      return await this.client.getSubscription(packageName, purchaseToken);
    } catch (error) {
      if (isInvalidGooglePlayPurchaseError(error)) {
        throw new ValidationError("Compra Google Play invalida ou indisponivel.");
      }
      throw new ExternalProviderError(
        "Google Play indisponivel para validar a assinatura."
      );
    }
  }
}

function productConfigurationFromEnvironment(
  environment: NodeJS.ProcessEnv,
  plan: SubscriptionPlan
): GooglePlayProductConfiguration | null {
  const prefix = plan === "monthly" ? "MONTHLY" : "ANNUAL";
  const productId = environment[`CARDOCS_GOOGLE_PLAY_${prefix}_PRODUCT_ID`]?.trim();
  const basePlanId = environment[`CARDOCS_GOOGLE_PLAY_${prefix}_BASE_PLAN_ID`]?.trim();

  if (!productId && !basePlanId) return null;
  if (!productId || !basePlanId) {
    console.warn("google_play_subscription_product_config_incomplete", { plan });
    return null;
  }

  return { plan, productId, basePlanId };
}

function parseFutureDate(value: string | null | undefined, now: Date): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date <= now) return null;
  return date;
}

function isInvalidGooglePlayPurchaseError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    status?: unknown;
    response?: { status?: unknown };
  };
  const status = Number(candidate.response?.status ?? candidate.status ?? candidate.code);
  return status === 400 || status === 404 || status === 410;
}

function subscriptionLookupURL(packageName: string, purchaseToken: string): string {
  return "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/" +
    `${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/` +
    encodeURIComponent(purchaseToken);
}

function subscriptionAcknowledgementURL(
  packageName: string,
  productId: string,
  purchaseToken: string
): string {
  return "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/" +
    `${encodeURIComponent(packageName)}/purchases/subscriptions/` +
    `${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
}
