import { UserSubscription } from "../domain/models.js";

export interface SubscriptionTransactionVerifier {
  verify(signedTransactionInfo: string, expectedAppAccountToken: string): Promise<Omit<UserSubscription, "syncedAt">>;
}
