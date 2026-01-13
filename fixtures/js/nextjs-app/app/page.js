'use client';

import { useState, useEffect } from 'react';
import { trackEvent, identifyUser, trackPageView } from '../lib/analytics';

export default function Home() {
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    trackPageView('app', 'home', {
      source: 'nextjs_app',
      route: '/',
    });
  }, []);

  const handleSignup = () => {
    if (userId && email) {
      identifyUser(userId, {
        email: email,
        signup_date: new Date().toISOString(),
        plan: 'free',
        source: 'website',
      });

      trackEvent('user_signed_up', {
        user_id: userId,
        method: 'email',
        plan: 'free',
        timestamp: Date.now(),
      });
    }
  };

  const handleProductView = (productId) => {
    trackEvent('product_viewed', {
      product_id: productId,
      category: 'electronics',
      price: 299.99,
      currency: 'USD',
    });
  };

  const handleInvalidTrack = () => {
    trackEvent();
  };

  const handleInvalidProperties = () => {
    trackEvent('click_event', 'not an object');
  };

  const handleWarningCase = () => {
    trackEvent('UserClickedButton', {
      buttonId: 'submit',
    });
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>RudderStack Next.js Test App</h1>

      <div style={{ marginBottom: '20px' }}>
        <h2>Valid Usage</h2>
        <input
          type="text"
          placeholder="User ID"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          style={{ marginRight: '10px' }}
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ marginRight: '10px' }}
        />
        <button onClick={handleSignup}>Sign Up</button>
        <button onClick={() => handleProductView('prod_123')} style={{ marginLeft: '10px' }}>
          View Product
        </button>
      </div>

      <div>
        <h2>Invalid Usage (for testing)</h2>
        <button onClick={handleInvalidTrack}>Invalid Track (no event name)</button>
        <button onClick={handleInvalidProperties} style={{ marginLeft: '10px' }}>
          Invalid Track (wrong properties type)
        </button>
        <button onClick={handleWarningCase} style={{ marginLeft: '10px' }}>
          Warning Case (camelCase event)
        </button>
      </div>
    </div>
  );
}
