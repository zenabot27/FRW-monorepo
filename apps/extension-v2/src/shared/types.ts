export type UiSurface = 'popup' | 'sidepanel';

export type CreatedWalletAccount = {
  evmAddress: string;
  flowPublicKey: string;
  derivationPath: string;
};

export type OnboardingStage = 'empty' | 'locked' | 'seed-generated' | 'completed';

export type FlowConnection = {
  connected: boolean;
  address: string | null;
  keyId: number | null;
  network: 'mainnet' | 'testnet';
};

export type EvmConnection = {
  connected: boolean;
  address: string | null;
  chainId: number;
  rpcUrl: string;
};

export type WalletOnboardingState = {
  stage: OnboardingStage;
  hasVault: boolean;
  unlocked: boolean;
  account: CreatedWalletAccount | null;
  seedPhrase: string | null;
  createdAt: number | null;
  autoLockMinutes: number;
  sessionExpiresAt: number | null;
  flowConnection: FlowConnection;
  evmConnection: EvmConnection;
};

export type BackgroundRequest =
  | { type: 'wallet:get-onboarding-state' }
  | { type: 'wallet:create'; password: string }
  | { type: 'wallet:unlock'; password: string }
  | { type: 'wallet:lock' }
  | { type: 'wallet:complete-seed-backup' }
  | { type: 'wallet:change-password'; oldPassword: string; newPassword: string }
  | { type: 'wallet:reveal-seed'; password: string }
  | { type: 'wallet:set-auto-lock'; minutes: number }
  | { type: 'wallet:reset' }
  | { type: 'wallet:flow-connect'; address: string; keyId: number; network: 'mainnet' | 'testnet' }
  | { type: 'wallet:flow-disconnect' }
  | { type: 'wallet:flow-sign-message'; message: string }
  | { type: 'wallet:flow-send-transaction'; cadence: string; gasLimit?: number }
  | { type: 'wallet:evm-connect'; chainId: number; rpcUrl: string }
  | { type: 'wallet:evm-disconnect' }
  | { type: 'wallet:evm-sign-message'; message: string }
  | {
      type: 'wallet:evm-send-transaction';
      to: string;
      valueWei?: string;
      data?: string;
      gasLimit?: number;
      gasPriceWei?: string;
    }
  | {
      type: 'provider:rpc-request';
      scope: 'ethereum' | 'flow';
      origin: string;
      method: string;
      params: unknown[];
    }
  | { type: 'provider:get-approval-request'; requestId: string }
  | { type: 'provider:resolve-approval'; requestId: string; approved: boolean }
  | { type: 'ui:open-sidepanel' };

export type BackgroundResponse =
  | { ok: true; state: WalletOnboardingState }
  | { ok: true; opened: boolean }
  | { ok: true; seedPhrase: string }
  | { ok: true; signature: string; digest?: string }
  | { ok: true; txId: string }
  | { ok: true; txHash: string; rawTransaction: string }
  | { ok: true; result: unknown }
  | {
      ok: true;
      approval: {
        id: string;
        origin: string;
        scope: 'ethereum' | 'flow';
        method: string;
        params: unknown[];
      } | null;
    }
  | { ok: true; resolved: boolean }
  | { ok: false; reason: string };
