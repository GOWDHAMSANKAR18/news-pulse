import type { NewsItem, Category, Sentiment, Urgency } from '../../types';

const CATEGORIES: Category[] = ['Technology', 'Politics', 'Business', 'Sports', 'World', 'India', 'Science', 'Health', 'Environment'];
const SENTIMENTS: Sentiment[] = ['Positive', 'Neutral', 'Negative'];
const SOURCES = ['Simulated Node A', 'Simulated Node B', 'High-Volume Synthetic Source', 'Stress Test Stream', 'Benchmarking Producer'];

const TITLE_TEMPLATES = [
  'Global market surge triggers record trading volume in enterprise stocks',
  'Breakthrough quantum computing algorithm benchmarked at petascale speed',
  'Renewable energy capacity reaches historic high in national grid trial',
  'Automated pipeline architecture ingests 100,000 real-time events per second',
  'Central bank announces revised digital currency liquidity directives',
  'Deep learning model achieves state-of-the-art accuracy on multi-lingual news classification',
  'International climate summit concludes with historic decarbonization pact',
  'Autonomous satellite swarm successfully deploys in low Earth orbit',
];

export function generateSyntheticVolumeBatch(count = 1000): { items: NewsItem[]; executionTimeMs: number; storageKb: number } {
  const startTime = performance.now();
  const items: NewsItem[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const category = CATEGORIES[i % CATEGORIES.length];
    const sentiment = SENTIMENTS[i % SENTIMENTS.length];
    const source = SOURCES[i % SOURCES.length];
    const title = `${TITLE_TEMPLATES[i % TITLE_TEMPLATES.length]} #${i + 1}`;
    const pubDate = now - Math.floor(Math.random() * 86400000);
    const urgencyScore = Math.floor(Math.random() * 90) + 10;
    
    let urgency: Urgency = 'low';
    if (urgencyScore >= 80) urgency = 'critical';
    else if (urgencyScore >= 60) urgency = 'high';
    else if (urgencyScore >= 40) urgency = 'medium';

    items.push({
      id: `synth-${pubDate}-${i}`,
      title,
      description: `Synthetic stress test record #${i + 1} generated for Volume scalability benchmarking.`,
      url: `https://benchmark.simulated/record/${i}`,
      source,
      author: 'Synthetic Benchmark Worker',
      category,
      sentiment,
      sentimentScore: sentiment === 'Positive' ? 0.7 : sentiment === 'Negative' ? -0.7 : 0,
      urgencyScore,
      urgency,
      region: { id: 'global', name: 'Global', lat: 0, lng: 0 },
      country: 'Synthetic',
      language: 'en',
      imageUrl: null,
      provider: 'Synthetic Stream',
      timestamp: pubDate,
      fetchedAt: now,
      summary: `Synthetic record generated for stress testing Big Data volume.`,
      canonicalUrl: `https://benchmark.simulated/record/${i}`,
      contentHash: `synth|${i}|${title.toLowerCase()}`,
      qualityScore: 90,
      isSynthetic: true,
    });
  }

  const endTime = performance.now();
  const executionTimeMs = +(endTime - startTime).toFixed(2);
  const jsonSize = JSON.stringify(items).length;
  const storageKb = +(jsonSize / 1024).toFixed(2);

  return { items, executionTimeMs, storageKb };
}
