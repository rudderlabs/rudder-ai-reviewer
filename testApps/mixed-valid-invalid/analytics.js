/**
 * Test app with mixed valid and invalid SDK usage
 */
import { RudderAnalytics } from '@rudderstack/analytics-js';

const analytics = new RudderAnalytics();

// VALID: Proper initialization
analytics.load(
  'YOUR_WRITE_KEY',
  'https://dataplane.rudderstack.com',
  {
    integrations: { All: true },
    logLevel: 'INFO',
  }
);

// VALID: Proper track call
analytics.track('user_signed_up', {
  user_id: 'user_123',
  email: 'user@example.com',
  plan: 'free',
  signup_date: new Date().toISOString(),
});

// VALID: Proper identify call
analytics.identify('user_123', {
  email: 'user@example.com',
  name: 'John Doe',
  age: 30,
  plan: 'free',
});

// ERROR: Missing event name
analytics.track();

// VALID: Page call
analytics.page('category', 'page_name', {
  url: window.location.href,
  referrer: document.referrer,
});

// WARNING: camelCase instead of snake_case
analytics.track('UserClickedButton', {
  buttonId: 'submit',
  timestamp: Date.now(),
});

// VALID: Group call
analytics.group('company_123', {
  name: 'Acme Corp',
  industry: 'Technology',
  employees: 50,
});

// ERROR: Wrong parameter type for properties
analytics.track('button_clicked', 'not an object');

// VALID: Alias call
analytics.alias('new_user_id_456');

// ERROR: Empty event name
analytics.track('', { prop: 'value' });

// VALID: Ready callback
analytics.ready(() => {
  console.log('RudderStack SDK ready');
});

// WARNING: Missing properties (should include some context)
analytics.track('conversion_completed');

// VALID: Reset call
analytics.reset();

// ERROR: Too many arguments
analytics.track('event', { prop: 'value' }, { extra: 'param' }, 'another', 'yet_another');

// VALID: Get anonymous ID
const anonId = analytics.getAnonymousId();
console.log('Anonymous ID:', anonId);

// VALID: Set anonymous ID
analytics.setAnonymousId('custom_anon_id_789');

export default analytics;
