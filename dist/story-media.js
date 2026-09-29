// Decoding is part of loading: don't animate a panel before its bitmap is ready.
export function createImageCache({createImage = () => new Image(), timeoutMs = 15000} = {}) {
  const entries = new Map();
  function load(url, priority = 'high') {
    if (entries.has(url)) {
      const entry = entries.get(url);
      if (priority === 'high') entry.image.fetchPriority = 'high';
      return entry.promise;
    }
    const image = createImage();
    const entry = {image, ready:false, promise:null};
    entry.promise = new Promise((resolve,reject) => {
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        image.onload = image.onerror = null;
        if (error) { if (entries.get(url) === entry) entries.delete(url); reject(error); }
        else { entry.ready = true; resolve(image); }
      };
      const timer = setTimeout(() => finish(new Error('image-timeout')), timeoutMs);
      image.decoding = 'async'; image.fetchPriority = priority;
      image.onload = async () => {
        try { if (image.decode) await image.decode(); } catch { /* Some browsers reject decode on an already loaded image. */ }
        finish(image.naturalWidth > 0 ? null : new Error('image-empty'));
      };
      image.onerror = () => finish(new Error('image-unavailable'));
      image.src = url;
    });
    entries.set(url,entry);
    return entry.promise;
  }
  return {
    load,
    ready:url => entries.get(url)?.ready === true,
    prefetch:urls => Promise.allSettled([...new Set(urls)].map(url=>load(url,'low'))),
  };
}

// The latest navigation wins, even when an earlier image finishes later.
export function createSceneGate(cache, {pending = () => {}, ready = () => {}, error = () => {}} = {}) {
  let revision = 0, busy = false;
  function show(urls, commit) {
    const request = ++revision;
    const apply = () => {
      if (request !== revision) return false;
      busy = false; ready(); commit(); return true;
    };
    if (urls.every(cache.ready)) return Promise.resolve(apply());
    busy = true; pending();
    return Promise.all([...new Set(urls)].map(url=>cache.load(url))).then(apply, () => {
      if (request !== revision) return false;
      busy = false;
      error(() => { if (request === revision) show(urls,commit); });
      return false;
    });
  }
  return {show, get busy(){return busy;}, cancel(){revision++;busy=false;ready();}};
}

// Desktop scenes, lighter mobile scenes and small archive thumbnails.
export function artSource(name, kind = 'scene') {
  const small = kind === 'thumb' || globalThis.matchMedia?.('(max-width: 760px)').matches;
  return `art/${name}-${kind === 'thumb' ? 360 : small ? 640 : 1280}.webp`;
}
