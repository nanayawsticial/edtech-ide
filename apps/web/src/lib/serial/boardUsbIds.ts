/**
 * USB vendor IDs of the boards and USB-serial chips learners plug in. The port pickers list
 * these first, so Bluetooth and other built-in serial ports do not crowd out the board.
 */
export const BOARD_USB_VENDOR_IDS: readonly number[] = [
  0x2341, // Arduino
  0x2a03, // Arduino (arduino.org)
  0x1a86, // WCH CH340 / CH9102 (most Uno and Nano clones)
  0x0403, // FTDI
  0x10c4, // Silicon Labs CP210x (many ESP32 boards)
  0x067b, // Prolific
  0x303a, // Espressif (ESP32-S2/S3/C3 native USB)
  0x2e8a, // Raspberry Pi (Pico)
  0x239a, // Adafruit
  0x1b4f, // SparkFun
];

export function isBoardUsbVendor(vendorId: number | null | undefined) {
  return typeof vendorId === 'number' && BOARD_USB_VENDOR_IDS.includes(vendorId);
}
