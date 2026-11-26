import { useCallback, useState } from 'react';
import type { SerialMessage, SerialMessageSink, SerialPartialLineSink } from './types';

const DEFAULT_MESSAGE_LIMIT = 500;

export function useSerialMessages(limit: number = DEFAULT_MESSAGE_LIMIT) {
  const [messages, setMessages] = useState<SerialMessage[]>([]);

  const addMessage = useCallback<SerialMessageSink>((type, text) => {
    setMessages((previousMessages) => {
      const last = previousMessages[previousMessages.length - 1];
      const message: SerialMessage = { type, text, timestamp: Date.now() };
      let nextMessages: SerialMessage[];
      if (!last?.partial) {
        nextMessages = [...previousMessages, message];
      } else if (type === 'app') {
        // The board finished its line: the whole line replaces the unfinished one.
        nextMessages = [...previousMessages.slice(0, -1), message];
      } else {
        // Keep the board's unfinished line last, where its next characters will appear.
        nextMessages = [...previousMessages.slice(0, -1), message, last];
      }
      if (nextMessages.length <= limit) {
        return nextMessages;
      }
      return nextMessages.slice(nextMessages.length - limit);
    });
  }, [limit]);

  const showPartialLine = useCallback<SerialPartialLineSink>((text) => {
    setMessages((previousMessages) => {
      const last = previousMessages[previousMessages.length - 1];
      const kept = last?.partial ? previousMessages.slice(0, -1) : previousMessages;
      if (!text) {
        return kept;
      }
      return [...kept, { type: 'app', text, timestamp: last?.partial ? last.timestamp : Date.now(), partial: true }];
    });
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    addMessage,
    showPartialLine,
    clearMessages,
  };
}