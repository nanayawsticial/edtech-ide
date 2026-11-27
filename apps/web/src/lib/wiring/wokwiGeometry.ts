export interface WokwiGeometryPin {
  id: string;
  name: string;
  position: {
    x: number;
    y: number;
  };
}

export interface WokwiComponentGeometry {
  size: {
    width: number;
    height: number;
  };
  pins: WokwiGeometryPin[];
}

export const ARDUINO_UNO_GEOMETRY: WokwiComponentGeometry = {
  size: { width: 274.318, height: 201.6 },
  pins: [
    { id: 'SCL', name: 'SCL', position: { x: 87, y: 9 } },
    { id: 'SDA', name: 'SDA', position: { x: 97, y: 9 } },
    { id: 'AREF', name: 'AREF', position: { x: 106, y: 9 } },
    { id: 'GND.1', name: 'GND', position: { x: 115.5, y: 9 } },
    { id: '13', name: '13', position: { x: 125, y: 9 } },
    { id: '12', name: '12', position: { x: 134.5, y: 9 } },
    { id: '11', name: '11', position: { x: 144, y: 9 } },
    { id: '10', name: '10', position: { x: 153.5, y: 9 } },
    { id: '9', name: '9', position: { x: 163, y: 9 } },
    { id: '8', name: '8', position: { x: 173, y: 9 } },
    { id: '7', name: '7', position: { x: 189, y: 9 } },
    { id: '6', name: '6', position: { x: 198.5, y: 9 } },
    { id: '5', name: '5', position: { x: 208, y: 9 } },
    { id: '4', name: '4', position: { x: 217.5, y: 9 } },
    { id: '3', name: '3', position: { x: 227, y: 9 } },
    { id: '2', name: '2', position: { x: 236.5, y: 9 } },
    { id: '1', name: 'TX', position: { x: 246, y: 9 } },
    { id: '0', name: 'RX', position: { x: 255.5, y: 9 } },
    { id: 'IOREF', name: 'IOREF', position: { x: 131, y: 191.5 } },
    { id: 'RESET', name: 'RESET', position: { x: 140.5, y: 191.5 } },
    { id: '3.3V', name: '3.3V', position: { x: 150, y: 191.5 } },
    { id: '5V', name: '5V', position: { x: 160, y: 191.5 } },
    { id: 'GND.2', name: 'GND', position: { x: 169.5, y: 191.5 } },
    { id: 'GND.3', name: 'GND', position: { x: 179, y: 191.5 } },
    { id: 'VIN', name: 'VIN', position: { x: 188.5, y: 191.5 } },
    { id: 'A0', name: 'A0', position: { x: 208, y: 191.5 } },
    { id: 'A1', name: 'A1', position: { x: 217.5, y: 191.5 } },
    { id: 'A2', name: 'A2', position: { x: 227, y: 191.5 } },
    { id: 'A3', name: 'A3', position: { x: 236.5, y: 191.5 } },
    { id: 'A4', name: 'A4', position: { x: 246, y: 191.5 } },
    { id: 'A5', name: 'A5', position: { x: 255.5, y: 191.5 } },
  ],
};

export const LED_GEOMETRY: WokwiComponentGeometry = {
  size: { width: 40, height: 50 },
  pins: [
    { id: 'A', name: 'Anode', position: { x: 25, y: 42 } },
    { id: 'C', name: 'Cathode', position: { x: 15, y: 42 } },
  ],
};

export const BUTTON_GEOMETRY: WokwiComponentGeometry = {
  size: { width: 67.28, height: 45.36 },
  pins: [
    { id: '1.l', name: '1.L', position: { x: 0, y: 13 } },
    { id: '2.l', name: '2.L', position: { x: 0, y: 32 } },
    { id: '1.r', name: '1.R', position: { x: 67, y: 13 } },
    { id: '2.r', name: '2.R', position: { x: 67, y: 32 } },
  ],
};

export const RESISTOR_GEOMETRY: WokwiComponentGeometry = {
  size: { width: 59.13, height: 11.34 },
  pins: [
    { id: 'A', name: 'Side A', position: { x: 0, y: 5.65 } },
    { id: 'B', name: 'Side B', position: { x: 58.8, y: 5.65 } },
  ],
};

export const POTENTIOMETER_GEOMETRY: WokwiComponentGeometry = {
  size: { width: 75.59, height: 75.59 },
  pins: [
    { id: 'GND', name: 'GND', position: { x: 29, y: 68.5 } },
    { id: 'OUT', name: 'OUT', position: { x: 39, y: 68.5 } },
    { id: 'VCC', name: 'VCC', position: { x: 49, y: 68.5 } },
  ],
};

export const SERVO_GEOMETRY: WokwiComponentGeometry = {
  size: { width: 170.08, height: 119.55 },
  pins: [
    { id: 'GND', name: 'GND', position: { x: 0, y: 50 } },
    { id: 'VCC', name: 'VCC', position: { x: 0, y: 59.5 } },
    { id: 'PWM', name: 'PWM', position: { x: 0, y: 69 } },
  ],
};

export const ULTRASONIC_GEOMETRY: WokwiComponentGeometry = {
  size: { width: 170.08, height: 94.49 },
  pins: [
    { id: 'VCC', name: 'VCC', position: { x: 71.3, y: 94.5 } },
    { id: 'TRIG', name: 'Trig', position: { x: 81.3, y: 94.5 } },
    { id: 'ECHO', name: 'Echo', position: { x: 91.3, y: 94.5 } },
    { id: 'GND', name: 'GND', position: { x: 101.3, y: 94.5 } },
  ],
};

export const DHT22_GEOMETRY: WokwiComponentGeometry = {
  size: { width: 57.07, height: 116.73 },
  pins: [
    { id: 'VCC', name: 'VCC', position: { x: 15, y: 114.9 } },
    { id: 'DATA', name: 'DATA', position: { x: 24.5, y: 114.9 } },
    { id: 'NC', name: 'NC', position: { x: 34.1, y: 114.9 } },
    { id: 'GND', name: 'GND', position: { x: 43.8, y: 114.9 } },
  ],
};

export const OLED_GEOMETRY: WokwiComponentGeometry = {
  size: { width: 150, height: 116 },
  pins: [
    { id: 'SDA', name: 'SDA', position: { x: 36.5, y: 12.5 } },
    { id: 'SCL', name: 'SCL', position: { x: 45.5, y: 12.5 } },
    { id: 'VCC', name: 'VCC', position: { x: 93.5, y: 12.5 } },
    { id: 'GND', name: 'GND', position: { x: 103.5, y: 12 } },
  ],
};

// Pin positions below come from each @wokwi/elements part's pinInfo; sizes are its width/height
// in px (mm x 3.7795 where the element is sized in mm).

/** wokwi-buzzer: pin 1 is the negative leg, pin 2 the positive leg. */
export const BUZZER_GEOMETRY: WokwiComponentGeometry = {
  size: { width: 64.25, height: 75.59 },
  pins: [
    { id: 'NEG', name: '−', position: { x: 27, y: 84 } },
    { id: 'POS', name: '+', position: { x: 37, y: 84 } },
  ],
};

/** wokwi-rgb-led: one leg per colour plus the longer common leg. */
export const RGB_LED_GEOMETRY: WokwiComponentGeometry = {
  size: { width: 42.13, height: 72.58 },
  pins: [
    { id: 'R', name: 'Red', position: { x: 8.5, y: 44 } },
    { id: 'COM', name: 'Common', position: { x: 18, y: 54 } },
    { id: 'G', name: 'Green', position: { x: 26.4, y: 44 } },
    { id: 'B', name: 'Blue', position: { x: 35.7, y: 44 } },
  ],
};

/** wokwi-photoresistor-sensor: LDR module with analog (AO) and threshold (DO) outputs. */
export const LDR_GEOMETRY: WokwiComponentGeometry = {
  size: { width: 173.67, height: 61.48 },
  pins: [
    { id: 'VCC', name: 'VCC', position: { x: 172, y: 16 } },
    { id: 'GND', name: 'GND', position: { x: 172, y: 26 } },
    { id: 'DO', name: 'DO', position: { x: 172, y: 35.8 } },
    { id: 'AO', name: 'AO', position: { x: 172, y: 45.5 } },
  ],
};

/** wokwi-small-sound-sensor: microphone module with analog (AOUT) and threshold (DOUT) outputs. */
export const SOUND_SENSOR_GEOMETRY: WokwiComponentGeometry = {
  size: { width: 133.08, height: 50.44 },
  pins: [
    { id: 'AO', name: 'AOUT', position: { x: 0, y: 11 } },
    { id: 'GND', name: 'GND', position: { x: 0, y: 20.5 } },
    { id: 'VCC', name: 'VCC', position: { x: 0, y: 30.5 } },
    { id: 'DO', name: 'DOUT', position: { x: 0, y: 40.5 } },
  ],
};

/** Traffic light module (drawn by the app, not Wokwi): pins on a 0.1" pitch along the bottom. */
export const TRAFFIC_LIGHT_GEOMETRY: WokwiComponentGeometry = {
  size: { width: 46, height: 120 },
  pins: [
    { id: 'R', name: 'R', position: { x: 8.6, y: 116 } },
    { id: 'Y', name: 'Y', position: { x: 18.2, y: 116 } },
    { id: 'G', name: 'G', position: { x: 27.8, y: 116 } },
    { id: 'GND', name: 'GND', position: { x: 37.4, y: 116 } },
  ],
};

/** wokwi-slide-switch: pin 2 is the common; the handle joins it to pin 1 (value 0) or pin 3 (value 1). */
export const SLIDE_SWITCH_GEOMETRY: WokwiComponentGeometry = {
  size: { width: 32.13, height: 34.89 },
  pins: [
    { id: '1', name: '1', position: { x: 6.5, y: 34 } },
    { id: '2', name: 'COM', position: { x: 16, y: 34 } },
    { id: '3', name: '3', position: { x: 25.5, y: 34 } },
  ],
};

/** wokwi-pir-motion-sensor (HC-SR501). */
export const PIR_GEOMETRY: WokwiComponentGeometry = {
  size: { width: 90.72, height: 92.41 },
  pins: [
    { id: 'VCC', name: 'VCC', position: { x: 36.178, y: 92 } },
    { id: 'OUT', name: 'OUT', position: { x: 45.9175, y: 92 } },
    { id: 'GND', name: 'GND', position: { x: 55.6415, y: 92 } },
  ],
};

/** wokwi-7segment, one digit (5611BH pinout): pins on the top and bottom edges. */
export const SEVEN_SEGMENT_GEOMETRY: WokwiComponentGeometry = {
  size: { width: 47.44, height: 83.16 },
  pins: [
    { id: 'G', name: 'G', position: { x: 4.52, y: 3.78 } },
    { id: 'F', name: 'F', position: { x: 14.12, y: 3.78 } },
    { id: 'COM.2', name: 'COM', position: { x: 23.72, y: 3.78 } },
    { id: 'A', name: 'A', position: { x: 33.32, y: 3.78 } },
    { id: 'B', name: 'B', position: { x: 42.92, y: 3.78 } },
    { id: 'E', name: 'E', position: { x: 4.52, y: 71.82 } },
    { id: 'D', name: 'D', position: { x: 14.12, y: 71.82 } },
    { id: 'COM.1', name: 'COM', position: { x: 23.72, y: 71.82 } },
    { id: 'C', name: 'C', position: { x: 33.32, y: 71.82 } },
    { id: 'DP', name: 'DP', position: { x: 42.92, y: 71.82 } },
  ],
};

/** One-channel relay module (drawn by the app): input header left, screw terminal right. */
export const RELAY_GEOMETRY: WokwiComponentGeometry = {
  size: { width: 110, height: 64 },
  pins: [
    { id: 'IN', name: 'IN', position: { x: 0, y: 22.4 } },
    { id: 'VCC', name: 'VCC', position: { x: 0, y: 32 } },
    { id: 'GND', name: 'GND', position: { x: 0, y: 41.6 } },
    { id: 'NO', name: 'NO', position: { x: 110, y: 14 } },
    { id: 'COM', name: 'COM', position: { x: 110, y: 32 } },
    { id: 'NC', name: 'NC', position: { x: 110, y: 50 } },
  ],
};

/** Small DC motor (drawn by the app): two terminals at the bottom. */
export const DC_MOTOR_GEOMETRY: WokwiComponentGeometry = {
  size: { width: 80, height: 72 },
  pins: [
    { id: 'POS', name: '+', position: { x: 30.4, y: 70 } },
    { id: 'NEG', name: '−', position: { x: 49.6, y: 70 } },
  ],
};

/** wokwi-led-ring with 12 NeoPixels: pins along the bottom edge. */
export const NEOPIXEL_RING_GEOMETRY: WokwiComponentGeometry = {
  size: { width: 117.55, height: 128.89 },
  pins: [
    { id: 'GND', name: 'GND', position: { x: 44.37, y: 128.89 } },
    { id: 'VCC', name: 'VCC', position: { x: 53.98, y: 128.89 } },
    { id: 'DIN', name: 'DIN', position: { x: 63.58, y: 128.89 } },
    { id: 'DOUT', name: 'DOUT', position: { x: 73.18, y: 128.89 } },
  ],
};

/** wokwi-lcd1602 with the I2C backpack (pins="i2c"). */
export const LCD1602_GEOMETRY: WokwiComponentGeometry = {
  size: { width: 302.4, height: 136.08 },
  pins: [
    { id: 'GND', name: 'GND', position: { x: 4, y: 32 } },
    { id: 'VCC', name: 'VCC', position: { x: 4, y: 41.5 } },
    { id: 'SDA', name: 'SDA', position: { x: 4, y: 51 } },
    { id: 'SCL', name: 'SCL', position: { x: 4, y: 60.5 } },
  ],
};

export const WOKWI_COMPONENT_GEOMETRY = {
  NEOPIXEL_RING: NEOPIXEL_RING_GEOMETRY,
  LCD1602: LCD1602_GEOMETRY,
  SLIDE_SWITCH: SLIDE_SWITCH_GEOMETRY,
  PIR: PIR_GEOMETRY,
  SEVEN_SEGMENT: SEVEN_SEGMENT_GEOMETRY,
  RELAY: RELAY_GEOMETRY,
  DC_MOTOR: DC_MOTOR_GEOMETRY,
  ARDUINO_UNO: ARDUINO_UNO_GEOMETRY,
  BUZZER: BUZZER_GEOMETRY,
  RGB_LED: RGB_LED_GEOMETRY,
  LDR: LDR_GEOMETRY,
  SOUND_SENSOR: SOUND_SENSOR_GEOMETRY,
  TRAFFIC_LIGHT: TRAFFIC_LIGHT_GEOMETRY,
  LED: LED_GEOMETRY,
  BUTTON: BUTTON_GEOMETRY,
  RESISTOR: RESISTOR_GEOMETRY,
  POTENTIOMETER: POTENTIOMETER_GEOMETRY,
  SERVO: SERVO_GEOMETRY,
  ULTRASONIC: ULTRASONIC_GEOMETRY,
  DHT: DHT22_GEOMETRY,
  OLED: OLED_GEOMETRY,
} as const;

export type WokwiGeometryComponentId = keyof typeof WOKWI_COMPONENT_GEOMETRY;

export function getWokwiComponentGeometry(id: string) {
  return WOKWI_COMPONENT_GEOMETRY[id as WokwiGeometryComponentId] ?? null;
}
