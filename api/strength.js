export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  try {
    const currencies = ['EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];
    
    // Try multiple LIVE APIs - they update every minute
    let current = null;
    let historical = null;
    let dataSource = '';
    
    // PRIMARY: open.er-api.com - free, live, no API key, updates every few minutes
    try {
      const r1 = await fetch('https://open.er-api.com/v6/latest/USD', {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (r1.ok) {
        const d = await r1.json();
        if (d.rates && d.rates.EUR) {
          current = { USD: 1 };
          for (const c of currencies) current[c] = d.rates[c];
          dataSource = 'open.er-api.com (live)';
        }
      }
    } catch (e) {}
    
    // FALLBACK: Frankfurter
    if (!current) {
      try {
        const r1 = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=' + currencies.join(','), {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (r1.ok) {
          const d = await r1.json();
          if (d.rates) {
            current = { USD: 1, ...d.rates };
            dataSource = 'frankfurter (daily ECB)';
          }
        }
      } catch (e) {}
    }
    
    if (!current) throw new Error('All current rate APIs failed');
    
    // Get 24h ago rates from Frankfurter (historical)
    const yesterday = new Date(Date.now() - 86400000);
    let prevDate = new Date(yesterday);
    while (prevDate.getDay() === 0 || prevDate.getDay() === 6) {
      prevDate.setDate(prevDate.getDate() - 1);
    }
    const prevDateStr = prevDate.toISOString().split('T')[0];
    
    try {
      const r2 = await fetch(`https://api.frankfurter.dev/v1/${prevDateStr}?base=USD&symbols=${currencies.join(',')}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (r2.ok) {
        const d = await r2.json();
        historical = { USD: 1, ...d.rates };
      }
    } catch (e) {}
    
    if (!historical) throw new Error('Historical rates failed');
    
    const allCurrencies = ['USD', ...currencies];
    const strengths = {};
    
    for (const base of allCurrencies) {
      let totalChange = 0;
      let count = 0;
      for (const quote of allCurrencies) {
        if (base === quote) continue;
        if (base === 'USD') {
          totalChange += -((current[quote] - historical[quote]) / historical[quote]) * 100;
        } else {
          const cur = current[quote] / current[base];
          const his = historical[quote] / historical[base];
          totalChange += ((cur - his) / his) * 100;
        }
        count++;
      }
      strengths[base] = totalChange / count;
    }
    
    const result = allCurrencies.map(c => ({
      currency: c,
      strength: parseFloat(strengths[c].toFixed(3)),
      direction: strengths[c] > 0.05 ? 'up' : (strengths[c] < -0.05 ? 'down' : 'flat')
    })).sort((a, b) => b.strength - a.strength);
    
    res.setHeader('Cache-Control', 's-maxage=120'); // 2 min cache (more frequent updates)
    return res.status(200).json({
      timestamp: new Date().toISOString(),
      latest_date: new Date().toISOString().split('T')[0],
      previous_date: prevDateStr,
      data_source: dataSource,
      strengths: result
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
