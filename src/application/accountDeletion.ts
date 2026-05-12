export interface AccountDataStore {
  deleteAllForUser(ownerId: string): Promise<void>;
}

export interface AccountAuthStore {
  deleteUser(ownerId: string): Promise<void>;
}

export class DeleteAccountUseCase {
  constructor(
    private readonly dataStore: AccountDataStore,
    private readonly authStore: AccountAuthStore
  ) {}

  async deleteAccount(ownerId: string): Promise<void> {
    await this.dataStore.deleteAllForUser(ownerId);
    await this.authStore.deleteUser(ownerId);
  }
}
