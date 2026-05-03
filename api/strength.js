export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  try {
    const currencies = ['EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];
    const symbols = currencies.join(',');
    
    const currentRes = await fetch(`https://api.frankfurter.dev/latest?base=USD&symbols=${symbols}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!currentRes.ok) throw new Error('Current rates failed');
    const currentData = await currentRes.json();
    
    const yesterday = new Date(Date.now() - 86400000);
    const dateStr = yesterday.toISOString().split('T')[0];
    const histRes = await fetch(`https://api.frankfurter.dev/${dateStr}?base=USD&symbols=${symbols}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!histRes.ok) throw new Error('Historical rates failed');
    const histData = await histRes.json();
    
    const allCurrencies = ['USD', ...currencies];
    const current = { USD: 1, ...currentData.rates };
    const historical = { USD: 1, ...histData.rates };
    
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
    
    res.setHeader('Cache-Control', 's-maxage=300');
    return res.status(200).json({
      timestamp: new Date().toISOString(),
      base_period: '24h',
      strengths: result
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
