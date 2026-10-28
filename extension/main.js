(() => {
  const key = Symbol.for('auto-confirm-app.controller.v1');
  if (window[key]) return;
  let enabled = false;
  const original = window.confirm;
  const wrapper = function confirm(message) {
    return enabled ? true : Reflect.apply(original, this, arguments);
  };
  const set = (next) => {
    enabled = next === true;
    if (enabled && window.confirm !== wrapper) {
      window.confirm = wrapper;
    } else if (!enabled && window.confirm === wrapper) {
      window.confirm = original;
    }
  };
  window[key] = {set};
  window.addEventListener('auto-confirm-app:state:v1', event => set(event.detail === true));
})();
