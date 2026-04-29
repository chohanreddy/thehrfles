require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 8080;

// Security headers
app.use(helmet({ contentSecurityPolicy: false }));

// CORS — only allow same origin
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || origin === `http://localhost:${PORT}`) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  next();
});

app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiter for write endpoints
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Input validation helper
function validateReview(body) {
  const { company, industry, category, headline, body: text, role, type, rating } = body;
  const validCategories = ['Interview Process', 'Responsiveness', 'Offer Stage', 'Overall HR'];
  const validTypes = ['Interview candidate', 'Offer recipient', 'Former employee', 'Current employee'];

  if (!company || typeof company !== 'string' || company.trim().length < 2) return 'Invalid company name';
  if (!industry || typeof industry !== 'string') return 'Invalid industry';
  if (!validCategories.includes(category)) return 'Invalid category';
  if (!headline || typeof headline !== 'string' || headline.trim().length < 5) return 'Headline too short';
  if (!text || typeof text !== 'string' || text.trim().length < 20) return 'Review body too short';
  if (role && typeof role === 'string' && role.trim().length > 0 && role.trim().length < 2) return 'Invalid role';
  if (type && !validTypes.includes(type)) return 'Invalid type';
  const r = parseFloat(rating);
  if (isNaN(r) || r < 1 || r > 5) return 'Rating must be between 1 and 5';
  return null;
}

// GET /api/stats — computed from DB
app.get('/api/stats', async (req, res) => {
  try {
    const [companiesRes, reviewsRes, avgRes, flagsRes, industriesRes, ghostRes] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM companies'),
      pool.query('SELECT COUNT(*) FROM reviews'),
      pool.query('SELECT ROUND(AVG(rating)::numeric, 1) as avg FROM reviews'),
      pool.query('SELECT COALESCE(SUM(flags), 0) as total FROM reviews'),
      pool.query('SELECT COUNT(DISTINCT industry) as total FROM companies'),
      pool.query(`
        SELECT r.body FROM reviews r
        JOIN companies c ON r.company_id = c.id
        WHERE r.category = 'Responsiveness' AND r.rating < 2.5
           OR LOWER(r.headline) LIKE '%ghost%' OR LOWER(r.body) LIKE '%ghost%'
           OR LOWER(r.body) LIKE '%weeks of nothing%' OR LOWER(r.body) LIKE '%radio silence%'
      `),
    ]);

    const weekMatches = ghostRes.rows.flatMap(r => {
      const m = (r.body || '').match(/(\d+)\s*weeks?/gi) || [];
      return m.map(x => parseInt(x));
    });
    const longestGhost = weekMatches.length ? Math.max(...weekMatches) : null;

    res.json({
      companies: parseInt(companiesRes.rows[0].count),
      reviewsFiled: parseInt(reviewsRes.rows[0].count),
      avgRating: parseFloat(avgRes.rows[0].avg) || 0,
      totalFlags: parseInt(flagsRes.rows[0].total),
      industries: parseInt(industriesRes.rows[0].total),
      longestGhostWeeks: longestGhost,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/reviews
app.get('/api/reviews', async (req, res) => {
  try {
    const { filter, company, industry, q } = req.query;

    let where = [];
    let params = [];
    let i = 1;

    if (q) {
      where.push(`(c.name ILIKE $${i} OR c.industry ILIKE $${i} OR r.headline ILIKE $${i})`);
      params.push(`%${q}%`);
      i++;
    }
    if (company) {
      where.push(`LOWER(c.name) = LOWER($${i})`);
      params.push(company);
      i++;
    }
    if (industry) {
      where.push(`LOWER(c.industry) = LOWER($${i})`);
      params.push(industry);
      i++;
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const orderMap = {
      worst: 'r.rating ASC',
      best: 'r.rating DESC',
      flagged: 'r.flags DESC',
    };
    const order = orderMap[filter] || 'r.date DESC';

    const sql = `
      SELECT r.id, c.name AS company, c.industry, r.category, r.headline, r.body,
             r.role, r.type, r.rating, r.verified, r.flags, r.upvotes, r.date
      FROM reviews r
      JOIN companies c ON r.company_id = c.id
      ${whereClause}
      ORDER BY ${order}
    `;

    const { rows } = await pool.query(sql, params);
    res.json(rows.map(r => ({ ...r, rating: parseFloat(r.rating), upvotes: parseInt(r.upvotes), flags: parseInt(r.flags) })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/companies
app.get('/api/companies', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT name, industry FROM companies ORDER BY name');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/company-profiles
app.get('/api/company-profiles', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        c.name AS company,
        c.industry,
        COUNT(r.id) AS "reviewCount",
        ROUND(AVG(r.rating)::numeric, 1) AS "avgRating",
        SUM(r.flags) AS "totalFlags"
      FROM companies c
      LEFT JOIN reviews r ON r.company_id = c.id
      GROUP BY c.id, c.name, c.industry
      ORDER BY COUNT(r.id) DESC
    `);

    const profiles = await Promise.all(rows.map(async (p) => {
      const { rows: topRows } = await pool.query(`
        SELECT r.id, c.name AS company, c.industry, r.category, r.headline, r.body,
               r.role, r.type, r.rating, r.verified, r.flags, r.upvotes, r.date
        FROM reviews r JOIN companies c ON r.company_id = c.id
        WHERE c.name = $1 ORDER BY r.upvotes DESC LIMIT 1
      `, [p.company]);
      return { ...p, reviewCount: parseInt(p.reviewCount), totalFlags: parseInt(p.totalFlags), topReview: topRows[0] || null };
    }));

    res.json(profiles);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/leaderboards — computed from real data
app.get('/api/leaderboards', async (req, res) => {
  try {
    const [worstRes, bestRes] = await Promise.all([
      pool.query(`
        SELECT c.name AS company, c.industry,
               COUNT(r.id) AS reviews,
               ROUND(AVG(r.rating)::numeric, 1) AS rating
        FROM reviews r JOIN companies c ON r.company_id = c.id
        GROUP BY c.id, c.name, c.industry
        HAVING COUNT(r.id) > 0
        ORDER BY AVG(r.rating) ASC LIMIT 5
      `),
      pool.query(`
        SELECT c.name AS company, c.industry,
               COUNT(r.id) AS reviews,
               ROUND(AVG(r.rating)::numeric, 1) AS rating
        FROM reviews r JOIN companies c ON r.company_id = c.id
        GROUP BY c.id, c.name, c.industry
        HAVING COUNT(r.id) > 0
        ORDER BY AVG(r.rating) DESC LIMIT 5
      `),
    ]);

    const rank = (rows) => rows.map((r, i) => ({ rank: i + 1, ...r, reviews: parseInt(r.reviews), rating: parseFloat(r.rating) }));
    res.json({ worst: rank(worstRes.rows), best: rank(bestRes.rows) });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/ghost-report
app.get('/api/ghost-report', async (req, res) => {
  try {
    const GHOST_KEYWORDS = ['ghost', 'radio silence', 'no response', 'no reply', 'never heard', 'silence', 'disappeared', 'nothing', 'no follow', 'no email', 'no call', 'no feedback'];
    const keywordSQL = GHOST_KEYWORDS.map(k => `(LOWER(r.headline) LIKE '%${k}%' OR LOWER(r.body) LIKE '%${k}%')`).join(' OR ');

    const { rows: ghostRows } = await pool.query(`
      SELECT r.id, c.name AS company, c.industry, r.category, r.headline, r.body,
             r.role, r.type, r.rating, r.verified, r.flags, r.upvotes, r.date
      FROM reviews r JOIN companies c ON r.company_id = c.id
      WHERE (r.category = 'Responsiveness' AND r.rating < 2.5)
         OR (${keywordSQL})
      ORDER BY r.date DESC
    `);

    const byCompany = {};
    ghostRows.forEach(r => {
      if (!byCompany[r.company]) byCompany[r.company] = { company: r.company, industry: r.industry, count: 0, latestReview: r };
      byCompany[r.company].count++;
    });

    const offenders = Object.values(byCompany).sort((a, b) => b.count - a.count);
    res.json({
      totalGhosted: ghostRows.length,
      topOffender: offenders[0] || null,
      offenders: offenders.slice(0, 5),
      recentReviews: ghostRows.slice(0, 3),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/insights
app.get('/api/insights', async (req, res) => {
  try {
    const [catRes, indRes] = await Promise.all([
      pool.query(`
        SELECT r.category AS name, COUNT(*) AS count, ROUND(AVG(r.rating)::numeric,1) AS "avgRating"
        FROM reviews r GROUP BY r.category ORDER BY COUNT(*) DESC
      `),
      pool.query(`
        SELECT c.industry AS name, COUNT(*) AS count, ROUND(AVG(r.rating)::numeric,1) AS "avgRating"
        FROM reviews r JOIN companies c ON r.company_id = c.id
        GROUP BY c.industry ORDER BY AVG(r.rating) ASC
      `),
    ]);

    res.json({
      categoryBreakdown: catRes.rows.map(r => ({ ...r, count: parseInt(r.count), avgRating: parseFloat(r.avgRating) })),
      industryBreakdown: indRes.rows.map(r => ({ ...r, count: parseInt(r.count), avgRating: parseFloat(r.avgRating) })),
    });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/reviews
app.post('/api/reviews', writeLimiter, async (req, res) => {
  const err = validateReview(req.body);
  if (err) return res.status(400).json({ error: err });

  const { company, industry, category, headline, body: text, role, type, rating, redFlags } = req.body;
  const flagCount = Array.isArray(redFlags) ? redFlags.length : 0;

  try {
    await pool.query(
      'INSERT INTO companies (name, industry) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
      [company.trim(), industry.trim()]
    );

    const { rows } = await pool.query('SELECT id FROM companies WHERE name = $1', [company.trim()]);
    const companyId = rows[0].id;

    const { rows: inserted } = await pool.query(
      `INSERT INTO reviews (id, company_id, category, headline, body, role, type, rating, verified, flags, upvotes, date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,$9,0,NOW()) RETURNING *`,
      [Date.now(), companyId, category, headline.trim(), text.trim(), role ? role.trim() : null, type || null, parseFloat(rating), flagCount]
    );

    res.json({ success: true, review: inserted[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/reviews/:id/upvote
app.post('/api/reviews/:id/upvote', writeLimiter, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid review ID' });

  try {
    const { rows } = await pool.query(
      'UPDATE reviews SET upvotes = upvotes + 1 WHERE id = $1 RETURNING upvotes',
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Review not found' });
    res.json({ upvotes: rows[0].upvotes });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(PORT, () => {
  console.log(`The HR Files running at http://localhost:${PORT}`);
});
