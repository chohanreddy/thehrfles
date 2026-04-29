/* === STATE === */
let currentFilter = 'recent';
let currentCompany = null;
let currentQuery = null;
let votedReviews = new Set(JSON.parse(localStorage.getItem('voted') || '[]'));
let companies = [];
let currentStep = 1;

const COLORS = ['#C0392B','#D35400','#1B6E42','#1A5276','#7D3C98','#117A65','#B7950B'];
const companyColor = name => COLORS[name.charCodeAt(0) % COLORS.length];


/* === INIT === */
document.addEventListener('DOMContentLoaded', () => {
  initNavScroll();
  loadStats();
  loadFeaturedFloats();
  loadGhostReport();
  loadReviews();
  loadInsights();
  loadCompanySpotlight();
  loadLeaderboards();
  loadRedFlags();
  loadCompanies();
  setupSearch();
  setupReveal();
  setupCharCount();
  setupCategoryButtons();
  document.addEventListener('keydown', e => { if (e.key === 'Escape') forceCloseModal(); });
});

/* === API === */
const get  = url => fetch(url).then(r => r.json());
const post = (url, body) => fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) }).then(r => r.json());

/* === NAV SCROLL === */
function initNavScroll() {
  const nav = document.getElementById('nav');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });
}

/* === STATS === */
async function loadStats() {
  const stats = await get('/api/stats');
  countUp('stat-companies',  stats.companies);
  countUp('stat-reviews',    stats.reviewsFiled);
  countUp('stat-flags',      stats.totalFlags);
  countUp('stat-industries', stats.industries);

  const avgEl = document.getElementById('stat-avg');
  if (avgEl) avgEl.textContent = stats.avgRating.toFixed(1);

  const heroCount = document.getElementById('hero-company-count');
  if (heroCount) heroCount.textContent = `${stats.companies}+`;

  const gsLongest = document.getElementById('gs-longest');
  if (gsLongest) gsLongest.textContent = stats.longestGhostWeeks ? `${stats.longestGhostWeeks} wks` : 'N/A';
}

function countUp(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const t0 = performance.now();
  const dur = 1200;
  const step = now => {
    const p = Math.min((now - t0) / dur, 1);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * e).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* === HERO CARDS + FLOAT BADGES === */
async function loadFeaturedFloats() {
  const [stats, reviews] = await Promise.all([
    get('/api/stats'),
    get('/api/reviews?filter=recent'),
  ]);

  // Float badges
  const r = document.getElementById('hvf-reviews');
  const f = document.getElementById('hvf-flags');
  if (r) r.textContent = stats.reviewsFiled.toLocaleString();
  if (f) f.textContent = (stats.totalFlags || 0).toLocaleString();

  // Back card: worst rated
  const worst = [...reviews].sort((a, b) => a.rating - b.rating)[0];
  const back  = document.getElementById('hero-card-back');
  if (back && worst) {
    const rc = worst.rating < 2.5 ? 'bad' : worst.rating < 3.8 ? 'mid' : 'good';
    back.innerHTML = `
      <div class="hvc-cat">${esc(worst.category)}</div>
      <div class="hvc-co">${esc(worst.company)}</div>
      <div class="hvc-headline">"${esc(worst.headline)}"</div>
      <div class="hvc-foot">
        <span>${esc(worst.role || 'Anonymous')}</span>
        <span class="hvc-badge ${rc}">${worst.rating.toFixed(1)}</span>
      </div>`;
  }

  // Front card: most upvoted
  const top   = [...reviews].sort((a, b) => b.upvotes - a.upvotes)[0];
  const front = document.getElementById('hero-card-front');
  if (front && top) {
    const col = companyColor(top.company);
    const rc  = top.rating < 2.5 ? 'bad' : top.rating < 3.8 ? 'mid' : 'good';
    front.innerHTML = `
      <div class="hvc-top">
        <div class="hvc-avatar" style="background:${col}">${top.company[0]}</div>
        <div>
          <div class="hvc-cat">${esc(top.category)}</div>
          <div class="hvc-co">${esc(top.company)}</div>
        </div>
        <span class="hvc-badge ${rc}">${top.rating.toFixed(1)}</span>
      </div>
      <div class="hvc-headline">"${esc(top.headline)}"</div>
      <div class="hvc-body">${esc(top.body.slice(0, 120))}${top.body.length > 120 ? '…' : ''}</div>
      <div class="hvc-foot">
        <span class="hvc-verified">${top.verified ? '✓ Verified · ' : ''}${esc(top.role || 'Anonymous')}</span>
        <span class="hvc-up">↑ ${top.upvotes}</span>
      </div>`;
  }
}

/* === REVIEWS === */
async function loadReviews() {
  const list = document.getElementById('reviews-list');
  list.innerHTML = '<div class="loading-state">Loading…</div>';

  const params = new URLSearchParams({ filter: currentFilter });
  if (currentCompany) params.set('company', currentCompany);
  if (currentQuery)   params.set('q', currentQuery);

  const reviews = await get(`/api/reviews?${params}`);

  if (!reviews.length) {
    list.innerHTML = '<div class="no-results">No reviews match this filter.</div>';
    return;
  }
  list.innerHTML = reviews.map((r, i) => renderReview(r, i)).join('');
}

function renderReview(r, i = 0) {
  const border = r.rating < 2.5 ? 'low' : r.rating < 3.8 ? 'mid' : 'high';
  const rc     = ratingClass(r.rating);
  const voted  = votedReviews.has(r.id);
  return `
    <div class="review-card ${border}" style="animation-delay:${Math.min(i,5)*70}ms">
      <div class="review-meta-top">
        <span class="review-category">${esc(r.category)}</span>
        <div style="display:flex;align-items:center;gap:0.5rem">
          ${isGhosted(r) ? '<span class="ghosted-badge">GHOSTED</span>' : ''}
          <span class="review-date">${timeAgo(r.date)}</span>
        </div>
      </div>
      <span class="review-company" onclick="filterByCompany('${esc(r.company)}')">${esc(r.company)}</span>
      <div class="review-headline">${esc(r.headline)}</div>
      <div class="review-body">${esc(r.body)}</div>
      <div class="review-footer">
        <div>
          <span class="review-role">${esc(r.type)} · ${esc(r.role)}</span>
          ${r.verified ? '<span class="verified-badge">✓ Verified</span>' : ''}
        </div>
        <div class="review-actions">
          ${r.flags > 0 ? `<span class="flag-count">⚑ ${r.flags}</span>` : ''}
          <button class="upvote-btn ${voted ? 'voted' : ''}" onclick="upvote(${r.id}, this)">
            ↑ <span class="up-count">${r.upvotes}</span>
          </button>
          <span class="rating-badge ${rc}">${r.rating.toFixed(1)}</span>
        </div>
      </div>
    </div>`;
}

async function upvote(id, btn) {
  if (votedReviews.has(id)) return;
  const data = await post(`/api/reviews/${id}/upvote`, {});
  btn.classList.add('voted');
  btn.querySelector('.up-count').textContent = data.upvotes;
  votedReviews.add(id);
  localStorage.setItem('voted', JSON.stringify([...votedReviews]));
}

/* === FILTER === */
function setFilter(btn, filter) {
  currentFilter = filter;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  loadReviews();
}

function filterByCompany(name) {
  currentCompany = name;
  currentQuery = null;
  document.getElementById('search-input').value = name;
  showBanner(`Showing reviews for: ${name}`);
  loadReviews();
  document.getElementById('reviews').scrollIntoView({ behavior: 'smooth' });
}

function clearFilter() {
  currentCompany = null;
  currentQuery = null;
  document.getElementById('search-input').value = '';
  document.getElementById('active-filter-banner').classList.add('hidden');
  loadReviews();
}

function showBanner(text) {
  document.getElementById('active-filter-text').textContent = text;
  document.getElementById('active-filter-banner').classList.remove('hidden');
}

/* === SEARCH === */
function setupSearch() {
  const input = document.getElementById('search-input');
  const sug   = document.getElementById('search-suggestions');

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { sug.classList.add('hidden'); return; }
    const hits = companies.filter(c =>
      c.name.toLowerCase().includes(q) || c.industry.toLowerCase().includes(q)
    ).slice(0, 7);
    if (!hits.length) { sug.classList.add('hidden'); return; }
    sug.innerHTML = hits.map(c => `
      <div class="suggestion-item" onclick="filterByCompany('${esc(c.name)}')">
        <span>${esc(c.name)}</span>
        <span class="suggestion-industry">${esc(c.industry)}</span>
      </div>`).join('');
    sug.classList.remove('hidden');
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
    if (e.key === 'Escape') sug.classList.add('hidden');
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.hero-search')) sug.classList.add('hidden');
  });
}

function doSearch() {
  const q = document.getElementById('search-input').value.trim();
  document.getElementById('search-suggestions').classList.add('hidden');
  if (!q) { clearFilter(); return; }
  const exact = companies.find(c => c.name.toLowerCase() === q.toLowerCase());
  if (exact) { filterByCompany(exact.name); return; }
  currentQuery = q;
  currentCompany = null;
  showBanner(`Results for: "${q}"`);
  loadReviews();
  document.getElementById('reviews').scrollIntoView({ behavior: 'smooth' });
}

/* === GHOST REPORT === */
const GHOST_KEYWORDS = ['ghost', 'radio silence', 'no response', 'no reply', 'never heard', 'silence', 'disappeared', 'no follow', 'no email', 'no call', 'no feedback'];
const isGhosted = r => {
  const text = `${r.headline} ${r.body}`.toLowerCase();
  return GHOST_KEYWORDS.some(k => text.includes(k)) || (r.category === 'Responsiveness' && r.rating < 2.5);
};

async function loadGhostReport() {
  const data = await get('/api/ghost-report');

  const total = document.getElementById('gs-total');
  if (total) total.textContent = data.totalGhosted;

  const offenderEl = document.getElementById('ghost-offender');
  if (offenderEl && data.topOffender) {
    const o = data.topOffender;
    const latestHeadline = o.latestReview ? o.latestReview.headline : '';
    offenderEl.innerHTML = `
      <div class="go-header">
        <span class="go-header-label">TOP OFFENDER THIS MONTH</span>
        <span class="go-header-badge">#1</span>
      </div>
      <div class="go-body">
        <div class="go-company">${esc(o.company)}</div>
        <div class="go-industry">${esc(o.industry)}</div>
        <div class="go-count-row">
          <div class="go-count">${o.count}</div>
          <div class="go-count-desc">candidates ghosted<br>after final round</div>
        </div>
        ${latestHeadline ? `<div class="go-headline">"${esc(latestHeadline)}"</div>` : ''}
        <button class="go-view-btn" onclick="filterByCompany('${esc(o.company)}')">View all reviews →</button>
      </div>`;
  }

  const storiesEl = document.getElementById('ghost-stories');
  if (storiesEl && data.recentReviews && data.recentReviews.length) {
    storiesEl.innerHTML = data.recentReviews.map(r => `
      <div class="ghost-story-card">
        <div class="gsc-left">
          <div class="gsc-company">${esc(r.company)}</div>
          <div class="gsc-headline">"${esc(r.headline)}"</div>
          <div class="gsc-meta">${esc(r.role)} · ${timeAgo(r.date)}</div>
        </div>
        <span class="gsc-badge">GHOSTED</span>
      </div>`).join('');
  } else if (storiesEl) {
    storiesEl.innerHTML = '<div class="loading-state">No recent reports.</div>';
  }
}

/* === INSIGHTS === */
async function loadInsights() {
  const data = await get('/api/insights');
  const el = document.getElementById('category-breakdown');
  if (!el) return;
  const max = Math.max(...data.categoryBreakdown.map(c => c.count));
  el.innerHTML = data.categoryBreakdown.map(c => `
    <div class="cat-bar-row">
      <div class="cat-bar-label">
        <span>${esc(c.name)}</span>
        <span>${c.count} reviews</span>
      </div>
      <div class="cat-bar-track">
        <div class="cat-bar-fill" style="width:${(c.count/max*100).toFixed(1)}%"></div>
      </div>
    </div>`).join('');
}

/* === COMPANY SPOTLIGHT === */
async function loadCompanySpotlight() {
  const profiles = await get('/api/company-profiles');
  const el = document.getElementById('spotlight-scroll');

  el.innerHTML = profiles.map(p => {
    const col = companyColor(p.company);
    const cr  = p.avgRating < 2.5 ? 'var(--red)' : p.avgRating < 3.8 ? 'var(--amber)' : 'var(--green)';
    const rc  = ratingClass(p.avgRating);
    const q   = p.topReview ? p.topReview.headline : 'No reviews yet.';
    return `
      <div class="company-card" onclick="filterByCompany('${esc(p.company)}')">
        <div class="cc-top">
          <div class="cc-avatar" style="background:${col}">${p.company[0]}</div>
          <div class="cc-rating" style="color:${cr}">${p.avgRating.toFixed(1)}</div>
        </div>
        <div class="cc-name">${esc(p.company)}</div>
        <div class="cc-industry">${esc(p.industry)}</div>
        <div class="cc-quote">"${esc(q)}"</div>
        <div class="cc-footer">
          <span>${p.reviewCount} review${p.reviewCount !== 1 ? 's' : ''}</span>
          ${p.totalFlags > 0 ? `<span class="cc-flags">⚑ ${p.totalFlags} flags</span>` : '<span style="color:var(--green);font-weight:600">No flags</span>'}
        </div>
      </div>`;
  }).join('');

  // Sidebar companies
  const sc = document.getElementById('sidebar-companies');
  if (sc) sc.innerHTML = profiles.slice(0, 6).map(p => `
    <div class="sc-item" onclick="filterByCompany('${esc(p.company)}')">
      <div>
        <div class="sc-company">${esc(p.company)}</div>
        <div class="sc-meta">${p.reviewCount} reviews</div>
      </div>
      <span class="rating-badge ${ratingClass(p.avgRating)}">${p.avgRating.toFixed(1)}</span>
    </div>`).join('');
}

/* === LEADERBOARDS === */
async function loadLeaderboards() {
  const data = await get('/api/leaderboards');
  renderLB('lb-worst', data.worst, 'down');
  renderLB('lb-best',  data.best,  'up');
}

function renderLB(id, rows, dir) {
  document.getElementById(id).innerHTML = rows.map(r => {
    const pct = (r.rating / 5 * 100).toFixed(1);
    const fc  = r.rating < 2.5 ? 'low' : r.rating < 3.8 ? 'mid' : 'high';
    const rc  = ratingClass(r.rating);
    return `
      <div class="lb-row">
        <div class="lb-rank">${String(r.rank).padStart(2,'0')}</div>
        <div class="lb-info">
          <div class="lb-company">${esc(r.company)}</div>
          <div class="lb-meta">${esc(r.industry)} · ${r.reviews} ${r.reviews == 1 ? 'review' : 'reviews'}</div>
          <div class="lb-bar-track">
            <div class="lb-bar-fill ${fc}" style="width:${pct}%"></div>
          </div>
        </div>
        <span class="rating-badge ${rc}">${r.rating.toFixed(1)}</span>
      </div>`;
  }).join('');
}

/* === RED FLAGS === */
async function loadRedFlags() {
  const flags = await get('/api/redflags');
  const max = Math.max(...flags.map(f => f.count));
  document.getElementById('redflags-list').innerHTML = flags.map(f => `
    <div class="redflag-item">
      <div class="rf-eyebrow">FLAG THIS MONTH</div>
      <div class="rf-flag">${esc(f.flag)}</div>
      <div class="rf-company">${esc(f.company)}</div>
      <div class="rf-count-row">
        <div class="rf-count">${f.count}</div>
        <div class="rf-bar-wrap">
          <div class="rf-bar-track">
            <div class="rf-bar-fill" style="width:${(f.count/max*100).toFixed(1)}%"></div>
          </div>
        </div>
      </div>
    </div>`).join('');
}

/* === COMPANIES === */
async function loadCompanies() {
  companies = await get('/api/companies');
  const dl = document.getElementById('company-list');
  if (dl) dl.innerHTML = companies.map(c => `<option value="${esc(c.name)}">`).join('');
}

/* === MODAL === */
function openModal() {
  currentStep = 1;
  showStep(1);
  setProgress(1);
  document.getElementById('review-form').classList.remove('hidden');
  document.getElementById('review-success').classList.add('hidden');
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  document.querySelector('.nav-cta').classList.add('active');
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modal-overlay')) return;
  forceCloseModal();
}

function forceCloseModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.body.style.overflow = '';
  document.querySelector('.nav-cta').classList.remove('active');
}

function showStep(n) {
  document.querySelectorAll('.form-step').forEach(s => s.classList.add('hidden'));
  const s = document.getElementById(`step-${n}`);
  if (s) { s.classList.remove('hidden'); s.querySelector('input,select,textarea')?.focus(); }
}

function setProgress(step) {
  const bar = document.getElementById('modal-bar');
  if (bar) bar.style.width = `${(step / 7) * 100}%`;
}

function nextStep(from) {
  if (!validate(from)) return;
  currentStep = from + 1;
  showStep(currentStep);
  setProgress(currentStep);
}

function validate(n) {
  const flash = id => {
    const el = document.getElementById(id);
    el.style.boxShadow = '0 0 0 3px rgba(192,57,43,0.3)';
    el.focus();
    setTimeout(() => { el.style.boxShadow = ''; }, 1200);
  };
  if (n === 1) {
    if (!document.getElementById('f-company').value.trim()) { flash('f-company'); return false; }
    if (!document.getElementById('f-industry').value)       { flash('f-industry'); return false; }
  }
  if (n === 2) {
    // optional step — no validation required
  }
  if (n === 3) {
    if (!document.getElementById('f-category').value) {
      document.getElementById('f-category-grid').style.outline = '2px solid var(--red)';
      setTimeout(() => { document.getElementById('f-category-grid').style.outline = ''; }, 1000);
      return false;
    }
  }
  if (n === 4 && !document.getElementById('f-headline').value.trim()) { flash('f-headline'); return false; }
  if (n === 5 && !document.getElementById('f-body').value.trim())     { flash('f-body'); return false; }
  return true;
}

function setupCategoryButtons() {
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('f-category').value = btn.dataset.val;
    });
  });
}

function setupCharCount() {
  const input = document.getElementById('f-headline');
  const el    = document.getElementById('char-count');
  if (!input || !el) return;
  input.addEventListener('input', () => {
    const r = 120 - input.value.length;
    el.textContent = `${r} character${r !== 1 ? 's' : ''} remaining`;
    el.style.color = r < 20 ? 'var(--red)' : '';
  });
}

function updateRatingDisplay(val) {
  const v  = parseFloat(val);
  const el = document.getElementById('rating-display');
  el.textContent = v.toFixed(1);
  el.style.color = v < 2.5 ? 'var(--red)' : v < 3.8 ? 'var(--amber)' : 'var(--green)';
}

async function submitReview(e) {
  e.preventDefault();
  const review = {
    company:  document.getElementById('f-company').value.trim(),
    industry: document.getElementById('f-industry').value,
    role:     document.getElementById('f-role').value.trim(),
    type:     document.getElementById('f-type').value,
    category: document.getElementById('f-category').value,
    headline: document.getElementById('f-headline').value.trim(),
    body:     document.getElementById('f-body').value.trim(),
    rating:   parseFloat(document.getElementById('f-rating').value),
    redFlags: [...document.querySelectorAll('.rf-check input:checked')].map(i => i.value),
  };
  await post('/api/reviews', review);
  document.getElementById('review-form').classList.add('hidden');
  document.getElementById('review-success').classList.remove('hidden');
  setProgress(7);

  await Promise.all([
    loadStats(),
    loadReviews(),
    loadFeaturedFloats(),
    loadLeaderboards(),
    loadGhostReport(),
    loadInsights(),
    loadCompanySpotlight(),
    loadCompanies(),
  ]);
}

/* === SCROLL REVEAL === */
function setupReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

/* === FOOTER EMAIL === */
function subscribeEmail(btn) {
  const input = btn.previousElementSibling;
  if (!input.value.includes('@')) { input.focus(); return; }
  btn.textContent = '✓';
  btn.style.background = 'var(--green)';
  input.value = '';
  input.placeholder = "You're in!";
  input.disabled = true;
}

/* === HELPERS === */
const ratingClass = r => r < 2.5 ? 'rating-low' : r < 3.8 ? 'rating-mid' : 'rating-high';

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function timeAgo(d) {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  const days = Math.floor(s/86400);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}
