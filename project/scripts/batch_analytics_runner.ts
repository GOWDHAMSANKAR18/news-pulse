import { generateSyntheticVolumeBatch } from '../src/lib/pipeline/volumeSimulator';
import { extractTfidfKeywords, clusterNewsEvents } from '../src/lib/pipeline/nlpAnalytics';

console.log('Ingesting 1,000 synthetic records for offline batch computation...');
const batch = generateSyntheticVolumeBatch(1000);
console.log('Batch Ingestion Execution Time:', batch.executionTimeMs, 'ms');
console.log('Total Storage Occupied:', batch.storageKb, 'KB');

const keywords = extractTfidfKeywords(batch.items, 5);
console.log('\nTop TF-IDF Keywords Extracted:');
console.table(keywords);

const clusters = clusterNewsEvents(batch.items);
console.log('\nNLP Event Clusters Computed:', clusters.length);
console.log('Batch analytics completed successfully.');
