import { RudderAnalytics } from '@rudderstack/analytics-js';

// Test app for PR reviewer action
const rudderanalytics = new RudderAnalytics();

// ERROR: Missing required parameters for load()
rudderanalytics.load();

// ERROR: Missing required event name
rudderanalytics.track();

// ERROR: Empty event name
rudderanalytics.track('');

// ERROR: Wrong parameter type (number instead of string)
rudderanalytics.track(123, { prop: 'value' });

// WARNING: No properties provided (should suggest adding them)
rudderanalytics.track('user_signup');

// ERROR: Properties should be an object, not a string
rudderanalytics.track('button_clicked', 'not an object');

// WARNING: Event name not following snake_case convention
rudderanalytics.track('ButtonClicked', { id: '123' });

// WARNING: identify() called without userId or traits
rudderanalytics.identify();

// ERROR: Traits should be an object
rudderanalytics.identify('user123', 'not an object');

// ERROR: Too many arguments
rudderanalytics.track('event', {}, {}, () => {}, 'extra_arg');

// WARNING: Hardcoded write key (security issue)
rudderanalytics.load('1234567890abcdef', 'https://dataplane.rudderstack.com');

// ERROR: Invalid data plane URL (missing protocol)
rudderanalytics.load('WRITE_KEY', 'dataplane.rudderstack.com');

// ERROR: Group requires groupId
rudderanalytics.group();

// ERROR: Alias requires new user ID
rudderanalytics.alias();

// ERROR: Ready requires callback function
rudderanalytics.ready();
