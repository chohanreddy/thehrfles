const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 8080;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function loadData() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'reviews.json'), 'utf8'));
}

app.get('/api/stats', (req, res) => {
  const data = loadData();
  res.json(data.stats);
});

app.get('/api/reviews', (req, res) => {
  const data = loadData();
  const { filter, company, industry, q } = req.query;
  let reviews = [...data.reviews];

  if (q) {
    const query = q.toLowerCase();
    reviews = reviews.filter(r =>
      r.company.toLowerCase().includes(query) ||
      r.industry.toLowerCase().includes(query) ||
      r.headline.toLowerCase().includes(query)
    );
  }
  if (company) reviews = reviews.filter(r => r.company.toLowerCase() === company.toLowerCase());
  if (industry) reviews = reviews.filter(r => r.industry.toLowerCase() === industry.toLowerCase());

  if (filter === 'worst') reviews.sort((a, b) => a.rating - b.rating);
  else if (filter === 'best') reviews.sort((a, b) => b.rating - a.rating);
  else if (filter === 'flagged') reviews.sort((a, b) => b.flags - a.flags);
  else reviews.sort((a, b) => new Date(b.date) - new Date(a.date));

  res.json(reviews);
});

app.get('/api/leaderboards', (req, res) => {
  const data = loadData();
  res.json(data.leaderboards);
});

app.get('/api/redflags', (req, res) => {
  const data = loadData();
  res.json(data.redFlags);
});

app.get('/api/companies', (req, res) => {
  const data = loadData();
  res.json(data.companies);
});

app.get('/api/company-profiles', (req, res) => {
  const data = loadData();
  const map = {};

  data.reviews.forEach(r => {
    if (!map[r.company]) {
      map[r.company] = { company: r.company, industry: r.industry, reviews: [], totalRating: 0 };
    }
    map[r.company].reviews.push(r);
    map[r.company].totalRating += r.rating;
  });

  const profiles = Object.values(map).map(p => {
    const sorted = [...p.reviews].sort((a, b) => b.upvotes - a.upvotes);
    return {
      company: p.company,
      industry: p.industry,
      reviewCount: p.reviews.length,
      avgRating: Math.round((p.totalRating / p.reviews.length) * 10) / 10,
      topReview: sorted[0],
      totalFlags: p.reviews.reduce((sum, r) => sum + r.flags, 0),
    };
  }).sort((a, b) => b.reviewCount - a.reviewCount);

  res.json(profiles);
});

app.get('/api/ghost-report', (req, res) => {
  const data = loadData();

  const GHOST_KEYWORDS = ['ghost', 'radio silence', 'no response', 'no reply', 'never heard', 'silence', 'disappeared', 'nothing', 'no follow', 'no email', 'no call', 'no feedback'];

  const isGhost = r => {
    const text = `${r.headline} ${r.body}`.toLowerCase();
    const flagged = r.redFlags && r.redFlags.includes('Ghosted after final round');
    const keyword = GHOST_KEYWORDS.some(k => text.includes(k));
    const lowResponsive = r.category === 'Responsiveness' && r.rating < 2.5;
    return flagged || keyword || lowResponsive;
  };

  const ghostReviews = data.reviews.filter(isGhost).sort((a, b) => new Date(b.date) - new Date(a.date));

  const byCompany = {};
  ghostReviews.forEach(r => {
    if (!byCompany[r.company]) byCompany[r.company] = { company: r.company, industry: r.industry, count: 0, latestReview: r };
    byCompany[r.company].count++;
  });

  const ghostFlag = data.redFlags.find(f => f.flag === 'Ghosted after final round');
  const offenders = Object.values(byCompany).sort((a, b) => b.count - a.count);

  res.json({
    totalGhosted: ghostFlag ? ghostFlag.count : ghostReviews.length,
    topOffender: offenders[0] || null,
    offenders: offenders.slice(0, 5),
    recentReviews: ghostReviews.slice(0, 3),
  });
});

app.get('/api/insights', (req, res) => {
  const data = loadData();
  const categories = {};
  const industries = {};

  data.reviews.forEach(r => {
    if (!categories[r.category]) categories[r.category] = { count: 0, totalRating: 0 };
    categories[r.category].count++;
    categories[r.category].totalRating += r.rating;

    if (!industries[r.industry]) industries[r.industry] = { count: 0, totalRating: 0 };
    industries[r.industry].count++;
    industries[r.industry].totalRating += r.rating;
  });

  const categoryBreakdown = Object.entries(categories).map(([name, d]) => ({
    name,
    count: d.count,
    avgRating: Math.round((d.totalRating / d.count) * 10) / 10,
  })).sort((a, b) => b.count - a.count);

  const industryBreakdown = Object.entries(industries).map(([name, d]) => ({
    name,
    count: d.count,
    avgRating: Math.round((d.totalRating / d.count) * 10) / 10,
  })).sort((a, b) => a.avgRating - b.avgRating);

  res.json({ categoryBreakdown, industryBreakdown });
});

app.post('/api/reviews', (req, res) => {
  const data = loadData();
  const review = {
    id: Date.now(),
    ...req.body,
    date: new Date().toISOString(),
    upvotes: 0,
    flags: 0,
    verified: false,
  };
  data.reviews.unshift(review);
  data.stats.reviewsFiled += 1;
  fs.writeFileSync(path.join(__dirname, 'data', 'reviews.json'), JSON.stringify(data, null, 2));
  res.json({ success: true, review });
});

app.post('/api/reviews/:id/upvote', (req, res) => {
  const data = loadData();
  const review = data.reviews.find(r => r.id === parseInt(req.params.id));
  if (review) {
    review.upvotes += 1;
    fs.writeFileSync(path.join(__dirname, 'data', 'reviews.json'), JSON.stringify(data, null, 2));
    res.json({ upvotes: review.upvotes });
  } else {
    res.status(404).json({ error: 'Review not found' });
  }
});

app.listen(PORT, () => {
  console.log(`The HR Files running at http://localhost:${PORT}`);
});
