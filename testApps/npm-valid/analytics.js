import { RudderAnalytics } from '@rudderstack/analytics-js';

// Initialize SDK - Test app for PR reviewer action
const rudderanalytics = new RudderAnalytics();
rudderanalytics.load('WRITE_KEY', 'https://dataplane.rudderstack.com', {
  integrations: { All: true },
});

// Valid track calls
rudderanalytics.track('button_clicked', {
  button_id: 'signup',
  page: 'home',
});

rudderanalytics.track('page_viewed', {
  page_name: 'home',
  referrer: 'google',
});

// Valid identify call
rudderanalytics.identify('user123', {
  email: 'user@example.com',
  name: 'John Doe',
  plan: 'premium',
});

// Valid page call
rudderanalytics.page('Home', {
  title: 'Home Page',
  url: '/home',
});

// Valid group call
rudderanalytics.group('company123', {
  name: 'Acme Corp',
  industry: 'Technology',
});

// Valid alias call
rudderanalytics.alias('new-user-id');

// Valid ready callback
rudderanalytics.ready(() => {
  console.log('RudderStack SDK is ready');
});
