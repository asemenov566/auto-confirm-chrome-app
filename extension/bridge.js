(() => {
  const publish = (state) => {
    const enabled = state?.enabled === true && state.domains.some(({host}) => host === location.hostname);
    window.dispatchEvent(new CustomEvent('auto-confirm-app:state:v1', {detail: enabled}));
  };
  const key = '__autoConfirmBridgeV1';
  if (!globalThis[key]) {
    globalThis[key] = {revision: 0};
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.state) {
        globalThis[key].revision++;
        publish(changes.state.newValue);
      }
    });
  }
  const started = ++globalThis[key].revision;
  chrome.storage.local.get('state').then(({state}) => {
    if (started === globalThis[key].revision) publish(state);
  }).catch(() => {
    if (started === globalThis[key].revision) publish(null);
  });
})();
