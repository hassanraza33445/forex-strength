export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  try {
    const currencies = ['EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];
    
    // Try multiple APIs with timeout - first one to succeed wins
    const fetchWithTimeout = async (url, ms = 5000) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), ms);
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: ctrl.signal
        });
        clearTimeout(t);
        return r;
      } catch (e) { clearTimeout(t); throw e; }
    };
    
    let current = null;
    let dataSource = '';
    
    // Try API 1: open.er-api.com
    try {
      const r = await fetchWithTimeout('https://open.er-api.com/v6/latest/USD', 4000);
      if (r.ok) {
        const d = await r.json();
        if (d.rates && d.rates.EUR) {
          current = { USD: 1 };
          for (const c of currencies) current[c] = d.rates[c];
          dataSource = 'open.er-api.com';
        }
      }
    } catch (e) { console.log('API 1 failed'); }
    
    // Try API 2: Frankfurter
    if (!current) {
      try {
        const r = await fetchWithTimeout('https://api.frankfurter.dev/v1/latest?base=USD&symbols=' + currencies.join(','), 4000);
        if (r.ok) {
          const d = await r.json();
          if (d.rates) {
            current = { USD: 1, ...d.rates };
            dataSource = 'frankfurter.dev';
          }
        }
      } catch (e) { console.log('API 2 failed'); }
    }
    
    // Try API 3: exchangerate-api
    if (!current) {
      try {
        const r = await fetchWithTimeout('https://api.exchangerate-api.com/v4/latest/USD', 4000);
        if (r.ok) {
          const d = await r.json();
          if (d.rates && d.rates.EUR) {
            current = { USD: 1 };
            for (const c of currencies) current[c] = d.rates[c];
            dataSource = 'exchangerate-api.com';
          }
        }
      } catch (e) { console.log('API 3 failed'); }
    }
    
    if (!current) throw new Error('All current rate APIs failed');
    
    // Get historical (24h ago) - try Frankfurter first
    const yesterday = new Date(Date.now() - 86400000);
    let prevDate = new Date(yesterday);
    while (prevDate.getDay() === 0 || prevDate.getDay() === 6) {
      prevDate.setDate(prevDate.getDate() - 1);
    }
    const prevDateStr = prevDate.toISOString().split('T')[0];
    
    let historical = null;
    try {
      const r = await fetchWithTimeout(`https://api.frankfurter.dev/v1/${prevDateStr}?base=USD&symbols=${currencies.join(',')}`, 4000);
      if (r.ok) {
        const d = await r.json();
        if (d.rates) historical = { USD: 1, ...d.rates };
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
    
    res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=600');
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
