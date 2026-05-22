import { UserSubscription } from "../domain/models.js";

export interface SubscriptionTransactionVerifier {
  verify(signedTransactionInfo: string): Promise<Omit<UserSubscription, "syncedAt">>;
}
