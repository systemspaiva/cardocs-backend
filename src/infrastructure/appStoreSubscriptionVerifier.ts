import {
  Environment,
  SignedDataVerifier,
  Type,
  VerificationException
} from "@apple/app-store-server-library";
import { ValidationError } from "../application/errors.js";
import { SubscriptionTransactionVerifier } from "../application/subscriptions.js";
import { SubscriptionPlan, UserSubscription } from "../domain/models.js";

const DEFAULT_BUNDLE_ID = "com.paivaapps.tarevisado";
const DEFAULT_APP_APPLE_ID = 6771093806;
const APPLE_ROOT_CA_G3_URL = "https://www.apple.com/certificateauthority/AppleRootCA-G3.cer";

const productPlans = new Map<string, SubscriptionPlan>([
  ["com.paivaapps.tarevisado.premium.monthly", "monthly"],
  ["com.paivaapps.tarevisado.premium.annual", "annual"]
]);

export class AppStoreSubscriptionVerifier implements SubscriptionTransactionVerifier {
  private rootCertificatesPromise: Promise<Buffer[]> | null = null;
  private verifierPromise: Promise<SignedDataVerifier> | null = null;

  constructor(
    private readonly environment: Environment,
    private readonly bundleId: string,
    private readonly appAppleId: number,
    private readonly enableOnlineChecks: boolean,
    private readonly rootCertificateURL: string
  ) {}

  static fromEnvironment(): AppStoreSubscriptionVerifier {
    return new AppStoreSubscriptionVerifier(
      parseEnvironment(process.env.CARDOCS_APP_STORE_ENVIRONMENT ?? "Sandbox"),
      process.env.CARDOCS_IOS_BUNDLE_ID ?? DEFAULT_BUNDLE_ID,
      Number(process.env.CARDOCS_APP_APPLE_ID ?? DEFAULT_APP_APPLE_ID),
      process.env.CARDOCS_APP_STORE_ONLINE_CHECKS === "1",
      process.env.CARDOCS_APPLE_ROOT_CA_G3_URL ?? APPLE_ROOT_CA_G3_URL
    );
  }

  async verify(signedTransactionInfo: string): Promise<Omit<UserSubscription, "syncedAt">> {
    const verifier = await this.verifier();
    const transaction = await verifier.verifyAndDecodeTransaction(signedTransactionInfo).catch((error: unknown) => {
      if (error instanceof VerificationException) {
        throw new ValidationError("Transacao da App Store invalida.");
      }
      throw error;
    });

    const plan = transaction.productId ? productPlans.get(transaction.productId) : undefined;
    const expiresDate = typeof transaction.expiresDate === "number" ? new Date(transaction.expiresDate) : null;
    if (
      !plan ||
      transaction.type !== Type.AUTO_RENEWABLE_SUBSCRIPTION ||
      !transaction.productId ||
      !transaction.transactionId ||
      !transaction.originalTransactionId ||
      !expiresDate ||
      Number.isNaN(expiresDate.getTime()) ||
      expiresDate <= new Date() ||
      transaction.revocationDate
    ) {
      throw new ValidationError("Assinatura da App Store invalida ou expirada.");
    }

    return {
      plan,
      productId: transaction.productId,
      expiresAt: expiresDate.toISOString(),
      transactionId: transaction.transactionId,
      originalTransactionId: transaction.originalTransactionId
    };
  }

  private async verifier(): Promise<SignedDataVerifier> {
    if (!this.verifierPromise) {
      this.verifierPromise = this.rootCertificates().then((rootCertificates) => new SignedDataVerifier(
        rootCertificates,
        this.enableOnlineChecks,
        this.environment,
        this.bundleId,
        this.environment === Environment.PRODUCTION ? this.appAppleId : undefined
      ));
    }
    return this.verifierPromise;
  }

  private async rootCertificates(): Promise<Buffer[]> {
    if (!this.rootCertificatesPromise) {
      this.rootCertificatesPromise = fetch(this.rootCertificateURL).then(async (response) => {
        if (!response.ok) {
          throw new ValidationError("Certificado raiz da Apple indisponivel para validar assinatura.");
        }
        return [Buffer.from(await response.arrayBuffer())];
      });
    }
    return this.rootCertificatesPromise;
  }
}

function parseEnvironment(value: string): Environment {
  const normalized = value.trim().toLowerCase();
  if (normalized === "production") return Environment.PRODUCTION;
  if (normalized === "xcode") return Environment.XCODE;
  if (normalized === "localtesting" || normalized === "local_testing") return Environment.LOCAL_TESTING;
  return Environment.SANDBOX;
}
