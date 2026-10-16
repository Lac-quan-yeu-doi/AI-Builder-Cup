import { TextGuard } from '@domain/shared/text-guard';

/**
 * Three contexts held a byte-identical private copy of this rule, differing only
 * in the error type raised. The binding cases at the end are what make one shared
 * guard viable.
 */
describe('TextGuard', () => {
  const guard = TextGuard.reporting((message) => new RangeError(message));

  it('returns the trimmed value', () => {
    expect(guard.required('Label', '  value  ', 10)).toBe('value');
  });

  it('measures length after trimming, so padding cannot breach the limit', () => {
    expect(guard.required('Label', '   abc   ', 3)).toBe('abc');
  });

  it.each([
    ['   ', 'Label is required.'],
    ['abcd', 'Label must not exceed 3 characters.'],
    ['a\0c', 'Label contains an invalid character.'],
  ])('rejects %p', (value, message) => {
    expect(() => guard.required('Label', value, 3)).toThrow(message);
  });

  it('names the label and the limit in its messages', () => {
    expect(() => guard.required('Connection name', 'a'.repeat(121), 120)).toThrow(
      'Connection name must not exceed 120 characters.',
    );
  });

  describe('error binding', () => {
    it('raises the error type it was bound to', () => {
      expect(() => guard.required('Label', '', 3)).toThrow(RangeError);
    });

    it('lets each context keep its own error type', () => {
      const other = TextGuard.reporting((message) => new TypeError(message));

      expect(() => other.required('Label', '', 3)).toThrow(TypeError);
      expect(() => guard.required('Label', '', 3)).toThrow(RangeError);
    });
  });
});
