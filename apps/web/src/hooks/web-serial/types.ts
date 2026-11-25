export interface SerialMessage {
  type: 'system' | 'app' | 'error' | 'sent';
  text: string;
  timestamp: number;
  /** Set for lines printed by the simulated board rather than a real one. */
  source?: 'simulation';
}

export type SerialMessageType = SerialMessage['type'];
export type SerialMessageSink = (type: SerialMessageType, text: string) => void;
export type SerialChunkListener = ((chunk: string) => void) | null;