import { useState, useEffect, useCallback } from 'react';

export function useStorage<T>(
  getter: () => Promise<T>,
  setter: (value: T) => Promise<void>,
): [T | undefined, (value: T) => void, boolean] {
  const [value, setValue] = useState<T>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getter().then((v) => {
      setValue(v);
      setLoading(false);
    });
  }, [getter]);

  const update = useCallback(
    (newValue: T) => {
      setValue(newValue);
      setter(newValue);
    },
    [setter],
  );

  return [value, update, loading];
}
