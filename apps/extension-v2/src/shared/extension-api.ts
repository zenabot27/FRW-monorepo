import type {
  ActionOpenMode,
  BackgroundRequest,
  BackgroundResponse,
  WalletOnboardingState,
} from './types';

async function callBackground(request: BackgroundRequest): Promise<BackgroundResponse> {
  return await chrome.runtime.sendMessage(request);
}

function requireState(response: BackgroundResponse): WalletOnboardingState {
  if (response.ok && 'state' in response) {
    return response.state;
  }
  throw new Error('reason' in response ? response.reason : 'Unexpected background response');
}

export async function getOnboardingState(): Promise<WalletOnboardingState> {
  const response = await callBackground({ type: 'wallet:get-onboarding-state' });
  return requireState(response);
}

export async function createWallet(password: string): Promise<WalletOnboardingState> {
  const response = await callBackground({ type: 'wallet:create', password });
  return requireState(response);
}

export async function unlockWallet(password: string): Promise<WalletOnboardingState> {
  const response = await callBackground({ type: 'wallet:unlock', password });
  return requireState(response);
}

export async function lockWallet(): Promise<WalletOnboardingState> {
  const response = await callBackground({ type: 'wallet:lock' });
  return requireState(response);
}

export async function completeSeedBackup(): Promise<WalletOnboardingState> {
  const response = await callBackground({ type: 'wallet:complete-seed-backup' });
  return requireState(response);
}

export async function changeWalletPassword(
  oldPassword: string,
  newPassword: string
): Promise<WalletOnboardingState> {
  const response = await callBackground({
    type: 'wallet:change-password',
    oldPassword,
    newPassword,
  });
  return requireState(response);
}

export async function revealSeedPhrase(password: string): Promise<string> {
  const response = await callBackground({ type: 'wallet:reveal-seed', password });
  if (response.ok && 'seedPhrase' in response) {
    return response.seedPhrase;
  }
  throw new Error('reason' in response ? response.reason : 'Unexpected background response');
}

export async function setAutoLockMinutes(minutes: number): Promise<WalletOnboardingState> {
  const response = await callBackground({ type: 'wallet:set-auto-lock', minutes });
  return requireState(response);
}

export async function setActionOpenMode(mode: ActionOpenMode): Promise<WalletOnboardingState> {
  const response = await callBackground({ type: 'wallet:set-action-mode', mode });
  return requireState(response);
}

export async function resetWallet(): Promise<WalletOnboardingState> {
  const response = await callBackground({ type: 'wallet:reset' });
  return requireState(response);
}

export async function openSidePanelFromUi(): Promise<boolean> {
  const response = await callBackground({ type: 'ui:open-sidepanel' });
  return Boolean(response.ok && 'opened' in response && response.opened);
}

export async function connectFlowWallet(
  address: string,
  keyId: number,
  network: 'mainnet' | 'testnet'
): Promise<WalletOnboardingState> {
  const response = await callBackground({ type: 'wallet:flow-connect', address, keyId, network });
  return requireState(response);
}

export async function disconnectFlowWallet(): Promise<WalletOnboardingState> {
  const response = await callBackground({ type: 'wallet:flow-disconnect' });
  return requireState(response);
}

export async function flowSignMessage(
  message: string
): Promise<{ signature: string; digest?: string }> {
  const response = await callBackground({ type: 'wallet:flow-sign-message', message });
  if (response.ok && 'signature' in response) {
    return {
      signature: response.signature,
      digest: 'digest' in response ? response.digest : undefined,
    };
  }
  throw new Error('reason' in response ? response.reason : 'Unexpected background response');
}

export async function flowSendTransaction(
  cadence: string,
  gasLimit?: number
): Promise<{ txId: string }> {
  const response = await callBackground({
    type: 'wallet:flow-send-transaction',
    cadence,
    gasLimit,
  });
  if (response.ok && 'txId' in response) {
    return { txId: response.txId };
  }
  throw new Error('reason' in response ? response.reason : 'Unexpected background response');
}

export async function connectEvmWallet(
  chainId: number,
  rpcUrl: string
): Promise<WalletOnboardingState> {
  const response = await callBackground({ type: 'wallet:evm-connect', chainId, rpcUrl });
  return requireState(response);
}

export async function disconnectEvmWallet(): Promise<WalletOnboardingState> {
  const response = await callBackground({ type: 'wallet:evm-disconnect' });
  return requireState(response);
}

export async function evmSignMessage(
  message: string
): Promise<{ signature: string; digest?: string }> {
  const response = await callBackground({ type: 'wallet:evm-sign-message', message });
  if (response.ok && 'signature' in response) {
    return {
      signature: response.signature,
      digest: 'digest' in response ? response.digest : undefined,
    };
  }
  throw new Error('reason' in response ? response.reason : 'Unexpected background response');
}

export async function evmSendTransaction(params: {
  to: string;
  valueWei?: string;
  data?: string;
  gasLimit?: number;
  gasPriceWei?: string;
}): Promise<{ txHash: string; rawTransaction: string }> {
  const response = await callBackground({ type: 'wallet:evm-send-transaction', ...params });
  if (response.ok && 'txHash' in response) {
    return { txHash: response.txHash, rawTransaction: response.rawTransaction };
  }
  throw new Error('reason' in response ? response.reason : 'Unexpected background response');
}

export async function getApprovalRequest(requestId: string): Promise<{
  id: string;
  origin: string;
  scope: 'ethereum' | 'flow';
  method: string;
  params: unknown[];
} | null> {
  const response = await callBackground({ type: 'provider:get-approval-request', requestId });
  if (response.ok && 'approval' in response) {
    return response.approval;
  }
  throw new Error('reason' in response ? response.reason : 'Unexpected background response');
}

export async function resolveApprovalRequest(requestId: string, approved: boolean): Promise<void> {
  const response = await callBackground({ type: 'provider:resolve-approval', requestId, approved });
  if (response.ok && 'resolved' in response) {
    return;
  }
  throw new Error('reason' in response ? response.reason : 'Unexpected background response');
}
