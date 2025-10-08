/**
 * RudderStack Analytics Service
 * Test app for PR reviewer action
 */
import { RudderAnalytics } from '@rudderstack/analytics-js';

const analytics = new RudderAnalytics();

export const initializeAnalytics = () => {
  analytics.load(
    'YOUR_WRITE_KEY',
    'https://dataplane.rudderstack.com',
    {
      integrations: { All: true },
      logLevel: 'INFO',
    }
  );
};

export const trackEvent = (eventName, properties = {}) => {
  analytics.track(eventName, properties);
};

export const identifyUser = (userId, traits = {}) => {
  analytics.identify(userId, traits);
};

export const trackPageView = (category, name, properties = {}) => {
  analytics.page(category, name, properties);
};

export default analytics;
