(() => {
  'use strict';
  const freeze = value => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const defaults = freeze({schemaVersion:1,pricing:{base:150000,generatorDiscount:20000,barrelDiscount:5000,extraHour:15000,extraKeg:9000},gallery:{items:[]}});
  const validFile = file => typeof file === 'string' && file.length <= 255 &&
    !file.startsWith('.') && !/[\\/\x00-\x1f\x7f]/.test(file) && !file.includes('..') && /\.(jpe?g|png|webp)$/i.test(file);
  function validate(raw) {
    if (!raw || raw.schemaVersion !== 1 || !raw.pricing || !raw.gallery || !Array.isArray(raw.gallery.items)) throw new Error('Invalid content schema');
    const pricing = {};
    for (const key of Object.keys(defaults.pricing)) {
      const value = raw.pricing[key];
      if (!Number.isInteger(value) || value < (key === 'extraKeg' ? 1 : 0) || value > 100000000) throw new Error('Invalid price: ' + key);
      pricing[key] = value;
    }
    if (pricing.base < pricing.generatorDiscount + 7 * pricing.barrelDiscount) throw new Error('Discounts exceed base price');
    if (raw.gallery.items.length > 100) throw new Error('Too many gallery items');
    const seen = new Set();
    const items = raw.gallery.items.map(item => {
      if (!item || !validFile(item.file) || seen.has(item.file)) throw new Error('Invalid gallery file');
      if (typeof item.caption !== 'string' || [...item.caption].length > 120 || typeof item.alt !== 'string' || [...item.alt].length > 240) throw new Error('Invalid gallery text');
      seen.add(item.file);
      return {file:item.file,caption:item.caption,alt:item.alt};
    });
    return freeze({schemaVersion:1,pricing,gallery:{items}});
  }
  let current = defaults;
  let pending = null;
  function reload() {
    if (pending) return pending;
    pending = (async () => {
      try {
        const url = new URL('data/site-content.json', document.baseURI);
        url.searchParams.set('v', String(Date.now()));
        const response = await fetch(url, {cache:'no-store',credentials:'same-origin'});
        if (!response.ok) throw new Error('Content unavailable');
        const next = validate(await response.json());
        current = next;
        document.dispatchEvent(new CustomEvent('to-dublin:content-ready', {detail:{content:current}}));
      } catch (_) {
        // Keep valid defaults/current values. Never render an incomplete config.
        document.dispatchEvent(new CustomEvent('to-dublin:content-ready', {detail:{content:current}}));
      } finally { pending = null; }
      return current;
    })();
    return pending;
  }
  window.ToDublinContent = Object.freeze({get current(){return current;},defaults,validate,reload});
  reload();
})();
