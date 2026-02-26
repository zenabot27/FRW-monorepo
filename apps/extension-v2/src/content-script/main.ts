type ProviderRequestMessage = {
  source: 'frw:inpage';
  id: string;
  scope: 'ethereum' | 'flow';
  method: string;
  params: unknown[];
};

type ProviderResponseMessage = {
  source: 'frw:content-script';
  id: string;
  ok: boolean;
  result?: unknown;
  error?: { code: number; message: string };
};

function injectInpageProvider(): void {
  if (document.getElementById('frw-extension-v2-provider')) {
    return;
  }
  const script = document.createElement('script');
  script.id = 'frw-extension-v2-provider';
  script.src = chrome.runtime.getURL('inpage-provider.js');
  (document.head || document.documentElement).appendChild(script);
}

injectInpageProvider();

window.addEventListener('message', (event: MessageEvent<ProviderRequestMessage>) => {
  if (event.source !== window || !event.data || event.data.source !== 'frw:inpage') {
    return;
  }

  const payload = event.data;
  void (async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'provider:rpc-request',
        scope: payload.scope,
        origin: window.location.origin,
        method: payload.method,
        params: payload.params,
      });

      if (!response?.ok) {
        throw new Error(response?.reason || 'Provider request failed');
      }

      const message: ProviderResponseMessage = {
        source: 'frw:content-script',
        id: payload.id,
        ok: true,
        result: response.result,
      };
      window.postMessage(message, '*');
    } catch (error) {
      const message: ProviderResponseMessage = {
        source: 'frw:content-script',
        id: payload.id,
        ok: false,
        error: {
          code: 4001,
          message: error instanceof Error ? error.message : 'Provider request failed',
        },
      };
      window.postMessage(message, '*');
    }
  })();
});
