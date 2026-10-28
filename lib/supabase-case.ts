// Shared utility for converting between snake_case (Supabase) and camelCase (TS)
// 防呆: replace 回呼的 letter 參數在某些 V8/Hermes 引擎中可能不是字串
// (例如 [A-Z] 沒有 capture group 時 letter 會是 undefined 或 offset number)
// 所以強制 toString + 預設空字串

export function camelize(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(camelize);
  if (typeof obj !== 'object') return obj;

  const result: any = {};
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z])/g, (_match, letter) => {
      const s = typeof letter === 'string' ? letter : String(letter ?? '');
      return s.toUpperCase();
    });
    const value = obj[key];

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[camelKey] = camelize(value);
    } else if (Array.isArray(value)) {
      result[camelKey] = value.map((item: any) =>
        typeof item === 'object' ? camelize(item) : item,
      );
    } else {
      result[camelKey] = value;
    }
  }
  return result;
}

export function snakify(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(snakify);
  if (typeof obj !== 'object') return obj;

  const result: any = {};
  for (const key in obj) {
    const snakeKey = key.replace(/[A-Z]/g, (m) => {
      const s = typeof m === 'string' ? m : String(m ?? '');
      return `_${s.toLowerCase()}`;
    });
    const value = obj[key];

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[snakeKey] = snakify(value);
    } else if (Array.isArray(value)) {
      result[snakeKey] = value.map((item: any) =>
        typeof item === 'object' ? snakify(item) : item,
      );
    } else {
      result[snakeKey] = value;
    }
  }
  return result;
}
