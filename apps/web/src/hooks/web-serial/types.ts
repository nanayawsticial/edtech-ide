export interface SerialMessage {
  type: 'system' | 'app' | 'error' | 'sent';
  text: string;
  timestamp: number;
  /** Set for lines printed by the simulated board rather than a real one. */
  source?: 'simulation';
  /** The board's unfinished line (printed without a newline yet, like progress dots); always last. */
  partial?: boolean;
}

export type SerialMessageType = SerialMessage['type'];
export type SerialMessageSink = (type: SerialMessageType, text: string) => void;
/** Shows the board's unfinished line as the last message ('' removes it). */
export type SerialPartialLineSink = (text: string) => void;
export type SerialChunkListener = ((chunk: string) => void) | null;