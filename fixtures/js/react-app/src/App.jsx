import React, { useEffect, useState } from 'react';
import { initializeAnalytics, trackEvent, identifyUser, trackPageView } from './analytics';

function App() {
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    // Initialize analytics on mount
    initializeAnalytics();
    trackPageView('app', 'home', { source: 'react_app' });
  }, []);

  const handleLogin = () => {
    if (userId && email) {
      // Identify user
      identifyUser(userId, {
        email: email,
        signup_date: new Date().toISOString(),
        plan: 'free',
      });

      // Track login event
      trackEvent('user_logged_in', {
        user_id: userId,
        method: 'email',
        timestamp: Date.now(),
      });
    }
  };

  const handleButtonClick = (buttonName) => {
    trackEvent('button_clicked', {
      button_name: buttonName,
      page: 'home',
    });
  };

  const handleInvalidCall = () => {
    // ERROR: Missing event name
    trackEvent();
  };

  const handleInvalidIdentify = () => {
    // WARNING: Missing traits
    identifyUser('user123');
  };

  return (
    <div className="App">
      <h1>RudderStack React Test App</h1>

      <div>
        <h2>Valid Usage</h2>
        <input
          type="text"
          placeholder="User ID"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button onClick={handleLogin}>Login</button>
        <button onClick={() => handleButtonClick('cta_primary')}>
          Track Button Click
        </button>
      </div>

      <div>
        <h2>Invalid Usage (for testing)</h2>
        <button onClick={handleInvalidCall}>Invalid Track Call</button>
        <button onClick={handleInvalidIdentify}>Invalid Identify Call</button>
      </div>
    </div>
  );
}

export default App;
