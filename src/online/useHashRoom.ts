import { useCallback, useEffect, useState } from 'react';

/**
 * The room code lives in the URL hash so an invite link carries it, and so a
 * reload puts you back in the same room.
 */
export function useHashRoom(): [string | null, (code: string | null) => void] {
  const read = () => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const code = params.get('room');
    return code ? code.toUpperCase() : null;
  };
  const [code, setCode] = useState<string | null>(read);

  useEffect(() => {
    const onChange = () => setCode(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const set = useCallback((next: string | null) => {
    window.history.replaceState(null, '', next ? `#room=${next}` : ' ');
    setCode(next);
  }, []);

  return [code, set];
}
