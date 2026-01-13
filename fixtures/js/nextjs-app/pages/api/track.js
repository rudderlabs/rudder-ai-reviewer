
import { RudderAnalytics } from '@rudderstack/analytics-js';

export default function handler(req, res) {
  const analytics = new RudderAnalytics();

  analytics.load('YOUR_WRITE_KEY', 'https://dataplane.rudderstack.com');

  analytics.track('api_called', {
    method: req.method,
    path: req.url,
  });

  res.status(200).json({ success: true });
}
