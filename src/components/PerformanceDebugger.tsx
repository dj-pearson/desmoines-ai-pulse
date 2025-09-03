import React from 'react';
import { useWebVitals } from '@/hooks/useWebVitals';

interface PerformanceDebuggerProps {
  enabled: boolean;
}

/**
 * Performance debugging component for development
 */
export const PerformanceDebugger: React.FC<PerformanceDebuggerProps> = ({ enabled }) => {
  const vitals = useWebVitals();
  
  if (!enabled || process.env.NODE_ENV === 'production') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-black/90 text-white p-4 rounded-lg text-xs font-mono z-50">
      <h4 className="font-bold mb-2">Core Web Vitals</h4>
      <div className="space-y-1">
        {vitals.lcp && (
          <div className={`flex justify-between gap-4 ${
            vitals.lcp.rating === 'good' ? 'text-green-400' : 
            vitals.lcp.rating === 'needs-improvement' ? 'text-yellow-400' : 'text-red-400'
          }`}>
            <span>LCP:</span>
            <span>{vitals.lcp.value.toFixed(0)}ms ({vitals.lcp.rating})</span>
          </div>
        )}
        {vitals.inp && (
          <div className={`flex justify-between gap-4 ${
            vitals.inp.rating === 'good' ? 'text-green-400' : 
            vitals.inp.rating === 'needs-improvement' ? 'text-yellow-400' : 'text-red-400'
          }`}>
            <span>INP:</span>
            <span>{vitals.inp.value.toFixed(0)}ms ({vitals.inp.rating})</span>
          </div>
        )}
        {vitals.cls && (
          <div className={`flex justify-between gap-4 ${
            vitals.cls.rating === 'good' ? 'text-green-400' : 
            vitals.cls.rating === 'needs-improvement' ? 'text-yellow-400' : 'text-red-400'
          }`}>
            <span>CLS:</span>
            <span>{vitals.cls.value.toFixed(3)} ({vitals.cls.rating})</span>
          </div>
        )}
        {vitals.ttfb && (
          <div className={`flex justify-between gap-4 ${
            vitals.ttfb.rating === 'good' ? 'text-green-400' : 
            vitals.ttfb.rating === 'needs-improvement' ? 'text-yellow-400' : 'text-red-400'
          }`}>
            <span>TTFB:</span>
            <span>{vitals.ttfb.value.toFixed(0)}ms ({vitals.ttfb.rating})</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default PerformanceDebugger;