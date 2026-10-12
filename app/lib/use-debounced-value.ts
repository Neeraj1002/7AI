import { useEffect, useState } from 'react';

// The value, but only after it has stayed the same for `ms`. While it is still changing, the returned value lags
// behind, which callers read as "settling".
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}
