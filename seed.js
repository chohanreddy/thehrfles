require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function seed() {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'reviews.json'), 'utf8'));
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const c of data.companies) {
      await client.query(
        'INSERT INTO companies (name, industry) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
        [c.name, c.industry]
      );
    }
    console.log(`Seeded ${data.companies.length} companies`);

    for (const r of data.reviews) {
      const { rows } = await client.query('SELECT id FROM companies WHERE name = $1', [r.company]);
      if (!rows.length) { console.warn(`Company not found: ${r.company}`); continue; }
      const companyId = rows[0].id;

      await client.query(
        `INSERT INTO reviews (id, company_id, category, headline, body, role, type, rating, verified, flags, upvotes, date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO NOTHING`,
        [r.id, companyId, r.category, r.headline, r.body, r.role, r.type, r.rating, r.verified, r.flags, r.upvotes, r.date]
      );
    }
    console.log(`Seeded ${data.reviews.length} reviews`);

    await client.query('COMMIT');
    console.log('Seed complete.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
