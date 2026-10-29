import type { NewsItem, Sentiment } from '../../types';

export interface SentimentAnalysisResult {
  sentiment: Sentiment;
  score: number; // Compound score: -1.0 to 1.0
  status: 'success' | 'failed' | 'pending';
  model: string;
  reason?: string;
  breakdown: {
    positiveSum: number;
    negativeSum: number;
    neutralCount: number;
    compound: number;
    tokensEvaluated: number;
  };
}

export interface SentimentReprocessStats {
  totalEvaluated: number;
  processed: number;
  successful: number;
  unchanged: number;
  failed: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  durationMs: number;
}

/**
 * Standard VADER Configuration Thresholds
 * - Positive: compound score >= +0.05
 * - Negative: compound score <= -0.05
 * - Neutral: between -0.05 and +0.05
 */
export const SENTIMENT_THRESHOLDS = {
  POSITIVE: 0.05,
  NEGATIVE: -0.05,
  ALPHA_NORMALIZATION: 15.0, // VADER default alpha constant
  NEGATION_MULTIPLIER: -0.74, // VADER negation coefficient
  BOOSTER_INCREMENT: 0.293, // Intensity boost for amplifier adverbs
  DAMPENER_DECREMENT: -0.293, // Intensity dampener for attenuating adverbs
  EXCLAMATION_BOOST: 0.292, // Boost per exclamation mark (up to 4)
  ALL_CAPS_BOOST: 0.733, // Boost for all-caps words in mixed-case text
};

// Curated VADER valence dictionary tailored for journalistic, financial, political, and world news
const VALENCE_LEXICON: Record<string, number> = {
  // Positive Valences (+1.0 to +3.5)
  'record': 2.0,
  'records': 2.0,
  'profit': 2.4,
  'profits': 2.6,
  'profitable': 2.3,
  'growth': 2.2,
  'growing': 1.8,
  'strong': 2.3,
  'stronger': 2.2,
  'strongest': 2.5,
  'strength': 2.1,
  'boom': 2.5,
  'booming': 2.6,
  'surge': 2.0,
  'surged': 2.1,
  'surging': 2.1,
  'breakthrough': 2.8,
  'breakthroughs': 2.8,
  'success': 2.7,
  'successful': 2.6,
  'successfully': 2.4,
  'succeed': 2.3,
  'succeeded': 2.3,
  'triumph': 2.8,
  'triumphant': 2.7,
  'win': 2.3,
  'winner': 2.4,
  'winners': 2.4,
  'winning': 2.4,
  'won': 2.3,
  'recovery': 2.1,
  'recover': 1.9,
  'recovered': 2.0,
  'cure': 2.6,
  'cured': 2.5,
  'curing': 2.3,
  'peace': 2.7,
  'peaceful': 2.4,
  'prosper': 2.4,
  'prosperity': 2.6,
  'prosperous': 2.5,
  'gain': 2.0,
  'gains': 2.1,
  'gained': 1.9,
  'gaining': 2.0,
  'boost': 2.1,
  'boosted': 2.1,
  'boosting': 2.1,
  'innovative': 2.4,
  'innovation': 2.3,
  'innovations': 2.3,
  'advance': 2.0,
  'advances': 2.1,
  'advanced': 2.0,
  'advancement': 2.2,
  'historic': 1.8,
  'thriving': 2.5,
  'impressive': 2.4,
  'promising': 2.1,
  'stellar': 2.7,
  'soar': 2.3,
  'soared': 2.4,
  'soaring': 2.4,
  'rally': 2.1,
  'rallied': 2.2,
  'rallying': 2.1,
  'good': 1.9,
  'great': 2.6,
  'greater': 2.2,
  'greatest': 2.8,
  'excellent': 2.8,
  'fantastic': 2.7,
  'wonderful': 2.7,
  'fabulous': 2.6,
  'superb': 2.7,
  'exceptional': 2.7,
  'outstanding': 2.8,
  'beneficial': 2.2,
  'benefit': 2.0,
  'benefits': 2.1,
  'benefited': 2.0,
  'advantage': 2.0,
  'advantages': 2.1,
  'achieve': 2.1,
  'achieved': 2.2,
  'achievement': 2.4,
  'achievements': 2.4,
  'reward': 2.1,
  'rewarding': 2.3,
  'rewards': 2.1,
  'optimistic': 2.3,
  'optimism': 2.4,
  'happy': 2.5,
  'happiness': 2.6,
  'joy': 2.7,
  'celebrate': 2.3,
  'celebrated': 2.4,
  'celebration': 2.5,
  'celebrating': 2.4,
  'safe': 2.0,
  'safety': 2.1,
  'secure': 2.0,
  'security': 1.7,
  'secured': 2.0,
  'relief': 2.1,
  'relieved': 2.2,
  'upbeat': 2.2,
  'bullish': 2.3,
  'praise': 2.3,
  'praised': 2.4,
  'applaud': 2.3,
  'applauded': 2.4,
  'champion': 2.4,
  'champions': 2.4,
  'honor': 2.2,
  'honored': 2.3,
  'noble': 2.1,
  'hope': 1.9,
  'hopeful': 2.1,
  'hopes': 1.8,
  'friendly': 2.0,
  'friendship': 2.2,
  'alliance': 1.9,
  'agreement': 1.8,
  'agreed': 1.7,
  'deal': 1.6,
  'solution': 2.0,
  'solutions': 2.0,
  'resolve': 1.9,
  'resolved': 2.0,
  'stability': 2.0,
  'stable': 1.8,
  'confidence': 2.1,
  'confident': 2.0,
  'efficient': 2.1,
  'efficiency': 2.2,
  'vital': 1.8,
  'flourish': 2.4,
  'flourishing': 2.5,

  // Negative Valences (-1.0 to -3.8)
  'severe': -2.1,
  'severely': -2.2,
  'flooding': -1.9,
  'flood': -1.8,
  'floods': -1.8,
  'damage': -2.2,
  'damages': -2.2,
  'damaged': -2.1,
  'damaging': -2.3,
  'loss': -2.0,
  'losses': -2.1,
  'lost': -1.8,
  'losing': -1.9,
  'loser': -2.0,
  'disaster': -2.8,
  'disastrous': -2.9,
  'catastrophe': -3.0,
  'catastrophic': -3.1,
  'crisis': -2.6,
  'crises': -2.6,
  'threat': -2.2,
  'threats': -2.2,
  'threaten': -2.1,
  'threatened': -2.2,
  'threatening': -2.3,
  'crash': -2.5,
  'crashed': -2.5,
  'crashing': -2.6,
  'plunge': -2.3,
  'plunged': -2.4,
  'plunging': -2.4,
  'collapse': -2.6,
  'collapsed': -2.7,
  'collapsing': -2.7,
  'unhappy': -2.2,
  'sad': -2.1,
  'tragic': -2.8,
  'tragedy': -2.9,
  'death': -2.7,
  'deaths': -2.8,
  'dead': -2.5,
  'fatal': -2.9,
  'fatalities': -3.0,
  'fatality': -2.9,
  'casualty': -2.6,
  'casualties': -2.7,
  'kill': -2.7,
  'killed': -2.8,
  'killing': -2.8,
  'kills': -2.7,
  'killer': -2.8,
  'attack': -2.3,
  'attacked': -2.4,
  'attacking': -2.4,
  'attacks': -2.3,
  'attacker': -2.4,
  'war': -2.8,
  'warfare': -2.8,
  'conflict': -2.0,
  'conflicts': -2.1,
  'bomb': -2.8,
  'bombed': -2.9,
  'bombing': -3.0,
  'bombs': -2.8,
  'terror': -3.1,
  'terrorism': -3.2,
  'terrorist': -3.2,
  'terrorists': -3.2,
  'fraud': -2.6,
  'fraudulent': -2.7,
  'scam': -2.5,
  'scams': -2.5,
  'scandal': -2.4,
  'scandals': -2.4,
  'corrupt': -2.6,
  'corruption': -2.7,
  'fail': -2.1,
  'failed': -2.2,
  'failure': -2.3,
  'failures': -2.3,
  'failing': -2.2,
  'ruin': -2.4,
  'ruined': -2.5,
  'ruining': -2.5,
  'destruction': -2.7,
  'destructive': -2.8,
  'destroy': -2.6,
  'destroyed': -2.7,
  'destroying': -2.7,
  'violence': -2.6,
  'violent': -2.7,
  'victim': -2.2,
  'victims': -2.3,
  'wound': -2.1,
  'wounded': -2.2,
  'wounds': -2.1,
  'strike': -1.8,
  'strikes': -1.8,
  'protest': -1.6,
  'protests': -1.7,
  'protesting': -1.7,
  'hostage': -2.8,
  'hostages': -2.9,
  'hostile': -2.3,
  'hostility': -2.4,
  'recession': -2.5,
  'inflation': -1.8,
  'default': -1.9,
  'bankrupt': -2.7,
  'bankruptcy': -2.8,
  'deficit': -1.9,
  'drop': -1.5,
  'dropped': -1.6,
  'dropping': -1.6,
  'slump': -2.1,
  'slumped': -2.2,
  'bearish': -2.0,
  'fear': -2.2,
  'fears': -2.2,
  'feared': -2.1,
  'fearing': -2.2,
  'fearful': -2.3,
  'dread': -2.4,
  'dreadful': -2.6,
  'hazard': -2.1,
  'hazardous': -2.3,
  'toxic': -2.4,
  'poison': -2.6,
  'harm': -2.2,
  'harmful': -2.4,
  'harmed': -2.2,
  'bad': -2.5,
  'worse': -2.6,
  'worst': -3.0,
  'terrible': -2.8,
  'horrible': -2.8,
  'awful': -2.7,
  'poor': -1.9,
  'poverty': -2.3,
  'suffer': -2.2,
  'suffered': -2.3,
  'suffering': -2.4,
  'epidemic': -2.5,
  'pandemic': -2.6,
  'outbreak': -2.1,
  'disease': -2.2,
  'diseases': -2.2,
  'illness': -2.0,
  'outcry': -2.1,
  'condemn': -2.3,
  'condemned': -2.4,
  'condemnation': -2.4,
  'criticize': -1.9,
  'criticized': -2.0,
  'criticism': -2.0,
  'danger': -2.3,
  'dangerous': -2.4,
  'arrest': -1.8,
  'arrested': -1.9,
  'arrests': -1.8,
  'guilty': -2.2,
  'crime': -2.4,
  'crimes': -2.4,
  'criminal': -2.5,
  'illegal': -2.1,
  'lawsuit': -1.8,
  'sued': -1.8,
  'warning': -1.7,
  'warned': -1.7,
  'warns': -1.7,
  'chaos': -2.5,
  'dispute': -1.7,
  'disputes': -1.7,
  'turmoil': -2.4,
  'panic': -2.5,
};

// Modifiers: Amplifiers and Dampeners
const BOOSTER_WORDS: Record<string, number> = {
  'very': SENTIMENT_THRESHOLDS.BOOSTER_INCREMENT,
  'really': SENTIMENT_THRESHOLDS.BOOSTER_INCREMENT,
  'extremely': SENTIMENT_THRESHOLDS.BOOSTER_INCREMENT * 1.3,
  'substantially': SENTIMENT_THRESHOLDS.BOOSTER_INCREMENT,
  'hugely': SENTIMENT_THRESHOLDS.BOOSTER_INCREMENT * 1.2,
  'massively': SENTIMENT_THRESHOLDS.BOOSTER_INCREMENT * 1.2,
  'exceptionally': SENTIMENT_THRESHOLDS.BOOSTER_INCREMENT * 1.3,
  'significantly': SENTIMENT_THRESHOLDS.BOOSTER_INCREMENT,
  'remarkably': SENTIMENT_THRESHOLDS.BOOSTER_INCREMENT,
  'deeply': SENTIMENT_THRESHOLDS.BOOSTER_INCREMENT,
  'highly': SENTIMENT_THRESHOLDS.BOOSTER_INCREMENT,
  'intensely': SENTIMENT_THRESHOLDS.BOOSTER_INCREMENT,
  'drastically': SENTIMENT_THRESHOLDS.BOOSTER_INCREMENT * 1.2,
  'enormously': SENTIMENT_THRESHOLDS.BOOSTER_INCREMENT * 1.2,
  'tremendously': SENTIMENT_THRESHOLDS.BOOSTER_INCREMENT * 1.2,
  'incredibly': SENTIMENT_THRESHOLDS.BOOSTER_INCREMENT * 1.2,
  'totally': SENTIMENT_THRESHOLDS.BOOSTER_INCREMENT,
  'completely': SENTIMENT_THRESHOLDS.BOOSTER_INCREMENT,
  'absolutely': SENTIMENT_THRESHOLDS.BOOSTER_INCREMENT,
  'decidedly': SENTIMENT_THRESHOLDS.BOOSTER_INCREMENT,
  // Dampeners
  'hardly': SENTIMENT_THRESHOLDS.DAMPENER_DECREMENT,
  'barely': SENTIMENT_THRESHOLDS.DAMPENER_DECREMENT,
  'slightly': SENTIMENT_THRESHOLDS.DAMPENER_DECREMENT,
  'somewhat': SENTIMENT_THRESHOLDS.DAMPENER_DECREMENT,
  'mildly': SENTIMENT_THRESHOLDS.DAMPENER_DECREMENT,
  'little': SENTIMENT_THRESHOLDS.DAMPENER_DECREMENT,
  'partially': SENTIMENT_THRESHOLDS.DAMPENER_DECREMENT,
  'marginally': SENTIMENT_THRESHOLDS.DAMPENER_DECREMENT,
};

// Negator Tokens
const NEGATORS = new Set([
  'not',
  'no',
  'never',
  'none',
  'neither',
  'nor',
  'hardly',
  'scarcely',
  'barely',
  'seldom',
  'rarely',
  'without',
  'cannot',
  'cant',
  "can't",
  "don't",
  'dont',
  "doesn't",
  'doesnt',
  "didn't",
  'didnt',
  "won't",
  'wont',
  "wouldn't",
  'wouldnt',
  "shouldn't",
  'shouldnt',
  "couldn't",
  'couldnt',
  "isn't",
  'isnt',
  "aren't",
  'arent',
  "wasn't",
  'wasnt',
  "weren't",
  'werent',
  "haven't",
  'havent',
  "hasn't",
  'hasnt',
  "hadn't",
  'hadnt',
]);

/**
 * Clean and normalize text:
 * 1. Decodes HTML entities (&amp;, &quot;, &#39;, &lt;, &gt;, &nbsp;)
 * 2. Strips HTML markup (<p>, <a>, etc.)
 * 3. Normalizes smart quotes and unicode hyphens
 * 4. Preserves sentiment-bearing punctuation (! and ?)
 */
export function preprocessText(text: string): string {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/<[^>]+>/g, ' '); // Strip HTML tags

  // Normalize Unicode smart punctuation
  cleaned = cleaned
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

/**
 * Tokenize text into words while tracking punctuation marks and original capitalization.
 */
interface TokenInfo {
  word: string;
  lower: string;
  isAllCaps: boolean;
  hasExclamation: boolean;
  hasQuestion: boolean;
}

function tokenize(text: string): { tokens: TokenInfo[]; docIsAllCaps: boolean } {
  // Check if document as a whole is ALL CAPS (to prevent over-boosting when headline is all-caps)
  const lettersOnly = text.replace(/[^a-zA-Z]/g, '');
  const docIsAllCaps = lettersOnly.length > 5 && lettersOnly === lettersOnly.toUpperCase();

  const rawWords = text.split(/\s+/);
  const tokens: TokenInfo[] = [];

  for (const raw of rawWords) {
    if (!raw) continue;
    const hasExclamation = raw.includes('!');
    const hasQuestion = raw.includes('?');

    // Strip trailing punctuation but preserve inner contractions (don't, aren't)
    const cleaned = raw.replace(/^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$/g, '');
    if (!cleaned) continue;

    const letters = cleaned.replace(/[^a-zA-Z]/g, '');
    const isAllCaps = letters.length > 1 && letters === letters.toUpperCase();

    tokens.push({
      word: cleaned,
      lower: cleaned.toLowerCase(),
      isAllCaps,
      hasExclamation,
      hasQuestion,
    });
  }

  return { tokens, docIsAllCaps };
}

/**
 * Score a single token in context using VADER valence lookup, booster words, and negation windows.
 */
function scoreTokenInContext(
  index: number,
  tokens: TokenInfo[],
  docIsAllCaps: boolean
): number {
  const current = tokens[index];
  const word = current.lower;

  // IMPORTANT REQUIREMENT:
  // "Do not classify an article as positive merely because it contains the word 'positive'."
  // "Do not classify an article as negative merely because it contains the word 'negative'."
  // In news contexts ("tested positive", "positive cases", "negative test"), these words are neutral descriptors.
  if (word === 'positive' || word === 'negative') {
    return 0;
  }

  let baseValence = VALENCE_LEXICON[word];
  if (baseValence === undefined) {
    return 0;
  }

  // ALL-CAPS boost: word is uppercase while document is mixed-case
  if (current.isAllCaps && !docIsAllCaps) {
    if (baseValence > 0) baseValence += SENTIMENT_THRESHOLDS.ALL_CAPS_BOOST;
    else if (baseValence < 0) baseValence -= SENTIMENT_THRESHOLDS.ALL_CAPS_BOOST;
  }

  // Check 1-3 preceding words for modifiers (amplifiers/dampeners) and negators
  let isNegated = false;
  let modifierSum = 0;

  const windowStart = Math.max(0, index - 3);
  for (let i = index - 1; i >= windowStart; i--) {
    const prev = tokens[i];
    const prevWord = prev.lower;

    // Check for negator
    if (NEGATORS.has(prevWord)) {
      isNegated = true;
      break;
    }

    // Check for modifier (amplifier / dampener)
    const boosterVal = BOOSTER_WORDS[prevWord];
    if (boosterVal !== undefined) {
      // Distance decay: closer words have higher weight
      const distance = index - i;
      const decay = distance === 1 ? 1.0 : distance === 2 ? 0.8 : 0.6;
      let boost = boosterVal * decay;
      if (prev.isAllCaps && !docIsAllCaps) {
        boost *= 1.25;
      }
      modifierSum += boost;
    }
  }

  let finalValence = baseValence;

  // Apply modifier
  if (finalValence > 0) {
    finalValence += modifierSum;
  } else if (finalValence < 0) {
    finalValence -= modifierSum;
  }

  // Apply negation
  if (isNegated) {
    finalValence = finalValence * SENTIMENT_THRESHOLDS.NEGATION_MULTIPLIER;
  }

  // Punctuation intensity
  if (current.hasExclamation) {
    if (finalValence > 0) finalValence += SENTIMENT_THRESHOLDS.EXCLAMATION_BOOST;
    else if (finalValence < 0) finalValence -= SENTIMENT_THRESHOLDS.EXCLAMATION_BOOST;
  }

  return finalValence;
}

/**
 * Core VADER Sentiment Scoring Engine
 * Computes compound score normalized between -1.0 and 1.0.
 */
export function scoreText(rawText: string): SentimentAnalysisResult {
  const cleanedText = preprocessText(rawText);

  if (!cleanedText || cleanedText.length === 0) {
    return {
      sentiment: 'Neutral',
      score: 0,
      status: 'failed',
      model: 'vader-rule-engine-v1',
      reason: 'No textual content provided for sentiment analysis',
      breakdown: {
        positiveSum: 0,
        negativeSum: 0,
        neutralCount: 0,
        compound: 0,
        tokensEvaluated: 0,
      },
    };
  }

  const { tokens, docIsAllCaps } = tokenize(cleanedText);

  if (tokens.length === 0) {
    return {
      sentiment: 'Neutral',
      score: 0,
      status: 'failed',
      model: 'vader-rule-engine-v1',
      reason: 'No valid word tokens found after preprocessing',
      breakdown: {
        positiveSum: 0,
        negativeSum: 0,
        neutralCount: 0,
        compound: 0,
        tokensEvaluated: 0,
      },
    };
  }

  let positiveSum = 0;
  let negativeSum = 0;
  let neutralCount = 0;
  let totalValence = 0;

  for (let i = 0; i < tokens.length; i++) {
    const valence = scoreTokenInContext(i, tokens, docIsAllCaps);
    if (valence > 0) {
      positiveSum += valence;
      totalValence += valence;
    } else if (valence < 0) {
      negativeSum += Math.abs(valence);
      totalValence += valence;
    } else {
      neutralCount++;
    }
  }

  // Standard VADER Compound Score Formula:
  // compound = sum_s / sqrt(sum_s^2 + alpha)
  const compound = totalValence === 0 
    ? 0 
    : totalValence / Math.sqrt((totalValence * totalValence) + SENTIMENT_THRESHOLDS.ALPHA_NORMALIZATION);

  // Clamp compound score to [-1.0, 1.0] and round to 4 decimals
  const roundedCompound = Math.max(-1.0, Math.min(1.0, +compound.toFixed(4)));

  let sentiment: Sentiment = 'Neutral';
  if (roundedCompound >= SENTIMENT_THRESHOLDS.POSITIVE) {
    sentiment = 'Positive';
  } else if (roundedCompound <= SENTIMENT_THRESHOLDS.NEGATIVE) {
    sentiment = 'Negative';
  } else {
    sentiment = 'Neutral';
  }

  return {
    sentiment,
    score: roundedCompound,
    status: 'success',
    model: 'vader-rule-engine-v1',
    breakdown: {
      positiveSum: +positiveSum.toFixed(3),
      negativeSum: +negativeSum.toFixed(3),
      neutralCount,
      compound: roundedCompound,
      tokensEvaluated: tokens.length,
    },
  };
}

/**
 * Analyze an article's headline, description, and content combined.
 * Gives 1.5x weight to headline/title since news headlines carry the strongest journalistic stance.
 */
export function analyzeArticleSentiment(article: {
  title?: string;
  description?: string;
  summary?: string;
  content?: string;
}): SentimentAnalysisResult {
  const title = article.title ? article.title.trim() : '';
  const desc = article.description || article.summary || '';
  const content = article.content || '';

  // If both title and description/content are empty, return explicit failure status
  if (!title && !desc && !content) {
    return {
      sentiment: 'Neutral',
      score: 0,
      status: 'failed',
      model: 'vader-rule-engine-v1',
      reason: 'Article title, description, and content are all missing',
      breakdown: {
        positiveSum: 0,
        negativeSum: 0,
        neutralCount: 0,
        compound: 0,
        tokensEvaluated: 0,
      },
    };
  }

  // Weight headline higher by repeating or prepending with punctuation boundary
  const combinedText = title 
    ? (desc && desc !== title ? `${title}. ${title}. ${desc} ${content}` : `${title}. ${title}. ${content}`)
    : `${desc} ${content}`;

  return scoreText(combinedText);
}

/**
 * Enriches a NewsItem object with deterministic local sentiment values.
 */
export function enrichArticleWithSentiment<T extends Partial<NewsItem>>(item: T): T & {
  sentiment: Sentiment;
  sentimentScore: number;
  sentimentStatus: 'success' | 'failed' | 'pending';
  sentimentModel: string;
  sentimentReason?: string;
} {
  const result = analyzeArticleSentiment({
    title: item.title,
    description: item.description,
    summary: item.summary,
  });

  return {
    ...item,
    sentiment: result.sentiment,
    sentimentScore: result.score,
    sentimentStatus: result.status,
    sentimentModel: result.model,
    sentimentReason: result.reason,
  };
}

/**
 * Reprocesses existing articles (in-memory or from database).
 * Tracks processed, successful, unchanged, and failed counts without corrupting timestamps or metadata.
 */
export function reprocessArticlesSentiment(
  articles: NewsItem[],
  options?: { forceRecompute?: boolean }
): { updatedArticles: NewsItem[]; stats: SentimentReprocessStats } {
  const startTime = performance.now();
  let processed = 0;
  let successful = 0;
  let unchanged = 0;
  let failed = 0;
  let positiveCount = 0;
  let neutralCount = 0;
  let negativeCount = 0;

  const updatedArticles = articles.map(art => {
    processed++;
    const res = analyzeArticleSentiment({
      title: art.title,
      description: art.description,
      summary: art.summary,
    });

    if (res.status === 'failed') {
      failed++;
    } else {
      successful++;
    }

    if (res.sentiment === 'Positive') positiveCount++;
    else if (res.sentiment === 'Negative') negativeCount++;
    else neutralCount++;

    const isSame = 
      art.sentiment === res.sentiment && 
      Math.abs((art.sentimentScore || 0) - res.score) < 0.05 &&
      art.sentimentStatus === res.status;

    if (isSame && !options?.forceRecompute) {
      unchanged++;
      return art;
    }

    return {
      ...art,
      sentiment: res.sentiment,
      sentimentScore: res.score,
      sentimentStatus: res.status,
      sentimentModel: res.model,
      sentimentReason: res.reason,
    };
  });

  const durationMs = Math.round(performance.now() - startTime);

  return {
    updatedArticles,
    stats: {
      totalEvaluated: articles.length,
      processed,
      successful,
      unchanged,
      failed,
      positiveCount,
      neutralCount,
      negativeCount,
      durationMs,
    },
  };
}
