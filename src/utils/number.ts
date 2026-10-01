const parsePositiveInt = (value: unknown, fallback: number, max?: number) => {
  const parsed = Math.max(1, Number.parseInt(String(value), 10) || fallback);
  return max ? Math.min(parsed, max) : parsed;
};

export { parsePositiveInt };
