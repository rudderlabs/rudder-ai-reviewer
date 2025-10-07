/**
 * Server-side API route (Pages Router)
 * WARNING: RudderStack SDK is client-side only, should not be used in API routes
 */

// This is an anti-pattern example
import { RudderAnalytics } from '@rudderstack/analytics-js';

export default function handler(req, res) {
  // ERROR: Trying to use client-side SDK in Node.js server environment
  const analytics = new RudderAnalytics();

  analytics.load('YOUR_WRITE_KEY', 'https://dataplane.rudderstack.com');

  analytics.track('api_called', {
    method: req.method,
    path: req.url,
  });

  res.status(200).json({ success: true });
}
