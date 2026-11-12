export function tiebreakerValidationError(value: unknown): string | null {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 200
    ? null
    : 'Tiebreaker total must be a whole number from 0 to 200';
}

