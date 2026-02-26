(() => {
  const w = globalThis;
  if (w.__FRW_EXTENSION_V2_INJECTED__) {
    return;
  }
  w.__FRW_EXTENSION_V2_INJECTED__ = true;

  const pending = new Map();
  let requestSeq = 0;

  function request(scope, method, params = []) {
    const id = `frw_${Date.now()}_${requestSeq++}`;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      w.postMessage(
        {
          source: 'frw:inpage',
          id,
          scope,
          method,
          params,
        },
        '*'
      );
    });
  }

  w.addEventListener('message', (event) => {
    if (event.source !== w || !event.data || event.data.source !== 'frw:content-script') {
      return;
    }
    const payload = event.data;
    const deferred = pending.get(payload.id);
    if (!deferred) return;
    pending.delete(payload.id);
    if (payload.ok) {
      deferred.resolve(payload.result);
    } else {
      deferred.reject(new Error(payload.error?.message || 'Provider request failed'));
    }
  });

  const ethereumProvider = {
    isFRW: true,
    isMetaMask: false,
    async request(payload) {
      return await request('ethereum', payload.method, payload.params ?? []);
    },
    on() {},
    removeListener() {},
  };

  const fclProvider = {
    async connect() {
      return await request('flow', 'fcl_connect', []);
    },
    async disconnect() {
      return await request('flow', 'fcl_disconnect', []);
    },
    currentUser: {
      async snapshot() {
        return await request('flow', 'fcl_snapshot', []);
      },
      subscribe(callback) {
        request('flow', 'fcl_snapshot', [])
          .then(callback)
          .catch(() => undefined);
        return () => undefined;
      },
    },
    async mutate(config) {
      return await request('flow', 'fcl_mutate', [config]);
    },
    async signMessage(message) {
      return await request('flow', 'fcl_sign_message', [message]);
    },
  };

  Object.defineProperty(w, 'ethereum', {
    configurable: true,
    enumerable: true,
    writable: false,
    value: ethereumProvider,
  });

  Object.defineProperty(w, 'fcl', {
    configurable: true,
    enumerable: true,
    writable: false,
    value: fclProvider,
  });
})();
