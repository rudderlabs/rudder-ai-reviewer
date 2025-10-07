// Simple app with no RudderStack SDK

function initialize() {
  console.log('App initialized');
}

function trackEvent(eventName, properties) {
  // Custom tracking implementation without RudderStack
  console.log('Event tracked:', eventName, properties);
}

initialize();
trackEvent('page_view', { page: 'home' });
