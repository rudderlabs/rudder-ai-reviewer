/**
 * RudderStack Analytics for Next.js
 * Client-side only
 */
import { RudderAnalytics } from '@rudderstack/analytics-js';

let analytics = null;

export const initializeAnalytics = () => {
  if (typeof window !== 'undefined' && !analytics) {
    analytics = new RudderAnalytics();
    analytics.load(
      'YOUR_WRITE_KEY',
      'https://dataplane.rudderstack.com',
      {
        integrations: { All: true },
        logLevel: 'INFO',
      }
    );
  }
  return analytics;
};

export const getAnalytics = () => {
  if (!analytics && typeof window !== 'undefined') {
    return initializeAnalytics();
  }
  return analytics;
};

export const trackEvent = (eventName, properties = {}) => {
  const rudder = getAnalytics();
  if (rudder) {
    rudder.track(eventName, properties);
  }
};

export const identifyUser = (userId, traits = {}) => {
  const rudder = getAnalytics();
  if (rudder) {
    rudder.identify(userId, traits);
  }
};

export const trackPageView = (category, name, properties = {}) => {
  const rudder = getAnalytics();
  if (rudder) {
    rudder.page(category, name, properties);
  }
};
