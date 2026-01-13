'use client';

import { useEffect } from 'react';
import { initializeAnalytics } from '../lib/analytics';

export default function RootLayout({ children }) {
  useEffect(() => {
    initializeAnalytics();
  }, []);

  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
