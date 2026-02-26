import * as fcl from '@onflow/fcl';
import encryptor from 'browser-passworder';

import { generateBip39Mnemonic } from '../../../../packages/wallet/src/crypto/bip39';
import { WalletCoreProvider } from '../../../../packages/wallet/src/crypto/wallet-core-provider';
import { SeedPhraseKey } from '../../../../packages/wallet/src/keys/seed-phrase-key';
import { EthProvider } from '../../../../packages/wallet/src/services/eth-provider';
import { MemoryStorage } from '../../../../packages/wallet/src/storage/memory-storage';
import {
  BIP44_PATHS,
  HashAlgorithm,
  NETWORKS,
  SignatureAlgorithm,
} from '../../../../packages/wallet/src/types/key';
import type {
  BackgroundRequest,
  BackgroundResponse,
  CreatedWalletAccount,
  EvmConnection,
  FlowConnection,
  WalletOnboardingState,
} from '../shared/types';

const VAULT_KEY = 'wallet-v2-vault';
const AUTO_LOCK_MINUTES_KEY = 'wallet-v2-auto-lock-minutes';
const AUTO_LOCK_ALARM = 'wallet-v2-auto-lock';
const FLOW_CONNECTION_KEY = 'wallet-v2-flow-connection';
const EVM_CONNECTION_KEY = 'wallet-v2-evm-connection';
const DEFAULT_AUTO_LOCK_MINUTES = 15;
const DEFAULT_FLOW_CONNECTION: FlowConnection = {
  connected: false,
  address: null,
  keyId: null,
  network: 'testnet',
};
const DEFAULT_EVM_CONNECTION: EvmConnection = {
  connected: false,
  address: null,
  chainId: Number(NETWORKS.FLOW_EVM_TESTNET.chainId),
  rpcUrl: NETWORKS.FLOW_EVM_TESTNET.rpcEndpoint,
};

type VaultPayload = {
  mnemonic: string;
  account: CreatedWalletAccount;
  createdAt: number;
  backedUp: boolean;
};

let unlockedVault: VaultPayload | null = null;
let unlockedPassword: string | null = null;
let sessionExpiresAt: number | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).process;
} catch {
  // ignore
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).__FRW_WALLET_CORE_INIT_OPTIONS__ = {
  locateFile(file: string) {
    if (file.endsWith('.wasm')) {
      return chrome.runtime.getURL('assets/wallet-core.wasm');
    }
    return file;
  },
};

function validatePassword(password: string): void {
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
}

function normalizeAutoLockMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) {
    return DEFAULT_AUTO_LOCK_MINUTES;
  }
  const intValue = Math.floor(minutes);
  return Math.max(1, Math.min(240, intValue));
}

async function getAutoLockMinutes(): Promise<number> {
  const result = await chrome.storage.local.get(AUTO_LOCK_MINUTES_KEY);
  const raw = result[AUTO_LOCK_MINUTES_KEY];
  if (typeof raw !== 'number') {
    await chrome.storage.local.set({ [AUTO_LOCK_MINUTES_KEY]: DEFAULT_AUTO_LOCK_MINUTES });
    return DEFAULT_AUTO_LOCK_MINUTES;
  }
  return normalizeAutoLockMinutes(raw);
}

async function setAutoLockMinutes(minutes: number): Promise<number> {
  const normalized = normalizeAutoLockMinutes(minutes);
  await chrome.storage.local.set({ [AUTO_LOCK_MINUTES_KEY]: normalized });
  return normalized;
}

function normalizeFlowConnection(raw: unknown): FlowConnection {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_FLOW_CONNECTION;
  }
  const value = raw as Partial<FlowConnection>;
  const network = value.network === 'mainnet' ? 'mainnet' : 'testnet';
  const keyId = typeof value.keyId === 'number' ? value.keyId : null;
  const address =
    typeof value.address === 'string' && value.address.length > 0 ? value.address : null;
  const connected = Boolean(value.connected && address && keyId !== null);
  return {
    connected,
    address,
    keyId,
    network,
  };
}

function normalizeEvmConnection(raw: unknown): EvmConnection {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_EVM_CONNECTION;
  }
  const value = raw as Partial<EvmConnection>;
  return {
    connected: Boolean(value.connected),
    address: typeof value.address === 'string' ? value.address : null,
    chainId:
      typeof value.chainId === 'number' && Number.isFinite(value.chainId)
        ? Math.floor(value.chainId)
        : DEFAULT_EVM_CONNECTION.chainId,
    rpcUrl:
      typeof value.rpcUrl === 'string' && value.rpcUrl.length > 0
        ? value.rpcUrl
        : DEFAULT_EVM_CONNECTION.rpcUrl,
  };
}

async function getFlowConnection(): Promise<FlowConnection> {
  const result = await chrome.storage.local.get(FLOW_CONNECTION_KEY);
  return normalizeFlowConnection(result[FLOW_CONNECTION_KEY]);
}

async function setFlowConnection(connection: FlowConnection): Promise<void> {
  await chrome.storage.local.set({ [FLOW_CONNECTION_KEY]: connection });
}

async function getEvmConnection(): Promise<EvmConnection> {
  const result = await chrome.storage.local.get(EVM_CONNECTION_KEY);
  return normalizeEvmConnection(result[EVM_CONNECTION_KEY]);
}

async function setEvmConnection(connection: EvmConnection): Promise<void> {
  await chrome.storage.local.set({ [EVM_CONNECTION_KEY]: connection });
}

function sanitizeFlowAddress(address: string): string {
  const trimmed = address.trim().toLowerCase();
  const normalized = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  if (!/^0x[0-9a-f]{16}$/.test(normalized)) {
    throw new Error('Flow address must be 16 hex chars (0x...)');
  }
  return normalized;
}

function sanitizeHexInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '0x';
  }
  const normalized = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
  if (!/^[0-9a-fA-F]*$/.test(normalized)) {
    throw new Error('Invalid hex value');
  }
  return `0x${normalized.toLowerCase()}`;
}

function hexToBytes(hexValue: string): Uint8Array {
  const normalized = hexValue.startsWith('0x') ? hexValue.slice(2) : hexValue;
  if (normalized.length === 0) {
    return new Uint8Array();
  }
  const padded = normalized.length % 2 === 0 ? normalized : `0${normalized}`;
  const bytes = new Uint8Array(padded.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    const start = index * 2;
    bytes[index] = Number.parseInt(padded.slice(start, start + 2), 16);
  }
  return bytes;
}

async function withUnlockedSeedKey(): Promise<SeedPhraseKey> {
  if (!unlockedVault) {
    throw new Error('Wallet is locked');
  }
  await touchAutoLock();
  return await SeedPhraseKey.createAdvanced(
    {
      mnemonic: unlockedVault.mnemonic,
      passphrase: '',
      derivationPath: BIP44_PATHS.FLOW,
    },
    new MemoryStorage()
  );
}

function getFlowAccessNode(network: 'mainnet' | 'testnet'): string {
  return network === 'mainnet'
    ? NETWORKS.FLOW_MAINNET.rpcEndpoint
    : NETWORKS.FLOW_TESTNET.rpcEndpoint;
}

async function scheduleAutoLock(minutes: number): Promise<void> {
  if (!unlockedVault) {
    sessionExpiresAt = null;
    await chrome.alarms.clear(AUTO_LOCK_ALARM);
    return;
  }

  const when = Date.now() + minutes * 60 * 1000;
  sessionExpiresAt = when;
  await chrome.alarms.clear(AUTO_LOCK_ALARM);
  await chrome.alarms.create(AUTO_LOCK_ALARM, { when });
}

async function touchAutoLock(): Promise<void> {
  if (!unlockedVault) {
    return;
  }
  const minutes = await getAutoLockMinutes();
  await scheduleAutoLock(minutes);
}

async function hasVault(): Promise<boolean> {
  const result = await chrome.storage.local.get(VAULT_KEY);
  return Boolean(result[VAULT_KEY]);
}

async function getEncryptedVault(): Promise<unknown | null> {
  const result = await chrome.storage.local.get(VAULT_KEY);
  return result[VAULT_KEY] ?? null;
}

async function saveEncryptedVault(vault: unknown): Promise<void> {
  await chrome.storage.local.set({ [VAULT_KEY]: vault });
}

async function decryptVaultWithPassword(password: string): Promise<VaultPayload> {
  const encrypted = await getEncryptedVault();
  if (!encrypted) {
    throw new Error('No vault found');
  }

  const decrypted = (await encryptor.decrypt(password, encrypted)) as VaultPayload;
  if (!decrypted?.mnemonic || !decrypted?.account) {
    throw new Error('Corrupted vault data');
  }

  return decrypted;
}

async function buildState(vaultExists: boolean): Promise<WalletOnboardingState> {
  const autoLockMinutes = await getAutoLockMinutes();
  const flowConnection = await getFlowConnection();
  const evmConnection = await getEvmConnection();

  if (!vaultExists) {
    return {
      stage: 'empty',
      hasVault: false,
      unlocked: false,
      account: null,
      seedPhrase: null,
      createdAt: null,
      autoLockMinutes,
      sessionExpiresAt: null,
      flowConnection,
      evmConnection,
    };
  }

  if (!unlockedVault) {
    return {
      stage: 'locked',
      hasVault: true,
      unlocked: false,
      account: null,
      seedPhrase: null,
      createdAt: null,
      autoLockMinutes,
      sessionExpiresAt: null,
      flowConnection,
      evmConnection,
    };
  }

  if (!unlockedVault.backedUp) {
    return {
      stage: 'seed-generated',
      hasVault: true,
      unlocked: true,
      account: unlockedVault.account,
      seedPhrase: unlockedVault.mnemonic,
      createdAt: unlockedVault.createdAt,
      autoLockMinutes,
      sessionExpiresAt,
      flowConnection,
      evmConnection,
    };
  }

  return {
    stage: 'completed',
    hasVault: true,
    unlocked: true,
    account: unlockedVault.account,
    seedPhrase: null,
    createdAt: unlockedVault.createdAt,
    autoLockMinutes,
    sessionExpiresAt,
    flowConnection,
    evmConnection,
  };
}

async function deriveWalletAccount(mnemonic: string): Promise<CreatedWalletAccount> {
  const key = await SeedPhraseKey.createAdvanced(
    {
      mnemonic,
      passphrase: '',
      derivationPath: BIP44_PATHS.FLOW,
    },
    new MemoryStorage()
  );

  const evmAddress = await key.ethAddress(0);
  const flowPublicKeyBytes = await key.publicKey(SignatureAlgorithm.ECDSA_P256, BIP44_PATHS.FLOW);
  if (!flowPublicKeyBytes) {
    throw new Error('Failed to derive Flow public key');
  }

  const flowPublicKey = await WalletCoreProvider.bytesToHex(new Uint8Array(flowPublicKeyBytes));

  return {
    evmAddress,
    flowPublicKey,
    derivationPath: BIP44_PATHS.FLOW,
  };
}

async function createVault(password: string): Promise<WalletOnboardingState> {
  validatePassword(password);

  const mnemonic = await generateBip39Mnemonic({ strength: 256 });
  const account = await deriveWalletAccount(mnemonic);

  const payload: VaultPayload = {
    mnemonic,
    account,
    createdAt: Date.now(),
    backedUp: false,
  };

  const encrypted = await encryptor.encrypt(password, payload);
  await saveEncryptedVault(encrypted);

  unlockedVault = payload;
  unlockedPassword = password;
  await touchAutoLock();

  return await buildState(true);
}

async function unlockVault(password: string): Promise<WalletOnboardingState> {
  validatePassword(password);

  const encrypted = await getEncryptedVault();
  if (!encrypted) {
    return await buildState(false);
  }

  unlockedVault = await decryptVaultWithPassword(password);
  unlockedPassword = password;
  await touchAutoLock();

  return await buildState(true);
}

async function lockVault(vaultExists: boolean): Promise<WalletOnboardingState> {
  unlockedVault = null;
  unlockedPassword = null;
  sessionExpiresAt = null;
  await chrome.alarms.clear(AUTO_LOCK_ALARM);
  return await buildState(vaultExists);
}

async function completeSeedBackup(): Promise<WalletOnboardingState> {
  if (!unlockedVault || !unlockedPassword) {
    throw new Error('Wallet is locked');
  }

  unlockedVault = {
    ...unlockedVault,
    backedUp: true,
  };

  const encrypted = await encryptor.encrypt(unlockedPassword, unlockedVault);
  await saveEncryptedVault(encrypted);
  await touchAutoLock();

  return await buildState(true);
}

async function changePassword(
  oldPassword: string,
  newPassword: string
): Promise<WalletOnboardingState> {
  validatePassword(oldPassword);
  validatePassword(newPassword);

  const decrypted = await decryptVaultWithPassword(oldPassword);
  const encrypted = await encryptor.encrypt(newPassword, decrypted);
  await saveEncryptedVault(encrypted);

  unlockedVault = decrypted;
  unlockedPassword = newPassword;
  await touchAutoLock();

  return await buildState(true);
}

async function revealSeed(password: string): Promise<string> {
  validatePassword(password);

  if (unlockedVault && unlockedPassword === password) {
    await touchAutoLock();
    return unlockedVault.mnemonic;
  }

  const decrypted = await decryptVaultWithPassword(password);
  if (unlockedVault) {
    await touchAutoLock();
  }
  return decrypted.mnemonic;
}

async function updateAutoLock(minutes: number): Promise<WalletOnboardingState> {
  const normalized = await setAutoLockMinutes(minutes);
  if (unlockedVault) {
    await scheduleAutoLock(normalized);
  }
  return await buildState(await hasVault());
}

async function resetVault(): Promise<WalletOnboardingState> {
  await chrome.storage.local.remove(VAULT_KEY);
  await lockVault(false);
  return await buildState(false);
}

async function connectFlow(
  addressInput: string,
  keyIdInput: number,
  network: 'mainnet' | 'testnet'
): Promise<WalletOnboardingState> {
  if (!unlockedVault) {
    throw new Error('Unlock wallet first');
  }
  const address = sanitizeFlowAddress(addressInput);
  const keyId = Number.isFinite(keyIdInput) ? Math.max(0, Math.floor(keyIdInput)) : 0;
  await setFlowConnection({
    connected: true,
    address,
    keyId,
    network,
  });
  await touchAutoLock();
  return await buildState(await hasVault());
}

async function disconnectFlow(): Promise<WalletOnboardingState> {
  await setFlowConnection(DEFAULT_FLOW_CONNECTION);
  return await buildState(await hasVault());
}

async function connectEvm(
  chainIdInput: number,
  rpcUrlInput: string
): Promise<WalletOnboardingState> {
  if (!unlockedVault) {
    throw new Error('Unlock wallet first');
  }
  const rpcUrl = rpcUrlInput.trim();
  if (!rpcUrl) {
    throw new Error('RPC URL is required');
  }
  const chainId = Number.isFinite(chainIdInput) ? Math.max(1, Math.floor(chainIdInput)) : 1;
  await setEvmConnection({
    connected: true,
    address: unlockedVault.account.evmAddress,
    chainId,
    rpcUrl,
  });
  await touchAutoLock();
  return await buildState(await hasVault());
}

async function disconnectEvm(): Promise<WalletOnboardingState> {
  await setEvmConnection(DEFAULT_EVM_CONNECTION);
  return await buildState(await hasVault());
}

async function signFlowMessage(message: string): Promise<{ signature: string; digest: string }> {
  const connection = await getFlowConnection();
  if (!connection.connected || !connection.address || connection.keyId === null) {
    throw new Error('Flow not connected');
  }
  if (!message.trim()) {
    throw new Error('Message is required');
  }
  const key = await withUnlockedSeedKey();
  const payload = new TextEncoder().encode(message);
  const signatureBytes = await key.sign(
    payload,
    SignatureAlgorithm.ECDSA_P256,
    HashAlgorithm.SHA3_256
  );
  const signature = await WalletCoreProvider.bytesToHex(signatureBytes);
  const digest = await WalletCoreProvider.bytesToHex(await WalletCoreProvider.hashSHA3(payload));
  return {
    signature,
    digest,
  };
}

async function sendFlowTransaction(cadence: string, gasLimit?: number): Promise<{ txId: string }> {
  const connection = await getFlowConnection();
  if (!connection.connected || !connection.address || connection.keyId === null) {
    throw new Error('Flow not connected');
  }
  const trimmedCadence = cadence.trim();
  if (!trimmedCadence) {
    throw new Error('Cadence transaction is required');
  }

  const key = await withUnlockedSeedKey();
  const address = connection.address;
  const keyId = connection.keyId;

  fcl.config().put('accessNode.api', getFlowAccessNode(connection.network));

  const authz = (account: any) => ({
    ...account,
    tempId: `${address}-${keyId}`,
    addr: fcl.sansPrefix(address),
    keyId,
    signingFunction: async (signable: { message: string }) => {
      const signatureBytes = await key.sign(
        hexToBytes(sanitizeHexInput(signable.message)),
        SignatureAlgorithm.ECDSA_P256,
        HashAlgorithm.SHA3_256
      );
      const signature = await WalletCoreProvider.bytesToHex(signatureBytes);
      return {
        addr: fcl.withPrefix(address),
        keyId,
        signature,
      };
    },
  });

  const txId = await fcl.mutate({
    cadence: trimmedCadence,
    args: () => [],
    proposer: authz,
    payer: authz,
    authorizations: [authz],
    limit: Number.isFinite(gasLimit) ? Math.max(100, Math.floor(gasLimit ?? 999)) : 999,
  });

  await touchAutoLock();
  return { txId };
}

async function signEvmMessage(message: string): Promise<{ signature: string; digest: string }> {
  const connection = await getEvmConnection();
  if (!connection.connected) {
    throw new Error('EVM not connected');
  }
  if (!message.trim()) {
    throw new Error('Message is required');
  }
  const key = await withUnlockedSeedKey();
  const signed = await key.ethSignPersonalMessage(message, 0);
  return {
    signature: signed.signature,
    digest: signed.digest,
  };
}

async function sendEvmTransaction(payload: {
  to: string;
  valueWei?: string;
  data?: string;
  gasLimit?: number;
  gasPriceWei?: string;
}): Promise<{ txHash: string; rawTransaction: string }> {
  const connection = await getEvmConnection();
  if (!connection.connected) {
    throw new Error('EVM not connected');
  }
  if (!payload.to || !/^0x[a-fA-F0-9]{40}$/.test(payload.to)) {
    throw new Error('Invalid EVM to address');
  }
  const key = await withUnlockedSeedKey();
  const fromAddress = connection.address ?? unlockedVault?.account.evmAddress;
  if (!fromAddress) {
    throw new Error('Missing EVM sender address');
  }

  const provider = new EthProvider(connection.rpcUrl);
  const nonce = await provider.getTransactionCount(fromAddress);
  const gasPrice = payload.gasPriceWei ?? (await provider.getGasPrice());
  const gasLimit = Number.isFinite(payload.gasLimit)
    ? Math.max(21_000, Math.floor(payload.gasLimit!))
    : 21_000;
  const valueWei = payload.valueWei ?? '0';

  const signed = await key.ethSignTransaction(
    {
      chainId: connection.chainId,
      nonce,
      gasLimit,
      gasPrice,
      to: payload.to,
      value: valueWei,
      data: payload.data ? sanitizeHexInput(payload.data) : '0x',
    },
    0
  );

  const txHash = await provider.sendRawTransaction(signed.rawTransaction);
  await touchAutoLock();
  return {
    txHash,
    rawTransaction: signed.rawTransaction,
  };
}

async function getActiveTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

async function setupSidePanelBehavior(): Promise<void> {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== AUTO_LOCK_ALARM) {
    return;
  }
  void (async () => {
    const exists = await hasVault();
    await lockVault(exists);
  })();
});

chrome.runtime.onInstalled.addListener(() => {
  void setupSidePanelBehavior();
  void getAutoLockMinutes();
});

chrome.runtime.onStartup.addListener(() => {
  void setupSidePanelBehavior();
});

chrome.runtime.onMessage.addListener((request: BackgroundRequest, _sender, sendResponse) => {
  void (async () => {
    try {
      switch (request.type) {
        case 'wallet:get-onboarding-state': {
          const state = await buildState(await hasVault());
          sendResponse({ ok: true, state } satisfies BackgroundResponse);
          return;
        }
        case 'wallet:create': {
          const state = await createVault(request.password);
          sendResponse({ ok: true, state } satisfies BackgroundResponse);
          return;
        }
        case 'wallet:unlock': {
          const state = await unlockVault(request.password);
          sendResponse({ ok: true, state } satisfies BackgroundResponse);
          return;
        }
        case 'wallet:lock': {
          const state = await lockVault(await hasVault());
          sendResponse({ ok: true, state } satisfies BackgroundResponse);
          return;
        }
        case 'wallet:complete-seed-backup': {
          const state = await completeSeedBackup();
          sendResponse({ ok: true, state } satisfies BackgroundResponse);
          return;
        }
        case 'wallet:change-password': {
          const state = await changePassword(request.oldPassword, request.newPassword);
          sendResponse({ ok: true, state } satisfies BackgroundResponse);
          return;
        }
        case 'wallet:reveal-seed': {
          const seedPhrase = await revealSeed(request.password);
          sendResponse({ ok: true, seedPhrase } satisfies BackgroundResponse);
          return;
        }
        case 'wallet:set-auto-lock': {
          const state = await updateAutoLock(request.minutes);
          sendResponse({ ok: true, state } satisfies BackgroundResponse);
          return;
        }
        case 'wallet:reset': {
          const state = await resetVault();
          sendResponse({ ok: true, state } satisfies BackgroundResponse);
          return;
        }
        case 'wallet:flow-connect': {
          const state = await connectFlow(request.address, request.keyId, request.network);
          sendResponse({ ok: true, state } satisfies BackgroundResponse);
          return;
        }
        case 'wallet:flow-disconnect': {
          const state = await disconnectFlow();
          sendResponse({ ok: true, state } satisfies BackgroundResponse);
          return;
        }
        case 'wallet:flow-sign-message': {
          const signed = await signFlowMessage(request.message);
          sendResponse({
            ok: true,
            signature: signed.signature,
            digest: signed.digest,
          } satisfies BackgroundResponse);
          return;
        }
        case 'wallet:flow-send-transaction': {
          const result = await sendFlowTransaction(request.cadence, request.gasLimit);
          sendResponse({ ok: true, txId: result.txId } satisfies BackgroundResponse);
          return;
        }
        case 'wallet:evm-connect': {
          const state = await connectEvm(request.chainId, request.rpcUrl);
          sendResponse({ ok: true, state } satisfies BackgroundResponse);
          return;
        }
        case 'wallet:evm-disconnect': {
          const state = await disconnectEvm();
          sendResponse({ ok: true, state } satisfies BackgroundResponse);
          return;
        }
        case 'wallet:evm-sign-message': {
          const signed = await signEvmMessage(request.message);
          sendResponse({
            ok: true,
            signature: signed.signature,
            digest: signed.digest,
          } satisfies BackgroundResponse);
          return;
        }
        case 'wallet:evm-send-transaction': {
          const tx = await sendEvmTransaction({
            to: request.to,
            valueWei: request.valueWei,
            data: request.data,
            gasLimit: request.gasLimit,
            gasPriceWei: request.gasPriceWei,
          });
          sendResponse({
            ok: true,
            txHash: tx.txHash,
            rawTransaction: tx.rawTransaction,
          } satisfies BackgroundResponse);
          return;
        }
        case 'ui:open-sidepanel': {
          const tabId = await getActiveTabId();
          if (!tabId) {
            sendResponse({ ok: false, reason: 'No active tab' } satisfies BackgroundResponse);
            return;
          }
          await chrome.sidePanel.open({ tabId });
          sendResponse({ ok: true, opened: true } satisfies BackgroundResponse);
          return;
        }
      }
    } catch (error) {
      const causeMessage =
        error && typeof error === 'object' && 'cause' in error
          ? String((error as { cause?: unknown }).cause)
          : '';
      sendResponse({
        ok: false,
        reason:
          error instanceof Error
            ? causeMessage
              ? `${error.message}: ${causeMessage}`
              : error.message
            : 'Unknown background error',
      } satisfies BackgroundResponse);
    }
  })();

  return true;
});
