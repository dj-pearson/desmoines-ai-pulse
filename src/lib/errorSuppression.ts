// Error suppression utilities to reduce console noise from external libraries

// Suppress common SES warnings from browser extensions
export const suppressSESWarnings = () => {
  if (typeof window !== 'undefined') {
    // Override console methods to filter out SES warnings
    const originalWarn = console.warn;
    const originalError = console.error;
    
    console.warn = (...args: any[]) => {
      const message = args.join(' ');
      // Suppress SES deprecation warnings
      if (message.includes('dateTaming') || 
          message.includes('mathTaming') || 
          message.includes('SES_UNCAUGHT_EXCEPTION')) {
        return;
      }
      originalWarn.apply(console, args);
    };
    
    console.error = (...args: any[]) => {
      const message = args.join(' ');
      // Suppress SES-related errors that don't affect functionality
      if (message.includes('SES_UNCAUGHT_EXCEPTION') || 
          message.includes('lockdown-install.js')) {
        return;
      }
      originalError.apply(console, args);
    };
  }
};

// Initialize error suppression on load
export const initializeErrorSuppression = () => {
  suppressSESWarnings();
  
  // Handle Google Analytics loading failures gracefully
  window.addEventListener('error', (event) => {
    if (event.target && 
        (event.target as HTMLElement).tagName === 'SCRIPT' && 
        (event.target as HTMLScriptElement).src.includes('googletagmanager.com')) {
      // Suppress Google Analytics loading errors
      event.preventDefault();
      console.warn('Google Analytics failed to load - continuing without analytics');
    }
  });
};