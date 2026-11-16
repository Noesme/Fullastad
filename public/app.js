'use strict';

/* ---------- Konfiguration ---------- */

const CATEGORIES = [
  { key: 'ol',    label: 'Öl & Cider', icon: 'i-beer',   sources: ['ol', 'cider'] },
  { key: 'vin',   label: 'Vin',        icon: 'i-wine',   sources: ['vin', 'mousserande'] },
  { key: 'sprit', label: 'Sprit',      icon: 'i-spirit', sources: ['sprit'] },
  { key: 'lask',  label: 'Läsk',       icon: 'i-soda',   sources: ['lask'] },
];
const MAX_PAGES_PER_SOURCE = 20;
const VISIBLE_SIZES = 8;
const STORE_KEY = 'fullastad.v3';
const SIZE_CACHE_KEY = 'fullastad.sizes.v2';
const SIZE_CACHE_TTL = 24 * 3600 * 1000;

/* ---------- Hjälpfunktioner ---------- */

const $ = (sel, el = document) => el.querySelector(sel);
const nf1 = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 });
const fmtKg = (n) => `${nf1.format(Math.round(n * 10) / 10)} kg`;
const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const uid = () => Math.random().toString(36).slice(2, 9);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privat läge */ } },
};

/* ---------- Förpackningsstorlek & vikt ---------- */

// Tolkar t.ex. "Tuborg Grön 4,6 % 24 x 33 cl burk" eller "Masi ..., röd, 0,75L"
function parseSize(text, cat) {
  const t = ` ${text.toLowerCase().replace(/(\d),(\d)/g, '$1.$2')} `;
  const toL = (v, u) => (u === 'ml' ? v / 1000 : u === 'cl' ? v / 100 : v);
  let count = 1, vol;
  const multi = t.match(/(\d{1,2})\s*[x×]\s*(\d+(?:\.\d+)?)\s*(ml|cl|l|liter)(?![a-zåäö])/);
  if (multi) {
    count = +multi[1];
    vol = toL(+multi[2], multi[3]);
  } else {
    const all = [...t.matchAll(/(\d+(?:\.\d+)?)\s*(ml|cl|l|liter|litre)(?![a-zåäö])/g)];
    if (!all.length) return null;
    const m = all[all.length - 1];
    vol = toL(+m[1], m[2].startsWith('l') ? 'l' : m[2]);
  }
  if (!(vol >= 0.02 && vol <= 10) || !(count >= 1 && count <= 48)) return null;
  vol = Math.round(vol * 1000) / 1000;

  let container;
  if (/burk|\bcan\b|dåse|dose/.test(t)) container = 'burk';
  else if (/bag.?in.?box|\bbib\b/.test(t)) container = 'bib';
  else if (/\bpet\b|plastflaska|plast/.test(t)) container = 'pet';
  else if (/flaska|flaske|bottle|\bglas/.test(t)) container = 'flaska';
  else if (cat === 'lask') container = vol >= 0.5 ? 'pet' : 'burk';
  else if (cat === 'ol') container = count >= 4 && vol <= 0.5 ? 'burk' : 'flaska';
  else container = vol >= 2 ? 'bib' : 'flaska';

  return { count, vol, container };
}

function fmtVol(vol) {
  return vol < 1 ? `${nf1.format(Math.round(vol * 1000) / 10)} cl` : `${nf1.format(vol)} l`;
}

function sizeLabel({ count, vol, container }, cat) {
  const word = { burk: 'burk', flaska: 'flaska', pet: 'PET', bib: 'bag-in-box' }[container];
  if (count > 1) return `${count} × ${fmtVol(vol)} ${word}`;
  if (container === 'bib') return `${fmtVol(vol)} bag-in-box`;
  if (cat === 'ol' || cat === 'lask') return `${fmtVol(vol)} ${word}`;
  return fmtVol(vol);
}

// Ungefärlig vikt (kg) för en förpackning inkl. dryck, emballage och ytterkartong/tråg
function estimateKg({ count, vol, container }, cat) {
  const density = cat === 'sprit' ? 0.95 : 1.0;
  const pack = {
    burk: 0.012 + 0.008 * vol,
    flaska: vol < 0.1 ? 0.03 : 0.12 + 0.45 * vol,
    pet: 0.015 + 0.02 * vol,
    bib: 0.12 + 0.04 * vol,
  }[container];
  const outer = count > 1 ? 0.05 + 0.006 * count : 0;
  return count * (vol * density + pack) + outer;
}

/* ---------- State ---------- */

const defaults = () => ({
  carBrand: '',
  carModel: '',
  carId: '',
  car: { make: '', maxLoad: '' },
  people: [{ id: uid(), role: 'driver', kg: '' }],
  category: 'ol',
  items: [],
  other: '',
});
const state = Object.assign(defaults(), store.get(STORE_KEY) || {});
const save = () => store.set(STORE_KEY, state);

/* ---------- Din bil ---------- */

const brandSel = $('#car-brand'), modelSel = $('#car-model'), genSel = $('#car-gen');
const carMake = $('#car-make'), carLoad = $('#car-load'), carHint = $('#car-hint');
const defaultHint = carHint.textContent;
let carList = [];
const carId = (c) => `${c.make}|${c.model}|${c.gen}|${c.years}`;
const option = (value, text) => Object.assign(document.createElement('option'), { value, textContent: text });
const svSort = (a, b) => a.localeCompare(b, 'sv', { numeric: true });

function renderModels() {
  const models = [...new Set(carList.filter((c) => c.make === state.carBrand).map((c) => c.model))].sort(svSort);
  modelSel.replaceChildren(option('', 'Välj modell'), ...models.map((m) => option(m, m)));
  modelSel.disabled = !state.carBrand;
  modelSel.value = models.includes(state.carModel) ? state.carModel : '';
  renderGens();
}

function renderGens() {
  const gens = carList.filter((c) => c.make === state.carBrand && c.model === state.carModel)
    .sort((a, b) => parseInt(b.years, 10) - parseInt(a.years, 10) || svSort(a.gen, b.gen));
  genSel.replaceChildren(option('', 'Välj generation'), ...gens.map((c) => option(carId(c), `${c.gen ? `${c.gen} ` : ''}(${c.years})`)));
  genSel.disabled = !state.carModel;
  genSel.value = gens.some((c) => carId(c) === state.carId) ? state.carId : '';
  const car = gens.find((c) => carId(c) === genSel.value);
  const check = 'Kontrollera totalvikt − tjänstevikt i registreringsbeviset och ändra vid behov.';
  carHint.textContent = !car ? defaultHint
    : car.est ? `Uppskattad max lastvikt: auto-data.net saknar totalvikt för den här bilen, så värdet bygger på tjänstevikten och vad lika tunga bilar får lasta. ${check}`
    : car.min !== car.max ? `Max lastvikt varierar ${car.min}–${car.max} kg beroende på motor och utrustning (källa: auto-data.net). ${check}`
    : `Max lastvikt enligt auto-data.net. ${check}`;
}

function renderCar() {
  brandSel.value = state.carBrand || '';
  if (!brandSel.value) state.car = { make: '', maxLoad: '' };
  renderModels();
  carMake.value = state.car.make;
  carLoad.value = state.car.maxLoad;
}

async function loadCars() {
  try {
    carList = (await (await fetch('cars.json')).json()).cars;
  } catch {
    carList = [];
  }
  const brands = [...new Set(carList.map((c) => c.make))].sort(svSort);
  brandSel.replaceChildren(option('', 'Välj märke'), ...brands.map((b) => option(b, b)));
  renderCar();
}

brandSel.addEventListener('change', () => {
  state.carBrand = brandSel.value;
  state.carModel = '';
  state.carId = '';
  if (!state.carBrand) state.car = { make: '', maxLoad: '' };
  save(); renderCar(); update();
  if (state.carBrand) modelSel.focus();
});

modelSel.addEventListener('change', () => {
  state.carModel = modelSel.value;
  state.carId = '';
  save(); renderGens();
  // Bara en generation → välj den direkt
  if (genSel.options.length === 2) { genSel.selectedIndex = 1; genSel.dispatchEvent(new Event('change')); }
  else if (state.carModel) genSel.focus();
});

genSel.addEventListener('change', () => {
  state.carId = genSel.value;
  const car = carList.find((c) => carId(c) === state.carId);
  if (car) {
    state.car = {
      make: `${car.make} ${car.model}${car.gen ? ` ${car.gen}` : ''}`.toUpperCase(),
      maxLoad: String(car.maxLoad),
    };
  }
  save(); renderCar(); update();
});

for (const [el, key] of [[carMake, 'make'], [carLoad, 'maxLoad']]) {
  el.addEventListener('input', () => { state.car[key] = el.value; save(); update(); });
}

/* ---------- Förare och passagerare ---------- */

const peopleEl = $('#people'), addPersonBtn = $('#add-person');

function renderPeople() {
  peopleEl.replaceChildren(...state.people.map((p) => {
    const li = $('#tpl-person').content.firstElementChild.cloneNode(true);
    const input = $('input', li);
    const id = `p-${p.id}`;
    li.dataset.id = p.id;
    input.id = id;
    input.value = p.kg;
    $('.row-label', li).textContent = p.role === 'driver' ? 'Förare' : 'Passagerare';
    $('.row-label', li).htmlFor = id;
    if (p.role === 'driver') $('.del', li).hidden = true;
    $('.del', li).setAttribute('aria-label', 'Ta bort passagerare');
    return li;
  }));
}

peopleEl.addEventListener('input', (e) => {
  const p = state.people.find((x) => x.id === e.target.closest('li').dataset.id);
  p.kg = e.target.value; save(); update();
});
peopleEl.addEventListener('click', (e) => {
  if (!e.target.closest('.del')) return;
  const id = e.target.closest('li').dataset.id;
  state.people = state.people.filter((x) => x.id !== id);
  save(); renderPeople(); update();
});
addPersonBtn.addEventListener('click', () => {
  state.people.push({ id: uid(), role: 'passenger', kg: '' });
  save(); renderPeople(); update();
  $('li:last-child input', peopleEl).select();
});

/* ---------- Inköpslista ---------- */

const catEl = $('#categories'), sizesEl = $('#sizes'), sizesStatus = $('#sizes-status');
const itemsEl = $('#items');
const sizeData = {};      // category -> { groups: Map, analysed, total, loading, error, done }
let showAllSizes = false;

function renderCategories() {
  catEl.replaceChildren(...CATEGORIES.map((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(c.key === state.category));
    b.dataset.cat = c.key;
    b.innerHTML = `<svg><use href="#${c.icon}"/></svg>${c.label}`;
    return b;
  }));
}

catEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  state.category = b.dataset.cat; showAllSizes = false; save();
  renderCategories(); renderSizes(); loadSizes(state.category);
});

function addGroupProduct(cat, product) {
  const d = sizeData[cat];
  d.analysed++;
  const size = [product.name, product.altName, product.slug].map((t) => t && parseSize(t, cat)).find(Boolean);
  if (!size) return;
  // Bordershop listar cider under vin – den hör hemma under Öl & Cider
  if (cat === 'vin' && (/cider/i.test(`${product.name} ${product.altName}`) || (size.count > 1 && size.vol <= 0.5))) return;
  const key = `${size.count}x${size.vol}${size.container}`;
  let g = d.groups.get(key);
  if (!g) {
    g = { key, cat, size, label: sizeLabel(size, cat), kg: estimateKg(size, cat), products: [] };
    d.groups.set(key, g);
  }
  if (!g.products.some((p) => p.id === product.id)) g.products.push({ id: product.id, name: product.name, url: product.url });
}

async function fetchPage(source, page) {
  const res = await fetch(`/api/bordershop?source=${source}&page=${page}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function loadSizes(cat) {
  if (sizeData[cat]) return;
  const d = sizeData[cat] = { groups: new Map(), analysed: 0, total: 0, loading: true, error: null, done: false };

  const cached = store.get(SIZE_CACHE_KEY)?.[cat];
  if (cached && Date.now() - cached.time < SIZE_CACHE_TTL) {
    cached.products.forEach((p) => addGroupProduct(cat, p));
    Object.assign(d, { total: cached.total, analysed: cached.products.length, loading: false, done: true });
    if (cat === state.category) renderSizes();
    return;
  }

  const all = [];
  try {
    const sources = CATEGORIES.find((c) => c.key === cat).sources;
    const first = await Promise.all(sources.map((s) => fetchPage(s, 0)));
    const perPage = Math.max(1, ...first.map((f) => f.count));
    d.total = first.reduce((s, f) => s + f.total, 0);
    for (const f of first) { f.products.forEach((p) => { all.push(p); addGroupProduct(cat, p); }); }
    if (cat === state.category) renderSizes();

    for (let i = 0; i < sources.length; i++) {
      const pages = Math.min(MAX_PAGES_PER_SOURCE, Math.ceil(first[i].total / perPage));
      for (let page = 1; page < pages; page++) {
        const r = await fetchPage(sources[i], page);
        if (!r.products.length) break;
        r.products.forEach((p) => { all.push(p); addGroupProduct(cat, p); });
        if (cat === state.category) renderSizes();
      }
    }
    d.done = true;
    const cache = store.get(SIZE_CACHE_KEY) || {};
    cache[cat] = { time: Date.now(), total: d.total, products: all.map(({ id, name, altName, slug, url }) => ({ id, name, altName, slug, url })) };
    store.set(SIZE_CACHE_KEY, cache);
  } catch (err) {
    d.error = err.message;
  } finally {
    d.loading = false;
    if (cat === state.category) renderSizes();
  }
}

function sortedGroups(cat) {
  const d = sizeData[cat];
  return d ? [...d.groups.values()].sort((a, b) => b.products.length - a.products.length || a.kg - b.kg) : [];
}

function renderSizes() {
  const cat = state.category;
  const d = sizeData[cat];
  const groups = sortedGroups(cat);

  if (!groups.length) {
    const n = d?.error ? 0 : 4;
    sizesEl.replaceChildren(...Array.from({ length: n }, () => {
      const s = document.createElement('span'); s.className = 'size-chip skeleton'; return s;
    }));
  } else {
    const shown = showAllSizes ? groups : groups.slice(0, VISIBLE_SIZES);
    const nodes = shown.map((g) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'size-chip';
      b.dataset.key = g.key;
      const examples = g.products.slice(0, 3).map((p) => p.name).join('\n');
      const n = g.products.length;
      b.title = `≈ ${fmtKg(g.kg)} per förpackning · ${n} ${n === 1 ? 'produkt' : 'produkter'} hos Bordershop\n${examples}`;
      b.setAttribute('aria-label', `Lägg till ${g.label}, cirka ${fmtKg(g.kg)}`);
      b.innerHTML = `<span></span><span class="plus"><svg><use href="#i-plus"/></svg></span>`;
      b.firstChild.textContent = g.label;
      return b;
    });
    if (groups.length > VISIBLE_SIZES) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'size-chip more';
      more.dataset.more = '1';
      more.textContent = showAllSizes ? 'Visa färre' : `Visa alla (${groups.length})`;
      nodes.push(more);
    }
    sizesEl.replaceChildren(...nodes);
  }

  const label = CATEGORIES.find((c) => c.key === cat).label;
  if (!d || (d.loading && !d.analysed)) sizesStatus.textContent = `Hämtar storlekar för ${label} från bordershop.com…`;
  else if (d.error && !groups.length) sizesStatus.innerHTML = `Kunde inte hämta från bordershop.com (${d.error}). <a href="#" data-retry>Försök igen</a>`;
  else sizesStatus.textContent = `${d.loading ? 'Hämtar… ' : ''}${Math.min(d.analysed, d.total)} av ${d.total} produkter från bordershop.com analyserade · vikter är uppskattade`;
}

sizesStatus.addEventListener('click', (e) => {
  if (!e.target.closest('[data-retry]')) return;
  e.preventDefault();
  delete sizeData[state.category];
  renderSizes(); loadSizes(state.category);
});

sizesEl.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.more) { showAllSizes = !showAllSizes; renderSizes(); return; }
  const g = sizeData[state.category].groups.get(b.dataset.key);
  const existing = state.items.find((i) => i.key === g.key && i.cat === g.cat);
  if (existing) existing.qty++;
  else state.items.push({ id: uid(), key: g.key, cat: g.cat, label: g.label, unitKg: Math.round(g.kg * 1000) / 1000, qty: 1 });
  save(); renderItems(); update();
});

function renderItems() {
  $('#items-empty').hidden = state.items.length > 0;
  itemsEl.replaceChildren(...state.items.map((it) => {
    const li = $('#tpl-item').content.firstElementChild.cloneNode(true);
    const c = CATEGORIES.find((x) => x.key === it.cat);
    li.dataset.id = it.id;
    $('.avatar use', li).setAttribute('href', `#${c.icon}`);
    $('.item-text b', li).textContent = it.label;
    $('.item-text small', li).textContent = c.label;
    $('.qty', li).value = it.qty;
    $('.qty', li).setAttribute('aria-label', `Antal ${it.label}`);
    $('.item-kg', li).textContent = fmtKg(it.qty * it.unitKg);
    li.title = `≈ ${fmtKg(it.unitKg)} per förpackning`;
    return li;
  }));
}

itemsEl.addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (!li) return;
  const it = state.items.find((x) => x.id === li.dataset.id);
  if (e.target.closest('.inc')) it.qty++;
  else if (e.target.closest('.dec')) it.qty = Math.max(1, it.qty - 1);
  else if (e.target.closest('.del')) state.items = state.items.filter((x) => x !== it);
  else return;
  save(); renderItems(); update();
});
itemsEl.addEventListener('input', (e) => {
  if (!e.target.classList.contains('qty')) return;
  const li = e.target.closest('li');
  const it = state.items.find((x) => x.id === li.dataset.id);
  it.qty = Math.min(999, Math.floor(num(e.target.value)));
  $('.item-kg', li).textContent = fmtKg(it.qty * it.unitKg);
  save(); update();
});
itemsEl.addEventListener('change', (e) => {
  if (e.target.classList.contains('qty')) renderItems();
});

/* ---------- Övrig last ---------- */

const otherInput = $('#other');
otherInput.addEventListener('input', () => { state.other = otherInput.value; save(); update(); });

/* ---------- Resultat ---------- */

function update() {
  const peopleKg = state.people.reduce((s, p) => s + num(p.kg), 0);
  const shopKg = state.items.reduce((s, i) => s + i.qty * i.unitKg, 0);
  const otherKg = num(state.other);
  const cap = num(state.car.maxLoad);
  const hasCap = cap > 0;
  const used = peopleKg + shopKg + otherKg;
  const remain = cap - used;

  // Tomt (inget ifyllt) visas som streck i stället för 0 kg
  const kgOrDash = (n) => (n > 0 ? fmtKg(n) : '– kg');
  const minusOrDash = (n) => (n > 0 ? `-${fmtKg(n)}` : '– kg');
  $('#people-total').textContent = kgOrDash(peopleKg);
  $('#shop-total').textContent = kgOrDash(shopKg);
  $('#other-total').textContent = kgOrDash(otherKg);


  const big = $('#remain');
  big.classList.toggle('over', hasCap && remain < 0);
  big.classList.toggle('unknown', !hasCap);
  $('#remain-label').textContent = hasCap && remain < 0 ? 'Överlastad med' : 'Kvar att lasta';
  big.innerHTML = hasCap
    ? `${nf1.format(Math.round(Math.abs(remain) * 10) / 10)} <small>kg</small>`
    : `– <small>kg</small>`;

  const scale = hasCap ? Math.max(cap, used) : 1;
  const segs = $('#bar').children;
  [peopleKg, shopKg, otherKg].forEach((v, i) => { segs[i].style.width = hasCap ? `${(v / scale) * 100}%` : '0'; });
  $('#bar').classList.toggle('over', hasCap && remain < 0);

  $('#usage').textContent = hasCap
    ? `~ ${Math.round((used / cap) * 100)} % av lastförmågan används`
    : '';

  $('#sum-cap').textContent = hasCap ? fmtKg(cap) : '– kg';
  $('#sum-people').textContent = minusOrDash(peopleKg);
  $('#sum-shop').textContent = minusOrDash(shopKg);
  $('#sum-other').textContent = minusOrDash(otherKg);
  $('#sum-remain').textContent = hasCap ? fmtKg(remain) : '– kg';
  $('#sum-remain').style.color = hasCap && remain < 0 ? 'var(--bad)' : '';
}

/* ---------- Start ---------- */

loadCars();
renderPeople();
renderCategories();
renderItems();
otherInput.value = state.other;
renderSizes();
update();

(async () => {
  await loadSizes(state.category);
  for (const c of CATEGORIES) await loadSizes(c.key); // förladda övriga kategorier i bakgrunden
})();
