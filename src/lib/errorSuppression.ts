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

// Handle GitHub Pages SPA routing
export const handleGitHubPagesRouting = () => {
  if (typeof window !== 'undefined') {
    try {
      // Check if we're on GitHub Pages and handle SPA routing
      const urlParams = new URLSearchParams(window.location.search);
      const redirect = urlParams.get('/');
      
      if (redirect !== null) {
        // Remove the redirect parameter and update the URL
        const newUrl = redirect.replace(/~and~/g, '&');
        window.history.replaceState(null, '', newUrl);
      }
    } catch (error) {
      // Silently fail if history manipulation fails
      console.warn('GitHub Pages routing failed:', error);
    }
  }
};

// Initialize error suppression during app startup
export const initializeRuntimeErrorHandling = () => {
  if (typeof window !== 'undefined') {
    // Handle script loading failures gracefully
    window.addEventListener('error', (event) => {
      if (event.target && (event.target as HTMLElement).tagName === 'SCRIPT') {
        const script = event.target as HTMLScriptElement;
        
        // Suppress Google Analytics loading errors
        if (script.src && (script.src.includes('googletagmanager.com') || script.src.includes('google-analytics.com'))) {
          event.preventDefault();
          console.warn('Google Analytics failed to load - continuing without analytics');
          return;
        }
        
        // Handle generic script loading errors
        if (script.src) {
          event.preventDefault();
          console.warn(`Script failed to load: ${script.src} - continuing without this resource`);
        }
      }
      
      // Suppress SES syntax errors that don't affect functionality
      if (event.message && event.message.includes('SES_UNCAUGHT_EXCEPTION')) {
        event.preventDefault();
        return;
      }
    });
  }
};