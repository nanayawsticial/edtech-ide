import { useMemo } from 'react';
import { useArduinoFlash } from './web-serial/useArduinoFlash';
import { useMicroPythonProtocol } from './web-serial/useMicroPythonProtocol';
import { useSerialMessages } from './web-serial/useSerialMessages';
import { useSerialTransport } from './web-serial/useSerialTransport';

export type { SerialMessage } from './web-serial/types';

export function useWebSerial() {
  const { messages, addMessage, showPartialLine, clearMessages } = useSerialMessages();
  const transport = useSerialTransport({ addMessage, showPartialLine });
  const { executeMicroPythonRaw, identifyMicroPythonBoard, restartMicroPython, runMicroPythonCommand } = useMicroPythonProtocol({
    addMessage,
    transport,
  });
  const { isFlashing, flashArduino } = useArduinoFlash({
    addMessage,
    transport,
  });

  return useMemo(() => ({
    isConnected: transport.isConnected,
    connectedBoard: transport.connectedBoard,
    nameConnectedBoard: transport.nameConnectedBoard,
    setBoardOutputQuiet: transport.setBoardOutputQuiet,
    isFlashing,
    baudRate: transport.baudRate,
    messages,
    connect: transport.connect,
    disconnect: transport.disconnect,
    setBaudRate: transport.setBaudRate,
    writeText: transport.writeText,
    writeBytes: transport.writeBytes,
    executeMicroPythonRaw,
    identifyMicroPythonBoard,
    restartMicroPython,
    runMicroPythonCommand,
    flashArduino,
    clearMessages,
    addMessage,
  }), [
    addMessage,
    clearMessages,
    executeMicroPythonRaw,
    flashArduino,
    identifyMicroPythonBoard,
    isFlashing,
    messages,
    restartMicroPython,
    runMicroPythonCommand,
    transport.baudRate,
    transport.connect,
    transport.connectedBoard,
    transport.nameConnectedBoard,
    transport.setBoardOutputQuiet,
    transport.disconnect,
    transport.isConnected,
    transport.setBaudRate,
    transport.writeBytes,
    transport.writeText,
  ]);
}

export type WebSerialController = ReturnType<typeof useWebSerial>;
