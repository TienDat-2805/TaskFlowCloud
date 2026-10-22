import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

// Refresh time-derived buckets at most every 30 seconds while visible, and immediately
// after visibility changes or BFCache restoration. One clock serves all task views.
export function useTaskClock() {
  const client = useQueryClient();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      setNow(new Date());
      void client.invalidateQueries({ queryKey: ['tasks'] });
      void client.invalidateQueries({ queryKey: ['dashboard'] });
    };
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, [client]);
  return now;
}
