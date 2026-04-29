require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const reviews = [
  {
    company: 'Marrow Health Systems',
    category: 'Interview Process',
    headline: 'Six rounds over ten weeks, then a form rejection with no feedback.',
    body: 'Started with an HR screen, then two technical rounds, a panel, a culture fit call, and a final presentation to the VP. Every stage had a two-week gap with no updates unless I chased. Rejection came as a templated email the same day as the final round. No reason given, no offer to discuss.',
    role: 'Senior Data Analyst',
    type: 'Interview candidate',
    rating: 1.3,
    verified: true,
    flags: 5,
    upvotes: 214,
    date: '2026-04-28T09:00:00Z',
  },
  {
    company: 'Kestrel Software',
    category: 'Responsiveness',
    headline: 'Every stage had a named contact and a real timeline.',
    body: 'Three rounds total. Before each one I got a calendar invite with an agenda, the names of interviewers, and what they would be assessing. After each round the recruiter called within 24 hours with honest feedback. Even when they extended the timeline by a week, they told me proactively. This is how it should work.',
    role: 'Product Manager',
    type: 'Interview candidate',
    rating: 4.9,
    verified: true,
    flags: 0,
    upvotes: 187,
    date: '2026-04-27T14:00:00Z',
  },
  {
    company: 'Verdant Logistics',
    category: 'Overall HR',
    headline: 'Recruiter went silent mid-offer. Never heard from them again.',
    body: 'Verbal offer was extended on a Thursday. Recruiter said the written offer would arrive by end of week. It never came. I followed up five times over three weeks via email and phone. No response whatsoever. LinkedIn message was read but not replied to. The job posting was quietly removed a month later.',
    role: 'Supply Chain Manager',
    type: 'Offer recipient',
    rating: 1.0,
    verified: true,
    flags: 8,
    upvotes: 276,
    date: '2026-04-26T11:00:00Z',
  },
  {
    company: 'Helix Biotech',
    category: 'Offer Stage',
    headline: 'Transparent comp, no games, signed within the week.',
    body: 'Salary range was listed on the job posting. During the first call the recruiter confirmed where in the band they were targeting. Offer came in at the top of range with a clear breakdown of equity and benefits. When I asked one question about the equity cliff they answered immediately and in writing. Refreshingly straightforward.',
    role: 'Clinical Research Associate',
    type: 'Offer recipient',
    rating: 4.7,
    verified: true,
    flags: 0,
    upvotes: 143,
    date: '2026-04-25T16:00:00Z',
  },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of reviews) {
      const { rows } = await client.query('SELECT id FROM companies WHERE name = $1', [r.company]);
      if (!rows.length) { console.warn(`Company not found: ${r.company}`); continue; }
      await client.query(
        `INSERT INTO reviews (id, company_id, category, headline, body, role, type, rating, verified, flags, upvotes, date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING`,
        [Date.now() + Math.floor(Math.random() * 10000), rows[0].id, r.category, r.headline, r.body, r.role, r.type, r.rating, r.verified, r.flags, r.upvotes, r.date]
      );
      console.log(`Added: ${r.headline.slice(0, 50)}...`);
    }
    await client.query('COMMIT');
    console.log('Done.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Failed:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
