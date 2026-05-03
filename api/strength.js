export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  try {
    const currencies = ['EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];
    const symbols = currencies.join(',');
    
    // Use 'latest' endpoint - returns most recent available data (handles weekends)
    const currentRes = await fetch(`https://api.frankfurter.dev/v1/latest?base=USD&symbols=${symbols}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!currentRes.ok) throw new Error('Current rates failed: ' + currentRes.status);
    const currentData = await currentRes.json();
    
    // Get the actual date of "latest" data
    const latestDate = new Date(currentData.date);
    
    // Get previous trading day (skip weekends)
    let prevDate = new Date(latestDate);
    prevDate.setDate(latestDate.getDate() - 1);
    // If previous day is Sunday (0), go back 2 more days to Friday
    while (prevDate.getDay() === 0 || prevDate.getDay() === 6) {
      prevDate.setDate(prevDate.getDate() - 1);
    }
    const prevDateStr = prevDate.toISOString().split('T')[0];
    
    const histRes = await fetch(`https://api.frankfurter.dev/v1/${prevDateStr}?base=USD&symbols=${symbols}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!histRes.ok) throw new Error('Historical rates failed: ' + histRes.status);
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
      latest_date: currentData.date,
      previous_date: prevDateStr,
      strengths: result
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
