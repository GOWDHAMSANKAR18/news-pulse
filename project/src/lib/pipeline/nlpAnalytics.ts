import type { NewsItem, EventCluster, TopicGrowth, Category } from '../../types';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has',
  'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'this', 'that', 'these', 'those', 'it', 'its', 'as', 'if', 'then', 'than', 'so',
  'not', 'no', 'yes', 'said', 'says', 'say', 'after', 'before', 'over', 'under',
  'about', 'into', 'out', 'up', 'down', 'new', 'more', 'most', 'some', 'any', 'all',
  'can', 'just', 'also', 'only', 'one', 'two', 'three', 'first', 'last', 'how',
  'what', 'when', 'where', 'why', 'who', 'which', 'amid', 'amidst', 'during', 'while',
  'i', 'you', 'he', 'she', 'we', 'they', 'them', 'his', 'her', 'their', 'our', 'report',
  'india', 'news', 'today', 'live', 'latest', 'updates', 'pm', 'govt', 'government'
]);

// 1. TF-IDF Keyword Extraction
export function extractTfidfKeywords(articles: NewsItem[], topN = 12): { keyword: string; count: number; score: number }[] {
  if (articles.length === 0) return [];

  const docCount = articles.length;
  const termDocFreq: Record<string, number> = {};
  const termTotalCount: Record<string, number> = {};

  articles.forEach(art => {
    const text = `${art.title} ${art.description || ''}`.toLowerCase();
    const words = text.replace(/[^a-z0-9\s-]/g, '').split(/\s+/);
    const uniqueInDoc = new Set<string>();

    words.forEach(w => {
      if (w.length < 3 || STOP_WORDS.has(w)) return;
      termTotalCount[w] = (termTotalCount[w] || 0) + 1;
      uniqueInDoc.add(w);
    });

    uniqueInDoc.forEach(w => {
      termDocFreq[w] = (termDocFreq[w] || 0) + 1;
    });
  });

  const scores: { keyword: string; count: number; score: number }[] = [];

  Object.entries(termTotalCount).forEach(([term, tf]) => {
    const df = termDocFreq[term] || 1;
    const idf = Math.log(docCount / df);
    const tfidf = tf * idf;
    scores.push({ keyword: term, count: tf, score: +tfidf.toFixed(2) });
  });

  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

// 2. Event Clustering (Cosine/Jaccard Similarity over Article Text)
export function clusterNewsEvents(articles: NewsItem[]): EventCluster[] {
  if (articles.length === 0) return [];

  const clusters: EventCluster[] = [];

  articles.forEach(art => {
    const text = `${art.title}`.toLowerCase();
    const words = new Set(text.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3 && !STOP_WORDS.has(w)));

    let matchedCluster: EventCluster | null = null;
    let maxSimilarity = 0;

    for (const cluster of clusters) {
      if (cluster.category !== art.category) continue;

      const clusterWords = new Set(cluster.keywords);
      const intersection = new Set([...words].filter(w => clusterWords.has(w)));
      const union = new Set([...words, ...clusterWords]);
      const similarity = intersection.size / (union.size || 1);

      if (similarity > 0.25 && similarity > maxSimilarity) {
        maxSimilarity = similarity;
        matchedCluster = cluster;
      }
    }

    if (matchedCluster) {
      matchedCluster.articles.push(art);
      matchedCluster.articleCount++;
      matchedCluster.keywords = Array.from(new Set([...matchedCluster.keywords, ...words])).slice(0, 6);
      if (!matchedCluster.topSources.includes(art.source)) {
        matchedCluster.topSources.push(art.source);
      }
    } else {
      const clusterKeywords = Array.from(words).slice(0, 5);
      const clusterName = clusterKeywords.length > 0
        ? clusterKeywords.slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        : art.title.slice(0, 30);

      clusters.push({
        id: `cluster-${Math.random().toString(36).slice(2, 7)}`,
        name: `${art.category}: ${clusterName}`,
        category: art.category,
        articleCount: 1,
        keywords: clusterKeywords,
        topSources: [art.source],
        avgSentiment: art.sentiment,
        articles: [art],
        lastUpdated: art.timestamp || Date.now(),
      });
    }
  });

  return clusters
    .sort((a, b) => b.articleCount - a.articleCount)
    .slice(0, 6);
}

// 3. Topic Growth Computation
export function computeTopicGrowth(articles: NewsItem[]): TopicGrowth[] {
  const now = Date.now();
  const halfWindow = 12 * 60 * 60 * 1000; // 12h
  const currentCutoff = now - halfWindow;

  const currentCounts: Record<Category, number> = {
    Technology: 0, Politics: 0, Business: 0, Sports: 0, World: 0, India: 0, Science: 0, Health: 0, Environment: 0, Tech: 0, Finance: 0, General: 0
  };
  const previousCounts: Record<Category, number> = {
    Technology: 0, Politics: 0, Business: 0, Sports: 0, World: 0, India: 0, Science: 0, Health: 0, Environment: 0, Tech: 0, Finance: 0, General: 0
  };

  articles.forEach(art => {
    if (art.timestamp !== null && art.timestamp >= currentCutoff) {
      currentCounts[art.category] = (currentCounts[art.category] || 0) + 1;
    } else {
      previousCounts[art.category] = (previousCounts[art.category] || 0) + 1;
    }
  });

  const categories: Category[] = ['Technology', 'Politics', 'Business', 'Sports', 'World', 'India'];

  return categories.map(cat => {
    const cur = currentCounts[cat] || 0;
    const prev = previousCounts[cat] || 1;
    const growth = +(((cur - prev) / prev) * 100).toFixed(1);
    return {
      topic: cat,
      category: cat,
      currentCount: cur,
      previousCount: prev,
      growthRatePct: growth,
    };
  });
}
