'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { Locale } from '@/app/_i18n/locales';

/*
 * Hands-free guidance through the browser's own speech: the guide reads each
 * step aloud, and the technician answers with their voice while both hands
 * are on the machine. Chrome's recognition supports Vietnamese; where the
 * browser has none, the buttons still work.
 */

interface RecognitionResult {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

const speechLanguage = (locale: Locale) => (locale === 'vi' ? 'vi-VN' : 'en-US');

export function useSpeech(locale: Locale) {
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const handler = useRef<(text: string) => void>(() => undefined);
  const keepListening = useRef(false);

  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const canListen = recognitionConstructor() !== undefined;

  const speak = useCallback(
    (text: string) => {
      if (!canSpeak || text.trim() === '') return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = speechLanguage(locale);
      const voice = window.speechSynthesis
        .getVoices()
        .find((candidate) => candidate.lang.startsWith(utterance.lang.slice(0, 2)));
      if (voice !== undefined) utterance.voice = voice;
      window.speechSynthesis.speak(utterance);
    },
    [canSpeak, locale],
  );

  const stop = useCallback(() => {
    keepListening.current = false;
    recognition.current?.stop();
    recognition.current = null;
    setListening(false);
  }, []);

  /** Listens continuously; each finished phrase goes to `onPhrase`. */
  const listen = useCallback(
    (onPhrase: (text: string) => void) => {
      const Constructor = recognitionConstructor();
      if (Constructor === undefined) return;
      handler.current = onPhrase;
      recognition.current?.stop();
      const instance = new Constructor();
      instance.lang = speechLanguage(locale);
      instance.continuous = true;
      instance.interimResults = false;
      instance.onresult = (event) => {
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (result?.isFinal === true) handler.current(result[0].transcript.trim());
        }
      };
      // Chrome ends a session after a pause; keep going until stopped.
      instance.onend = () => {
        if (keepListening.current) instance.start();
        else setListening(false);
      };
      instance.onerror = () => undefined;
      keepListening.current = true;
      recognition.current = instance;
      instance.start();
      setListening(true);
    },
    [locale],
  );

  /** One phrase, for dictating an answer into a field. */
  const dictate = useCallback(
    (onText: (text: string) => void) => {
      const Constructor = recognitionConstructor();
      if (Constructor === undefined) return;
      const instance = new Constructor();
      instance.lang = speechLanguage(locale);
      instance.continuous = false;
      instance.interimResults = false;
      instance.onresult = (event) => {
        const result = event.results[event.resultIndex];
        if (result !== undefined) onText(result[0].transcript.trim());
      };
      instance.onend = null;
      instance.onerror = null;
      instance.start();
    },
    [locale],
  );

  useEffect(
    () => () => {
      keepListening.current = false;
      recognition.current?.stop();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    },
    [],
  );

  return { canSpeak, canListen, listening, speak, listen, stop, dictate };
}

/** Voice commands in either language; anything else is treated as a question. */
export type VoiceCommand = 'next' | 'back' | 'replay' | 'question';

export function voiceCommand(phrase: string): VoiceCommand {
  const text = phrase.toLowerCase().normalize('NFC').replace(/[.!,]/gu, '').trim();
  if (/^(tiếp|tiếp theo|xong|xong rồi|ok xong|next|done|finished)$/u.test(text)) return 'next';
  if (/^(quay lại|lùi lại|back|previous|go back)$/u.test(text)) return 'back';
  if (/^(cho xem|xem lại|lặp lại|phát lại|show me|replay|repeat)$/u.test(text)) return 'replay';
  return 'question';
}
