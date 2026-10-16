export const encodeDateTime = (value: Date): string => value.toISOString();
export const decodeDateTime = (value: string): Date | undefined => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};
