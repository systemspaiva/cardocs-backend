import { VehicleTransferRequest } from "../domain/models.js";

export type PushDevicePlatform = "ios" | "android";

export interface PushDeviceTokenRegistration {
  token: string;
  platform: PushDevicePlatform;
}

export interface StoredPushDeviceToken extends PushDeviceTokenRegistration {
  id: string;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushDeliveryResult {
  invalidTokens: string[];
}

export interface PushDeviceTokenStore {
  saveToken(ownerId: string, registration: PushDeviceTokenRegistration): Promise<void>;
  deleteToken(ownerId: string, token: string): Promise<void>;
  listTokens(ownerId: string): Promise<StoredPushDeviceToken[]>;
  deleteTokens(ownerId: string, tokens: string[]): Promise<void>;
}

export interface PushNotificationSender {
  sendToTokens(tokens: string[], payload: PushNotificationPayload): Promise<PushDeliveryResult>;
}

export class PushNotificationService {
  constructor(
    private readonly tokenStore: PushDeviceTokenStore,
    private readonly sender: PushNotificationSender
  ) {}

  async registerDeviceToken(ownerId: string, registration: PushDeviceTokenRegistration): Promise<void> {
    await this.tokenStore.saveToken(ownerId, registration);
  }

  async unregisterDeviceToken(ownerId: string, token: string): Promise<void> {
    await this.tokenStore.deleteToken(ownerId, token);
  }

  async notifyVehicleTransferRequested(transfer: VehicleTransferRequest): Promise<void> {
    await this.sendBestEffort(transfer.toOwnerID, {
      title: "Transferencia de veiculo",
      body: `${transfer.vehicleTitle} foi enviado para sua garagem.`,
      data: {
        kind: "vehicle_transfer_requested",
        transferID: transfer.id,
        vehicleID: transfer.vehicleID
      }
    });
  }

  async notifyVehicleTransferAccepted(transfer: VehicleTransferRequest): Promise<void> {
    await this.sendBestEffort(transfer.fromOwnerID, {
      title: "Transferencia aceita",
      body: `${transfer.vehicleTitle} foi aceito pelo novo dono.`,
      data: {
        kind: "vehicle_transfer_accepted",
        transferID: transfer.id,
        vehicleID: transfer.vehicleID
      }
    });
  }

  async notifyVehicleTransferDeclined(transfer: VehicleTransferRequest): Promise<void> {
    await this.sendBestEffort(transfer.fromOwnerID, {
      title: "Transferencia recusada",
      body: `${transfer.vehicleTitle} foi recusado pelo destinatario.`,
      data: {
        kind: "vehicle_transfer_declined",
        transferID: transfer.id,
        vehicleID: transfer.vehicleID
      }
    });
  }

  private async sendBestEffort(ownerId: string, payload: PushNotificationPayload): Promise<void> {
    try {
      const tokens = await this.tokenStore.listTokens(ownerId);
      if (tokens.length === 0) {
        return;
      }

      const result = await this.sender.sendToTokens(tokens.map((token) => token.token), payload);
      if (result.invalidTokens.length > 0) {
        await this.tokenStore.deleteTokens(ownerId, result.invalidTokens);
      }
    } catch (error) {
      console.warn("push_notification_failed", JSON.stringify({
        kind: payload.data?.kind ?? "unknown",
        error: error instanceof Error ? error.message : "unknown"
      }));
    }
  }
}
