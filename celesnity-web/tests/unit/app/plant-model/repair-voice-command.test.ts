import { describe, expect, it } from 'vitest';

import { voiceCommand } from '@/app/(workspace)/plant-model/[siteId]/repairs/_components/use-speech';

describe('voiceCommand', () => {
  it('understands the guided-repair commands in Vietnamese and English', () => {
    expect(voiceCommand('Xong.')).toBe('next');
    expect(voiceCommand('tiếp theo')).toBe('next');
    expect(voiceCommand('Done')).toBe('next');
    expect(voiceCommand('quay lại')).toBe('back');
    expect(voiceCommand('Cho xem')).toBe('replay');
    expect(voiceCommand('show me')).toBe('replay');
  });

  it('treats anything else as a question for the guide', () => {
    expect(voiceCommand('bu lông cần siết bao nhiêu')).toBe('question');
    expect(voiceCommand('xong chưa nhỉ')).toBe('question');
  });
});
