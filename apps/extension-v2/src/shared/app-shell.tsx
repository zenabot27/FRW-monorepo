import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  H1,
  H2,
  Input,
  Paragraph,
  ScrollView,
  Separator,
  Spinner,
  SizableText,
  XStack,
  YStack,
} from 'tamagui';

import {
  connectEvmWallet,
  connectFlowWallet,
  changeWalletPassword,
  completeSeedBackup,
  createWallet,
  disconnectEvmWallet,
  disconnectFlowWallet,
  evmSendTransaction,
  evmSignMessage,
  flowSendTransaction,
  flowSignMessage,
  getApprovalRequest,
  getOnboardingState,
  lockWallet,
  openSidePanelFromUi,
  resetWallet,
  resolveApprovalRequest,
  revealSeedPhrase,
  setAutoLockMinutes,
  unlockWallet,
} from './extension-api';
import type { UiSurface, WalletOnboardingState } from './types';

type AppShellProps = {
  surface: UiSurface;
  approvalRequestId?: string | null;
};

function wordsFromSeed(seedPhrase: string | null): string[] {
  if (!seedPhrase) {
    return [];
  }
  return seedPhrase.split(' ').filter(Boolean);
}

function shortHex(value: string, head = 10, tail = 8): string {
  if (value.length <= head + tail) {
    return value;
  }
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function SeedGrid({ words }: { words: string[] }) {
  return (
    <YStack gap="$2">
      {words.map((word, index) => (
        <XStack
          key={`${index}-${word}`}
          justifyContent="space-between"
          alignItems="center"
          padding="$2"
          borderWidth={1}
          borderColor="rgba(255, 255, 255, 0.14)"
          borderRadius="$6"
          backgroundColor="rgba(255, 255, 255, 0.04)"
          className="seed-pill"
        >
          <SizableText size="$2" color="#9eb2d3" fontWeight="700">
            {index + 1}
          </SizableText>
          <SizableText size="$3" fontWeight="800" color="#f5f9ff">
            {word}
          </SizableText>
        </XStack>
      ))}
    </YStack>
  );
}

export function AppShell({ surface, approvalRequestId }: AppShellProps) {
  const [state, setState] = useState<WalletOnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>('');

  const [createPassword, setCreatePassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [unlockPassword, setUnlockPassword] = useState('');
  const [revealPassword, setRevealPassword] = useState('');
  const [revealedSeed, setRevealedSeed] = useState('');

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [autoLockInput, setAutoLockInput] = useState('15');
  const [flowAddressInput, setFlowAddressInput] = useState('');
  const [flowKeyIdInput, setFlowKeyIdInput] = useState('0');
  const [flowNetworkInput, setFlowNetworkInput] = useState<'mainnet' | 'testnet'>('testnet');
  const [evmChainIdInput, setEvmChainIdInput] = useState('545');
  const [evmRpcInput, setEvmRpcInput] = useState('https://testnet.evm.nodes.onflow.org');
  const [signMessageInput, setSignMessageInput] = useState('hello frw wallet v2');
  const [flowCadenceInput, setFlowCadenceInput] = useState(
    'transaction { prepare(signer: auth(BorrowValue) &Account) {} }'
  );
  const [evmToInput, setEvmToInput] = useState('');
  const [evmValueInput, setEvmValueInput] = useState('0');
  const [evmDataInput, setEvmDataInput] = useState('0x');
  const [resultOutput, setResultOutput] = useState('');
  const [approvalPayload, setApprovalPayload] = useState<{
    id: string;
    origin: string;
    scope: 'ethereum' | 'flow';
    method: string;
    params: unknown[];
  } | null>(null);

  useEffect(() => {
    if (!approvalRequestId) {
      return;
    }
    let mounted = true;
    void getApprovalRequest(approvalRequestId)
      .then((payload) => {
        if (mounted) {
          setApprovalPayload(payload);
        }
      })
      .catch((nextError) => {
        if (mounted) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to load approval');
        }
      });
    return () => {
      mounted = false;
    };
  }, [approvalRequestId]);

  useEffect(() => {
    let mounted = true;
    void getOnboardingState()
      .then((next) => {
        if (mounted) {
          setState(next);
          setAutoLockInput(String(next.autoLockMinutes));
          syncLocalConnectionInputs(next);
        }
      })
      .catch((nextError) => {
        if (mounted) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to load wallet state');
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const seedWords = useMemo(() => wordsFromSeed(state?.seedPhrase ?? null), [state?.seedPhrase]);
  const revealedSeedWords = useMemo(() => wordsFromSeed(revealedSeed || null), [revealedSeed]);

  async function runTask(task: () => Promise<WalletOnboardingState>): Promise<void> {
    setBusy(true);
    setError('');
    try {
      const next = await task();
      setState(next);
      setAutoLockInput(String(next.autoLockMinutes));
      setFlowAddressInput(next.flowConnection.address ?? '');
      setFlowKeyIdInput(String(next.flowConnection.keyId ?? 0));
      setFlowNetworkInput(next.flowConnection.network);
      setEvmChainIdInput(String(next.evmConnection.chainId));
      setEvmRpcInput(next.evmConnection.rpcUrl);
      setUnlockPassword('');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function runSeedReveal(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      const seed = await revealSeedPhrase(revealPassword);
      setRevealedSeed(seed);
      const next = await getOnboardingState();
      setState(next);
      setAutoLockInput(String(next.autoLockMinutes));
      setFlowAddressInput(next.flowConnection.address ?? '');
      setFlowKeyIdInput(String(next.flowConnection.keyId ?? 0));
      setFlowNetworkInput(next.flowConnection.network);
      setEvmChainIdInput(String(next.evmConnection.chainId));
      setEvmRpcInput(next.evmConnection.rpcUrl);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Reveal failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <YStack className="wallet-surface" alignItems="center" justifyContent="center">
        <Spinner size="large" color="$cyan10" />
        <SizableText marginTop="$3" color="$gray10">
          Loading secure vault...
        </SizableText>
      </YStack>
    );
  }

  if (!state) {
    return (
      <YStack className="wallet-surface" alignItems="center" justifyContent="center" padding="$4">
        <Card bordered className="glass-card" maxWidth={440} width="100%">
          <Card.Header>
            <H2 color="#f8fbff">无法连接扩展上下文</H2>
            <Paragraph color="#a8b8d6">
              当前页面不在 Chrome Extension runtime 中，钱包状态 API 不可用。
            </Paragraph>
            <Paragraph color="#92a5c9">
              请到 chrome://extensions 加载 unpacked 的 dist 目录后，从 popup 或 sidepanel 打开。
            </Paragraph>
            {error ? <SizableText color="#ff7d97">{error}</SizableText> : null}
          </Card.Header>
        </Card>
      </YStack>
    );
  }

  async function handleApprovalResolution(approved: boolean): Promise<void> {
    if (!approvalRequestId) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await resolveApprovalRequest(approvalRequestId, approved);
      window.close();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to resolve approval');
    } finally {
      setBusy(false);
    }
  }

  if (approvalRequestId) {
    return (
      <YStack className="wallet-surface" padding="$4" justifyContent="center" minHeight="100%">
        <Card elevate bordered className="glass-card">
          <Card.Header>
            <H2 color="#f8fbff">Request Approval</H2>
            <Paragraph color="#a8b8d6">
              {approvalPayload
                ? `${approvalPayload.origin} requests ${approvalPayload.method}`
                : 'Loading request...'}
            </Paragraph>
            {approvalPayload ? (
              <Paragraph color="#92a5c9">
                Scope: {approvalPayload.scope} | Params: {JSON.stringify(approvalPayload.params)}
              </Paragraph>
            ) : null}
            {error ? <SizableText color="#ff7d97">{error}</SizableText> : null}
          </Card.Header>
          <Card.Footer>
            <XStack width="100%" gap="$2">
              <Button
                flex={1}
                className="danger-btn"
                disabled={busy}
                onPress={() => {
                  void handleApprovalResolution(false);
                }}
              >
                Reject
              </Button>
              <Button
                flex={1}
                className="gradient-btn"
                disabled={busy || !approvalPayload}
                onPress={() => {
                  void handleApprovalResolution(true);
                }}
              >
                Approve
              </Button>
            </XStack>
          </Card.Footer>
        </Card>
      </YStack>
    );
  }

  function syncLocalConnectionInputs(nextState: WalletOnboardingState): void {
    setFlowAddressInput(nextState.flowConnection.address ?? '');
    setFlowKeyIdInput(String(nextState.flowConnection.keyId ?? 0));
    setFlowNetworkInput(nextState.flowConnection.network);
    setEvmChainIdInput(String(nextState.evmConnection.chainId));
    setEvmRpcInput(nextState.evmConnection.rpcUrl);
  }

  return (
    <YStack className="wallet-surface">
      <YStack className="ambient-glow" />
      <YStack className="ambient-orb ambient-orb-left" />
      <YStack className="ambient-orb ambient-orb-right" />
      <ScrollView flex={1} showsVerticalScrollIndicator={false}>
        <YStack
          maxWidth={surface === 'popup' ? 460 : 1020}
          marginHorizontal="auto"
          padding="$4"
          gap="$4"
          className="wallet-frame"
        >
          <Card
            elevate
            bordered
            animation="quick"
            enterStyle={{ opacity: 0, y: -8 }}
            opacity={1}
            y={0}
            className="glass-card hero-card"
          >
            <Card.Header>
              <XStack alignItems="center" justifyContent="space-between" gap="$3">
                <YStack>
                  <H1 size="$8" color="#fbfdff" fontWeight="900">
                    Flow Wallet
                  </H1>
                  <Paragraph color="#a8b8d6">
                    {surface === 'popup'
                      ? 'Fast popup onboarding with secure vault'
                      : 'Sidebar experience with full wallet controls'}
                  </Paragraph>
                </YStack>
                <YStack alignItems="flex-end">
                  <SizableText size="$2" color="#59d7ff" fontWeight="800">
                    {state.stage.toUpperCase()}
                  </SizableText>
                  <SizableText size="$1" color="#92a5c9">
                    Auto-lock {state.autoLockMinutes}m
                  </SizableText>
                </YStack>
              </XStack>
            </Card.Header>
          </Card>

          {error ? (
            <Card bordered backgroundColor="rgba(255, 89, 118, 0.12)" className="glass-card">
              <Card.Header paddingVertical="$2">
                <SizableText color="#ff7d97">{error}</SizableText>
              </Card.Header>
            </Card>
          ) : null}

          {state.stage === 'empty' && (
            <Card elevate bordered className="glass-card">
              <Card.Header>
                <H2 color="#f8fbff">Create Encrypted Vault</H2>
                <Paragraph color="#a8b8d6">
                  Use password-protected vault storage before any key material is persisted.
                </Paragraph>
              </Card.Header>
              <Card.Footer>
                <YStack width="100%" gap="$3">
                  <Input
                    size="$4"
                    secureTextEntry
                    placeholder="Set password (min 8 chars)"
                    value={createPassword}
                    onChangeText={setCreatePassword}
                  />
                  <Input
                    size="$4"
                    secureTextEntry
                    placeholder="Confirm password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                  />
                  <Button
                    size="$4"
                    className="gradient-btn"
                    disabled={
                      busy ||
                      createPassword.length < 8 ||
                      confirmPassword.length < 8 ||
                      createPassword !== confirmPassword
                    }
                    onPress={() => {
                      void runTask(async () => await createWallet(createPassword));
                    }}
                  >
                    {busy ? 'Creating...' : 'Create Wallet'}
                  </Button>
                </YStack>
              </Card.Footer>
            </Card>
          )}

          {state.stage === 'locked' && (
            <Card elevate bordered className="glass-card">
              <Card.Header>
                <H2 color="#f8fbff">Unlock Vault</H2>
                <Paragraph color="#a8b8d6">
                  Decrypt in-memory session for wallet operations.
                </Paragraph>
              </Card.Header>
              <Card.Footer>
                <YStack width="100%" gap="$3">
                  <Input
                    size="$4"
                    secureTextEntry
                    placeholder="Password"
                    value={unlockPassword}
                    onChangeText={setUnlockPassword}
                  />
                  <XStack gap="$2">
                    <Button
                      flex={1}
                      className="danger-btn"
                      disabled={busy}
                      onPress={() => {
                        void runTask(async () => await resetWallet());
                      }}
                    >
                      Reset Vault
                    </Button>
                    <Button
                      flex={1}
                      className="gradient-btn"
                      disabled={busy || unlockPassword.length < 8}
                      onPress={() => {
                        void runTask(async () => await unlockWallet(unlockPassword));
                      }}
                    >
                      Unlock
                    </Button>
                  </XStack>
                </YStack>
              </Card.Footer>
            </Card>
          )}

          {state.stage === 'seed-generated' && (
            <Card elevate bordered className="glass-card">
              <Card.Header>
                <H2 color="#f8fbff">Backup Seed Phrase</H2>
                <Paragraph color="#a8b8d6">Write these 24 words offline in exact order.</Paragraph>
              </Card.Header>
              <Card.Footer>
                <YStack width="100%" gap="$3">
                  <SeedGrid words={seedWords} />
                  <XStack gap="$2">
                    <Button
                      flex={1}
                      className="ghost-btn"
                      disabled={busy}
                      onPress={() => {
                        void runTask(async () => await lockWallet());
                      }}
                    >
                      Lock
                    </Button>
                    <Button
                      flex={1}
                      className="gradient-btn"
                      disabled={busy}
                      onPress={() => {
                        void runTask(async () => await completeSeedBackup());
                      }}
                    >
                      I Have Backed Up
                    </Button>
                  </XStack>
                </YStack>
              </Card.Footer>
            </Card>
          )}

          {state.stage === 'completed' && state.account && (
            <XStack gap="$4" flex={1} flexDirection={surface === 'sidepanel' ? 'row' : 'column'}>
              <YStack flex={1} gap="$4">
                <Card elevate bordered className="glass-card">
                  <Card.Header>
                    <H2 color="#f8fbff">Wallet Ready</H2>
                    <Paragraph color="#a8b8d6">
                      Encrypted at rest. Session memory only while unlocked.
                    </Paragraph>
                  </Card.Header>
                  <Card.Footer>
                    <YStack width="100%" gap="$3">
                      <YStack>
                        <SizableText size="$2" color="#92a5c9">
                          EVM Address
                        </SizableText>
                        <SizableText size="$4" fontWeight="800" color="#f6faff">
                          {shortHex(state.account.evmAddress)}
                        </SizableText>
                      </YStack>
                      <Separator />
                      <YStack>
                        <SizableText size="$2" color="#92a5c9">
                          Flow Public Key (P-256)
                        </SizableText>
                        <SizableText size="$3" fontWeight="700" color="#f6faff">
                          {shortHex(state.account.flowPublicKey, 16, 12)}
                        </SizableText>
                        <SizableText size="$1" color="#92a5c9">
                          {state.account.derivationPath}
                        </SizableText>
                      </YStack>
                    </YStack>
                  </Card.Footer>
                </Card>

                <Card elevate bordered className="glass-card">
                  <Card.Header>
                    <H2 color="#f8fbff">Actions</H2>
                  </Card.Header>
                  <Card.Footer>
                    <YStack width="100%" gap="$2">
                      <Button
                        className="ghost-btn"
                        disabled={busy}
                        onPress={() => {
                          void runTask(async () => await lockWallet());
                        }}
                      >
                        Lock
                      </Button>
                      <Button
                        className="gradient-btn"
                        onPress={() => {
                          void openSidePanelFromUi();
                        }}
                      >
                        Open Sidebar
                      </Button>
                    </YStack>
                  </Card.Footer>
                </Card>

                <Card elevate bordered className="glass-card">
                  <Card.Header>
                    <H2 color="#f8fbff">Connect / Sign / Tx</H2>
                    <Paragraph color="#a8b8d6">
                      FCL + EVM connection and signing operations.
                    </Paragraph>
                  </Card.Header>
                  <Card.Footer>
                    <YStack width="100%" gap="$3">
                      <YStack gap="$2">
                        <SizableText size="$2" color="#92a5c9">
                          Flow (FCL)
                        </SizableText>
                        <Input
                          size="$4"
                          placeholder="Flow address (0x...)"
                          value={flowAddressInput}
                          onChangeText={setFlowAddressInput}
                        />
                        <XStack gap="$2">
                          <Input
                            flex={1}
                            size="$4"
                            keyboardType="numeric"
                            placeholder="Key ID"
                            value={flowKeyIdInput}
                            onChangeText={setFlowKeyIdInput}
                          />
                          <Input
                            flex={1}
                            size="$4"
                            placeholder="mainnet / testnet"
                            value={flowNetworkInput}
                            onChangeText={(value) => {
                              setFlowNetworkInput(value === 'mainnet' ? 'mainnet' : 'testnet');
                            }}
                          />
                        </XStack>
                        <XStack gap="$2">
                          <Button
                            flex={1}
                            className="ghost-btn"
                            disabled={busy}
                            onPress={() => {
                              void runTask(async () => {
                                const next = await connectFlowWallet(
                                  flowAddressInput,
                                  Number(flowKeyIdInput),
                                  flowNetworkInput
                                );
                                syncLocalConnectionInputs(next);
                                return next;
                              });
                            }}
                          >
                            Flow Connect
                          </Button>
                          <Button
                            flex={1}
                            className="ghost-btn"
                            disabled={busy}
                            onPress={() => {
                              void runTask(async () => {
                                const next = await disconnectFlowWallet();
                                syncLocalConnectionInputs(next);
                                return next;
                              });
                            }}
                          >
                            Flow Disconnect
                          </Button>
                        </XStack>
                      </YStack>

                      <Separator />

                      <YStack gap="$2">
                        <SizableText size="$2" color="#92a5c9">
                          EVM
                        </SizableText>
                        <XStack gap="$2">
                          <Input
                            flex={1}
                            size="$4"
                            keyboardType="numeric"
                            placeholder="Chain ID"
                            value={evmChainIdInput}
                            onChangeText={setEvmChainIdInput}
                          />
                          <Input
                            flex={1}
                            size="$4"
                            placeholder="RPC URL"
                            value={evmRpcInput}
                            onChangeText={setEvmRpcInput}
                          />
                        </XStack>
                        <XStack gap="$2">
                          <Button
                            flex={1}
                            className="ghost-btn"
                            disabled={busy}
                            onPress={() => {
                              void runTask(async () => {
                                const next = await connectEvmWallet(
                                  Number(evmChainIdInput),
                                  evmRpcInput
                                );
                                syncLocalConnectionInputs(next);
                                return next;
                              });
                            }}
                          >
                            EVM Connect
                          </Button>
                          <Button
                            flex={1}
                            className="ghost-btn"
                            disabled={busy}
                            onPress={() => {
                              void runTask(async () => {
                                const next = await disconnectEvmWallet();
                                syncLocalConnectionInputs(next);
                                return next;
                              });
                            }}
                          >
                            EVM Disconnect
                          </Button>
                        </XStack>
                      </YStack>

                      <Separator />

                      <YStack gap="$2">
                        <SizableText size="$2" color="#92a5c9">
                          Sign Message
                        </SizableText>
                        <Input
                          size="$4"
                          placeholder="Message to sign"
                          value={signMessageInput}
                          onChangeText={setSignMessageInput}
                        />
                        <XStack gap="$2">
                          <Button
                            flex={1}
                            className="ghost-btn"
                            disabled={busy}
                            onPress={() => {
                              void (async () => {
                                setBusy(true);
                                setError('');
                                try {
                                  const result = await flowSignMessage(signMessageInput);
                                  setResultOutput(
                                    `Flow signature: ${result.signature}\nDigest: ${result.digest ?? ''}`
                                  );
                                } catch (nextError) {
                                  setError(
                                    nextError instanceof Error
                                      ? nextError.message
                                      : 'Flow sign failed'
                                  );
                                } finally {
                                  setBusy(false);
                                }
                              })();
                            }}
                          >
                            Flow Sign
                          </Button>
                          <Button
                            flex={1}
                            className="ghost-btn"
                            disabled={busy}
                            onPress={() => {
                              void (async () => {
                                setBusy(true);
                                setError('');
                                try {
                                  const result = await evmSignMessage(signMessageInput);
                                  setResultOutput(
                                    `EVM signature: ${result.signature}\nDigest: ${result.digest ?? ''}`
                                  );
                                } catch (nextError) {
                                  setError(
                                    nextError instanceof Error
                                      ? nextError.message
                                      : 'EVM sign failed'
                                  );
                                } finally {
                                  setBusy(false);
                                }
                              })();
                            }}
                          >
                            EVM Sign
                          </Button>
                        </XStack>
                      </YStack>

                      <Separator />

                      <YStack gap="$2">
                        <SizableText size="$2" color="#92a5c9">
                          Send Transaction
                        </SizableText>
                        <Input
                          size="$4"
                          placeholder="Flow cadence transaction"
                          value={flowCadenceInput}
                          onChangeText={setFlowCadenceInput}
                        />
                        <Button
                          className="ghost-btn"
                          disabled={busy}
                          onPress={() => {
                            void (async () => {
                              setBusy(true);
                              setError('');
                              try {
                                const result = await flowSendTransaction(flowCadenceInput);
                                setResultOutput(`Flow txId: ${result.txId}`);
                              } catch (nextError) {
                                setError(
                                  nextError instanceof Error ? nextError.message : 'Flow tx failed'
                                );
                              } finally {
                                setBusy(false);
                              }
                            })();
                          }}
                        >
                          Send Flow Tx
                        </Button>

                        <Input
                          size="$4"
                          placeholder="EVM to address"
                          value={evmToInput}
                          onChangeText={setEvmToInput}
                        />
                        <XStack gap="$2">
                          <Input
                            flex={1}
                            size="$4"
                            placeholder="Value (wei)"
                            value={evmValueInput}
                            onChangeText={setEvmValueInput}
                          />
                          <Input
                            flex={1}
                            size="$4"
                            placeholder="Data (hex)"
                            value={evmDataInput}
                            onChangeText={setEvmDataInput}
                          />
                        </XStack>
                        <Button
                          className="ghost-btn"
                          disabled={busy}
                          onPress={() => {
                            void (async () => {
                              setBusy(true);
                              setError('');
                              try {
                                const result = await evmSendTransaction({
                                  to: evmToInput,
                                  valueWei: evmValueInput,
                                  data: evmDataInput,
                                });
                                setResultOutput(
                                  `EVM txHash: ${result.txHash}\nRaw: ${result.rawTransaction}`
                                );
                              } catch (nextError) {
                                setError(
                                  nextError instanceof Error ? nextError.message : 'EVM tx failed'
                                );
                              } finally {
                                setBusy(false);
                              }
                            })();
                          }}
                        >
                          Send EVM Tx
                        </Button>
                      </YStack>

                      {resultOutput ? (
                        <YStack gap="$2">
                          <SizableText size="$2" color="#92a5c9">
                            Result
                          </SizableText>
                          <Paragraph color="#d8e2f8">{resultOutput}</Paragraph>
                        </YStack>
                      ) : null}
                    </YStack>
                  </Card.Footer>
                </Card>
              </YStack>

              <YStack flex={1} gap="$4">
                <Card elevate bordered className="glass-card">
                  <Card.Header>
                    <H2 color="#f8fbff">Security Controls</H2>
                  </Card.Header>
                  <Card.Footer>
                    <YStack width="100%" gap="$3">
                      <YStack gap="$2">
                        <SizableText size="$2" color="#92a5c9">
                          Auto-lock minutes (1-240)
                        </SizableText>
                        <XStack gap="$2">
                          <Input
                            flex={1}
                            size="$4"
                            keyboardType="numeric"
                            value={autoLockInput}
                            onChangeText={setAutoLockInput}
                          />
                          <Button
                            className="ghost-btn"
                            disabled={busy}
                            onPress={() => {
                              void runTask(
                                async () => await setAutoLockMinutes(Number(autoLockInput))
                              );
                            }}
                          >
                            Save
                          </Button>
                        </XStack>
                      </YStack>

                      <Separator />

                      <YStack gap="$2">
                        <SizableText size="$2" color="#92a5c9">
                          Reveal seed phrase (password required)
                        </SizableText>
                        <XStack gap="$2">
                          <Input
                            flex={1}
                            size="$4"
                            secureTextEntry
                            placeholder="Current password"
                            value={revealPassword}
                            onChangeText={setRevealPassword}
                          />
                          <Button
                            className="ghost-btn"
                            disabled={busy || revealPassword.length < 8}
                            onPress={() => {
                              void runSeedReveal();
                            }}
                          >
                            Reveal
                          </Button>
                        </XStack>
                        {revealedSeedWords.length > 0 ? (
                          <SeedGrid words={revealedSeedWords} />
                        ) : null}
                      </YStack>

                      <Separator />

                      <YStack gap="$2">
                        <SizableText size="$2" color="#92a5c9">
                          Change password
                        </SizableText>
                        <Input
                          size="$4"
                          secureTextEntry
                          placeholder="Current password"
                          value={oldPassword}
                          onChangeText={setOldPassword}
                        />
                        <Input
                          size="$4"
                          secureTextEntry
                          placeholder="New password"
                          value={newPassword}
                          onChangeText={setNewPassword}
                        />
                        <Input
                          size="$4"
                          secureTextEntry
                          placeholder="Confirm new password"
                          value={newPasswordConfirm}
                          onChangeText={setNewPasswordConfirm}
                        />
                        <Button
                          className="ghost-btn"
                          disabled={
                            busy ||
                            oldPassword.length < 8 ||
                            newPassword.length < 8 ||
                            newPassword !== newPasswordConfirm
                          }
                          onPress={() => {
                            void runTask(
                              async () => await changeWalletPassword(oldPassword, newPassword)
                            );
                          }}
                        >
                          Change Password
                        </Button>
                      </YStack>
                    </YStack>
                  </Card.Footer>
                </Card>
              </YStack>
            </XStack>
          )}
        </YStack>
      </ScrollView>
    </YStack>
  );
}
