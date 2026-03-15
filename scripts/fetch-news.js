const fs = require('fs');
const path = require('path');
const Parser = require('rss-parser');

const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8'
  },
  timeout: 10000
});

const FEEDS_PATH = path.join(__dirname, '..', 'data', 'feeds.json');

const AI_SUMMARIES_ENABLED = process.env.AI_SUMMARIES_ENABLED === 'true';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

let openai = null;

function getOpenAIClient() {
  if (!AI_SUMMARIES_ENABLED) {
    return null;
  }

  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  if (!openai) {
    try {
      const OpenAI = require('openai');
      openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    } catch (error) {
      console.warn('[ai] openai package not installed. AI summaries remain disabled.');
      return null;
    }
  }

  return openai;
}

const MAX_STORIES = 15;
const STORIES_PER_FEED = 15;

const EXCLUDED_KEYWORDS = [
  'celebrity',
  'celebrities',
  'entertainment',
  'movie',
  'movies',
  'tv',
  'television',
  'actor',
  'actress',
  'hollywood',
  'music',
  'album',
  'red carpet',
  'fashion',
  'royal',
  'royals',
  'sports',
  'football',
  'basketball',
  'baseball',
  'soccer',
  'hockey',
  'golf',
  'tennis',
  'nfl',
  'nba',
  'mlb',
  'nhl',
  'premier league',
  'olympics',
  'lifestyle',
  'shopping',
  'travel',
  'recipe',
  'recipes',
  'food',
  'wellness',
  'style',
  'beauty',
  'podcast'
];

const CLUSTER_STOPWORDS = new Set([
  'about', 'after', 'amid', 'among', 'around', 'because', 'before', 'being', 'between', 'could',
  'first', 'from', 'into', 'more', 'most', 'over', 'said', 'says', 'than', 'that', 'their',
  'there', 'these', 'they', 'this', 'through', 'under', 'when', 'where', 'which', 'while',
  'with', 'would', 'have', 'has', 'had', 'will', 'were', 'been', 'also', 'just', 'news'
]);

function normalizeTitle(title = '') {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanSummary(text = '') {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function buildClusterKey(story) {
  const title = normalizeTitle(story.title || '');
  const words = title
    .split(' ')
    .filter(word => word.length > 2)
    .filter(word => !CLUSTER_STOPWORDS.has(word));

  const uniqueWords = [...new Set(words)];
  return uniqueWords.slice(0, 10).join(' ');
}

function getClusterTerms(story) {
  const clusterKey = buildClusterKey(story);
  if (!clusterKey) {
    return [];
  }

  return clusterKey.split(' ').filter(Boolean);
}

function getClusterOverlapScore(storyA, storyB) {
  const termsA = getClusterTerms(storyA);
  const termsB = new Set(getClusterTerms(storyB));

  if (!termsA.length || !termsB.size) {
    return 0;
  }

  let overlap = 0;

  for (const term of termsA) {
    if (termsB.has(term)) {
      overlap += 1;
    }
  }

  return overlap;
}

function buildWhyItMatters({ title = '', category = '', summary = '' }) {
  const haystack = `${title} ${summary}`.toLowerCase();

  if (/(supreme court|court|judge|legal|lawsuit|ruling)/.test(haystack)) {
    return 'This could shape legal precedent, policy enforcement, or how similar disputes are handled next.';
  }

  if (/(election|vote|voter|campaign|primary|congress|senate|house|white house|trump|biden)/.test(haystack)) {
    return 'This matters because it could affect elections, legislation, or the broader national political climate.';
  }

  if (/(tariff|inflation|economy|economic|jobs|labor|trade|market|markets|stocks|prices|recession)/.test(haystack)) {
    return 'This could influence prices, jobs, markets, or the broader direction of the economy.';
  }

  if (/(ai|artificial intelligence|chip|chips|semiconductor|technology|tech|cyber|software|platform)/.test(haystack)) {
    return 'This matters because technology decisions increasingly shape business, policy, and everyday life.';
  }

  if (/(ukraine|russia|china|israel|gaza|iran|nato|war|missile|military|diplomatic|diplomacy)/.test(haystack)) {
    return 'This could affect international stability, security calculations, and the direction of global diplomacy.';
  }

  if (category === 'Politics') {
    return 'This matters because it may influence legislation, executive action, or the national political mood.';
  }

  if (category === 'Tech') {
    return 'This could shape how quickly new technology is adopted and how it affects business and daily life.';
  }

  if (category === 'U.S.') {
    return 'This matters because it may affect national policy, public life, or how major institutions respond next.';
  }

  if (category === 'World') {
    return 'This could influence global stability, diplomacy, or economic conditions beyond a single country.';
  }

  return 'This matters because it could influence public life, policy decisions, or what developments come next.';
}

function buildWatchLine({ title = '', category = '', summary = '' }) {
  const haystack = `${title} ${summary}`.toLowerCase();

  if (/(supreme court|court|judge|legal|lawsuit|ruling)/.test(haystack)) {
    return 'Watch for upcoming rulings, appeals, or how lower courts and agencies respond next.';
  }

  if (/(election|vote|voter|campaign|primary|congress|senate|house|white house|trump|biden)/.test(haystack)) {
    return 'Watch for polling shifts, legislative movement, campaign reactions, or the next public response from key officials.';
  }

  if (/(tariff|inflation|economy|economic|jobs|labor|trade|market|markets|stocks|prices|recession)/.test(haystack)) {
    return 'Watch for market reaction, policy responses, and whether the economic effects become more visible in coming weeks.';
  }

  if (/(ai|artificial intelligence|chip|chips|semiconductor|technology|tech|cyber|software|platform)/.test(haystack)) {
    return 'Watch for competitor responses, regulatory attention, and signs of broader adoption or pushback.';
  }

  if (/(ukraine|russia|china|israel|gaza|iran|nato|war|missile|military|diplomatic|diplomacy)/.test(haystack)) {
    return 'Watch for retaliation, diplomatic statements, and whether allies or major powers shift their posture.';
  }

  if (category === 'Politics') {
    return 'Watch for the next policy move, official statement, or signs that this issue is gaining political momentum.';
  }

  if (category === 'Tech') {
    return 'Watch for rollout details, rival announcements, and whether regulators or major platforms respond.';
  }

  if (category === 'U.S.') {
    return 'Watch for how major institutions, state officials, or federal agencies respond as the story develops.';
  }

  if (category === 'World') {
    return 'Watch for follow-up moves from governments, international organizations, and any broader regional effects.';
  }

  return 'Watch for follow-up reporting, official responses, and whether this develops into a larger story.';
}

function shouldExcludeStory(story) {
  const haystack = `${story.title} ${story.what}`.toLowerCase();
  return EXCLUDED_KEYWORDS.some(keyword => haystack.includes(keyword));
}

function getFeeds() {
  try {
    const raw = fs.readFileSync(FEEDS_PATH, 'utf8');
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error('feeds.json must contain an array of feed objects.');
    }

    return parsed.filter(feed => feed && feed.name && feed.url && feed.category);
  } catch (error) {
    console.error('Failed to load feeds.json:', error.message);
    return [];
  }
}


async function summarizeStoryWithAI({ title = '', category = '', summary = '' }) {
  const client = getOpenAIClient();
  if (!client) {
    return null;
  }

  try {
    const prompt = `You are writing a calm personal news briefing.
Return strict JSON only with keys: what, why, watch.
Each value must be a single sentence.
Avoid hype, avoid speculation, and stay grounded in the provided information.

Headline: ${title}
Category: ${category}
Context: ${summary}`;

    const response = await client.responses.create({
      model: OPENAI_MODEL,
      input: prompt
    });

    const text = (response.output_text || '').trim();
    if (!text) {
      return null;
    }

    const parsed = JSON.parse(text);

    if (!parsed || !parsed.what || !parsed.why || !parsed.watch) {
      return null;
    }

    return {
      what: cleanSummary(parsed.what),
      why: cleanSummary(parsed.why),
      watch: cleanSummary(parsed.watch)
    };
  } catch (error) {
    console.error(`[ai] Failed to summarize "${title}":`, error.message);
    return null;
  }
}

async function buildStory(item, fallbackCategory) {
  const title = item.title || 'Untitled story';
  const what = cleanSummary(item.contentSnippet || item.content || item.summary || 'Summary not available yet.');

  const fallbackStory = {
    title,
    category: fallbackCategory,
    what,
    why: buildWhyItMatters({ title, category: fallbackCategory, summary: what }),
    watch: buildWatchLine({ title, category: fallbackCategory, summary: what }),
    source: item.link || ''
  };

  const aiSummary = await summarizeStoryWithAI({
    title,
    category: fallbackCategory,
    summary: what
  });

  if (!aiSummary) {
    return fallbackStory;
  }

  return {
    ...fallbackStory,
    what: aiSummary.what,
    why: aiSummary.why,
    watch: aiSummary.watch
  };
}

async function fetchFeed(feed) {
  try {
    const parsed = await parser.parseURL(feed.url);

    const items = await Promise.all(
      (parsed.items || [])
        .slice(0, STORIES_PER_FEED)
        .map(async item => ({
          ...(await buildStory(item, feed.category)),
          sources: item.link
            ? [{ name: feed.name, url: item.link }]
            : [{ name: feed.name, url: '' }],
          _sourceName: feed.name,
          _publishedAt: item.isoDate || item.pubDate || ''
        }))
    );

    console.log(`[feed] ${feed.name}: fetched ${items.length} item(s)`);
    return items;
  } catch (error) {
    console.error(`Failed to fetch ${feed.name}:`, error.message);
    console.error(`[feed] ${feed.name}: returning 0 items`);
    return [];
  }
}

function mergeSources(existingSources = [], incomingSources = []) {
  const merged = [...existingSources];

  for (const source of incomingSources) {
    const alreadyExists = merged.some(existing => {
      const sameName = existing.name === source.name;
      const sameUrl = existing.url && source.url && existing.url === source.url;
      return sameName || sameUrl;
    });

    if (!alreadyExists) {
      merged.push(source);
    }
  }

  return merged;
}

async function main() {
  const allStories = [];

  const feeds = getFeeds();

  if (!feeds.length) {
    console.error('No feeds available. Add feed objects to data/feeds.json first.');
    process.exit(1);
  }

  for (const feed of feeds) {
    const stories = await fetchFeed(feed);
    allStories.push(...stories);
  }

  console.log(`[build] total fetched stories before dedupe: ${allStories.length}`);

  const clusteredStories = [];

  for (const story of allStories) {
    let matchedIndex = -1;

    for (let i = 0; i < clusteredStories.length; i += 1) {
      const existingStory = clusteredStories[i];
      const overlapScore = getClusterOverlapScore(existingStory, story);

      if (overlapScore >= 3) {
        matchedIndex = i;
        break;
      }
    }

    if (matchedIndex === -1) {
      clusteredStories.push(story);
      continue;
    }

    const existingStory = clusteredStories[matchedIndex];
    const existingTime = existingStory._publishedAt ? new Date(existingStory._publishedAt).getTime() : 0;
    const currentTime = story._publishedAt ? new Date(story._publishedAt).getTime() : 0;
    const mergedSources = mergeSources(existingStory.sources || [], story.sources || []);

    if (currentTime > existingTime) {
      clusteredStories[matchedIndex] = {
        ...story,
        sources: mergedSources
      };
    } else {
      clusteredStories[matchedIndex] = {
        ...existingStory,
        sources: mergedSources
      };
    }
  }

  const uniqueStories = clusteredStories;

  console.log(`[build] unique stories after dedupe: ${uniqueStories.length}`);
  console.log(`[build] clustered stories from raw intake: ${allStories.length} -> ${uniqueStories.length}`);
  console.log('[build] clustering now merges stories when 3 or more meaningful title terms overlap.');

  const filteredStories = uniqueStories.filter(story => {
    if (shouldExcludeStory(story)) {
      return false;
    }

    const title = (story.title || '').toLowerCase();
    const summary = (story.what || '').toLowerCase();

    if (
      story.category === 'General' &&
      !/(war|trump|biden|congress|senate|house|election|economy|tariff|china|russia|ukraine|israel|gaza|ai|technology|court|supreme court|policy|government)/.test(`${title} ${summary}`)
    ) {
      return false;
    }

    return true;
  });

  console.log(`[build] stories after exclusions: ${filteredStories.length}`);

  filteredStories.sort((a, b) => {
    const aTime = a._publishedAt ? new Date(a._publishedAt).getTime() : 0;
    const bTime = b._publishedAt ? new Date(b._publishedAt).getTime() : 0;
    return bTime - aTime;
  });

  const categoryLimits = {
    World: 5,
    'U.S.': 4,
    Politics: 3,
    Tech: 3,
    General: 2
  };

  const categoryCounts = {};
  const balancedStories = [];

  for (const story of filteredStories) {
    const category = story.category || 'General';
    const limit = categoryLimits[category] ?? 2;
    const currentCount = categoryCounts[category] || 0;

    if (currentCount >= limit) {
      continue;
    }

    categoryCounts[category] = currentCount + 1;
    balancedStories.push(story);
  }

  console.log(`[build] stories after category balancing: ${balancedStories.length}`);

  const finalStories = balancedStories.slice(0, MAX_STORIES).map(story => ({
    title: story.title,
    category: story.category,
    what: story.what,
    why: story.why,
    watch: story.watch,
    source: story.source,
    sources: story.sources || []
  }));

  console.log(`[build] final stories written: ${finalStories.length}`);

  const today = new Date();
  const formattedDate = today.toLocaleDateString('en-CA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const output = {
    date: formattedDate,
    stories: finalStories
  };

  const outputPath = path.join(__dirname, '..', 'public', 'daily.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`Wrote ${finalStories.length} stories to ${outputPath}`);
}

// AI summaries are patched in but disabled by default.
// To enable them later:
// 1. npm install openai
// 2. export OPENAI_API_KEY="your-key"
// 3. export AI_SUMMARIES_ENABLED=true
// 4. optionally export OPENAI_MODEL="gpt-4.1-mini"

main().catch(error => {
  console.error('Failed to build daily brief:', error);
  process.exit(1);
});