import { Router, KalibrIntelligence, FAILURE_CATEGORIES, newTraceId } from './src/index';

console.log('FAILURE_CATEGORIES:', FAILURE_CATEGORIES);

const apiKey = process.env['KALIBR_API_KEY'];
const tenantId = process.env['KALIBR_TENANT_ID'];

if (!apiKey || !tenantId) {
  console.error('KALIBR_API_KEY and KALIBR_TENANT_ID must be set');
  process.exit(1);
}

KalibrIntelligence.init({ apiKey, tenantId });

const router = new Router({
  goal: 'smoke_test',
  paths: ['gpt-4o', 'claude-sonnet-4-20250514'],
});

// Set a trace ID so report() reaches the validation logic
(router as any).lastTraceId = newTraceId();

async function main() {
  const result = await router.report(false, 'test failure', 0.1, 'timeout');
  console.log('report result:', result);

  // Reset so the second report() also reaches validation
  (router as any).outcomeReported = false;

  try {
    await router.report(false, 'bad category', 0.1, 'invalid_category');
  } catch (err: any) {
    console.log('error message:', err.message);
  }
}

main();
