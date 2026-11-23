import * as Blockly from 'blockly';
import type { CodingCircuitSnapshot } from '@/lib/blockly/circuitAwareness';

function getCircuitSnapshot(): CodingCircuitSnapshot | undefined {
    if (typeof window === 'undefined') return undefined;
    return (window as any).__CIRCUIT_CODING_SNAPSHOT as CodingCircuitSnapshot | undefined;
}

function resolvePin(componentId: string, fallback = '2'): string {
    if (!componentId || componentId === 'NONE') return fallback;
    const snapshot = getCircuitSnapshot();
    if (!snapshot) return fallback;
    const component = snapshot.components.find((entry) => entry.componentId === componentId);
    return component?.primaryBoardPin || fallback;
}

function resolveNamedPin(componentId: string, pinId: string, fallback = '2'): string {
    if (!componentId || componentId === 'NONE') return fallback;
    const snapshot = getCircuitSnapshot();
    if (!snapshot) return fallback;
    const component = snapshot.components.find((entry) => entry.componentId === componentId);
    if (!component) return fallback;
    return component.pinMappings[pinId]?.boardPinLabel || fallback;
}

function looksLikeBoardPin(value: string) {
    return /^(?:A\d+|\d+|D\d+|GPIO\d+|GP\d+)$/i.test(value);
}

function sanitizeIdentifier(value: string, fallbackPrefix = 'device') {
    const cleaned = String(value || '').replace(/[^A-Za-z0-9_]/g, '_');
    if (!cleaned) return fallbackPrefix;
    return /^[A-Za-z_]/.test(cleaned) ? cleaned : `${fallbackPrefix}_${cleaned}`;
}

function resolveComponentOrPin(value: string, fallback = '2') {
    if (!value || value === 'NONE') return fallback;
    if (looksLikeBoardPin(value)) return value;
    return resolvePin(value, fallback);
}

function resolveComponentNamedPinOrPin(value: string, pinId: string, fallback = '2') {
    if (!value || value === 'NONE') return fallback;
    if (looksLikeBoardPin(value)) return value;
    return resolveNamedPin(value, pinId, fallback);
}

function getInstanceIdentifier(rawValue: string, prefix: string, fallbackPin = '2') {
    if (!rawValue || rawValue === 'NONE') {
        return `${prefix}_${sanitizeIdentifier(fallbackPin, prefix)}`;
    }
    if (looksLikeBoardPin(rawValue)) {
        return `${prefix}_${sanitizeIdentifier(rawValue, prefix)}`;
    }
    return sanitizeIdentifier(rawValue, prefix);
}

/**
 * Board pin for a block that picks its part from a SENSOR dropdown (a circuit component id or a
 * raw pin). Older blocks used a PIN field, so that is the fallback. Never returns null.
 */
function getSensorPin(block: Blockly.Block, fallback = '2', namedPin?: string) {
    const raw = block.getFieldValue('SENSOR') || block.getFieldValue('PIN') || '';
    const pin = resolveComponentOrPin(raw, fallback);
    return namedPin ? resolveComponentNamedPinOrPin(raw, namedPin, pin) : pin;
}

/** Pin label (13, A0, D7, GP5, GPIO5) as a MicroPython machine.Pin argument. */
function toMicroPythonPin(label: string) {
    const match = String(label).match(/(\d+)$/);
    return match ? match[1] : `"${label}"`;
}

// ----------------------------------------------------------------------------
// 1. ARDUINO C++ GENERATOR
// ----------------------------------------------------------------------------
export const arduinoGenerator = new Blockly.CodeGenerator('Arduino');
arduinoGenerator.INDENT = '  ';

(arduinoGenerator as any).init = function (workspace: Blockly.Workspace) {
    (this as any).setups_ = Object.create(null);
    (this as any).loops_ = Object.create(null);
};

(arduinoGenerator as any).finish = function (code: string) {
    // We do NOT wrap the code anymore, the template system handles it
    return code;
};

(arduinoGenerator as any).scrub_ = function (block: Blockly.Block, code: string, opt_thisOnly?: boolean): string {
    const nextBlock = block.nextConnection && block.nextConnection.targetBlock();
    const nextCode = opt_thisOnly ? '' : this.blockToCode(nextBlock);
    return code + nextCode;
};

// -- Arduino Blocks --
(arduinoGenerator as any).forBlock['arduino_pinMode'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const mode = block.getFieldValue('MODE');
    (arduinoGenerator as any).setups_[`pinMode_${pin}`] = `  pinMode(${pin}, ${mode});`;
    return '';
};

(arduinoGenerator as any).forBlock['arduino_digitalWrite'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const state = block.getFieldValue('STATE');
    return `  digitalWrite(${pin}, ${state});\n`;
};

(arduinoGenerator as any).forBlock['arduino_board_led'] = function (block: Blockly.Block) {
    const state = block.getFieldValue('STATE') || 'LOW';
    (arduinoGenerator as any).setups_['board_led_pin'] = '  pinMode(LED_BUILTIN, OUTPUT);';
    return `  digitalWrite(LED_BUILTIN, ${state});\n`;
};

function getArduinoLedPin(block: Blockly.Block) {
    const rawSensor = block.getFieldValue('SENSOR') || block.getFieldValue('PIN') || '2';
    return resolveComponentNamedPinOrPin(rawSensor, 'SIG', resolveComponentOrPin(rawSensor, '2'));
}

(arduinoGenerator as any).forBlock['arduino_led_set'] = function (block: Blockly.Block) {
    const pin = getArduinoLedPin(block);
    const state = block.getFieldValue('STATE') || 'LOW';
    (arduinoGenerator as any).setups_[`led_pin_${pin}`] = `  pinMode(${pin}, OUTPUT);`;
    return `  digitalWrite(${pin}, ${state});\n`;
};
(arduinoGenerator as any).forBlock['arduino_delay'] = function (block: Blockly.Block) {
    const ms = block.getFieldValue('MS');
    return `  delay(${ms});\n`;
};

// --- Starter "Timing" blocks (time_*): these take value inputs rather than fields. ---
const NUMBER_LITERAL = /^-?\d+(\.\d+)?$/;

(arduinoGenerator as any).forBlock['time_delay'] = function (block: Blockly.Block) {
    const ms = (arduinoGenerator as any).valueToCode(block, 'MS', (arduinoGenerator as any).ORDER_NONE) || '0';
    return `  delay(${ms});\n`;
};

(arduinoGenerator as any).forBlock['time_wait_seconds'] = function (block: Blockly.Block) {
    const seconds = (arduinoGenerator as any).valueToCode(block, 'SECONDS', (arduinoGenerator as any).ORDER_NONE) || '0';
    // A plain number becomes a readable delay(1000); anything else is converted at run time.
    const ms = NUMBER_LITERAL.test(seconds.trim())
        ? String(Math.max(0, Math.round(Number(seconds) * 1000)))
        : `(unsigned long)((${seconds}) * 1000.0)`;
    return `  delay(${ms});\n`;
};

(arduinoGenerator as any).forBlock['time_wait_until'] = function (block: Blockly.Block) {
    const condition = (arduinoGenerator as any).valueToCode(block, 'BOOL', (arduinoGenerator as any).ORDER_NONE) || 'false';
    return `  while (!(${condition})) {\n    delay(1);\n  }\n`;
};

(arduinoGenerator as any).forBlock['arduino_digitalRead'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    return [`digitalRead(${pin})`, (arduinoGenerator as any).ORDER_ATOMIC];
};

(arduinoGenerator as any).forBlock['arduino_analogRead'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    return [`analogRead(${pin})`, (arduinoGenerator as any).ORDER_ATOMIC];
};

(arduinoGenerator as any).forBlock['arduino_analogWrite'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const value = (arduinoGenerator as any).valueToCode(block, 'VALUE', (arduinoGenerator as any).ORDER_NONE) || '0';
    return `  analogWrite(${pin}, ${value});\n`;
};

(arduinoGenerator as any).forBlock['arduino_millis'] = function (block: Blockly.Block) {
    return [`millis()`, (arduinoGenerator as any).ORDER_ATOMIC];
};

(arduinoGenerator as any).forBlock['arduino_serialPrint'] = function (block: Blockly.Block) {
    const text = (arduinoGenerator as any).valueToCode(block, 'TEXT', (arduinoGenerator as any).ORDER_NONE) || '""';
    const baud = block.getFieldValue('BAUD') || '9600';
    (arduinoGenerator as any).setups_['serial_begin'] = `  Serial.begin(${baud});`;
    return `  Serial.print(${text});\n`;
};

(arduinoGenerator as any).forBlock['arduino_serialPrintln'] = function (block: Blockly.Block) {
    const text = (arduinoGenerator as any).valueToCode(block, 'TEXT', (arduinoGenerator as any).ORDER_NONE) || '""';
    const baud = block.getFieldValue('BAUD') || '9600';
    (arduinoGenerator as any).setups_['serial_begin'] = `  Serial.begin(${baud});`;
    return `  Serial.println(${text});\n`;
};

(arduinoGenerator as any).forBlock['arduino_serialBegin'] = function (block: Blockly.Block) {
    const baud = block.getFieldValue('BAUD') || '9600';
    (arduinoGenerator as any).setups_['serial_begin'] = `  Serial.begin(${baud});`;
    return '';
};

(arduinoGenerator as any).forBlock['arduino_hc05_init'] = function (block: Blockly.Block) {
    const rx = block.getFieldValue('RX') || '10';
    const tx = block.getFieldValue('TX') || '11';
    const baud = block.getFieldValue('BAUD') || '9600';
    (arduinoGenerator as any).setups_['hc05_global'] = `#include <SoftwareSerial.h>\nSoftwareSerial hc05(${rx}, ${tx});`;
    (arduinoGenerator as any).setups_['hc05_begin'] = `  hc05.begin(${baud});`;
    return '';
};

(arduinoGenerator as any).forBlock['arduino_hc05_send'] = function (block: Blockly.Block) {
    const text = (arduinoGenerator as any).valueToCode(block, 'TEXT', (arduinoGenerator as any).ORDER_NONE) || '""';
    if (!(arduinoGenerator as any).setups_['hc05_global']) {
        (arduinoGenerator as any).setups_['hc05_global'] = '#include <SoftwareSerial.h>\nSoftwareSerial hc05(10, 11);';
    }
    if (!(arduinoGenerator as any).setups_['hc05_begin']) {
        (arduinoGenerator as any).setups_['hc05_begin'] = '  hc05.begin(9600);';
    }
    return `  hc05.println(${text});\n`;
};

(arduinoGenerator as any).forBlock['arduino_hc05_available'] = function () {
    if (!(arduinoGenerator as any).setups_['hc05_global']) {
        (arduinoGenerator as any).setups_['hc05_global'] = '#include <SoftwareSerial.h>\nSoftwareSerial hc05(10, 11);';
    }
    if (!(arduinoGenerator as any).setups_['hc05_begin']) {
        (arduinoGenerator as any).setups_['hc05_begin'] = '  hc05.begin(9600);';
    }
    return ['hc05.available()', (arduinoGenerator as any).ORDER_ATOMIC];
};

(arduinoGenerator as any).forBlock['arduino_hc05_read_byte'] = function () {
    if (!(arduinoGenerator as any).setups_['hc05_global']) {
        (arduinoGenerator as any).setups_['hc05_global'] = '#include <SoftwareSerial.h>\nSoftwareSerial hc05(10, 11);';
    }
    if (!(arduinoGenerator as any).setups_['hc05_begin']) {
        (arduinoGenerator as any).setups_['hc05_begin'] = '  hc05.begin(9600);';
    }
    return ['hc05.read()', (arduinoGenerator as any).ORDER_ATOMIC];
};
(arduinoGenerator as any).forBlock['arduino_servo_write'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const angle = (arduinoGenerator as any).valueToCode(block, 'ANGLE', (arduinoGenerator as any).ORDER_NONE) || '90';
    (arduinoGenerator as any).setups_['include_servo'] = `#include <Servo.h>\nServo servo_${pin};`;
    (arduinoGenerator as any).setups_[`servo_attach_${pin}`] = `  servo_${pin}.attach(${pin});`;
    return `  servo_${pin}.write(${angle});\n`;
};

(arduinoGenerator as any).forBlock['arduino_ultrasonic'] = function (block: Blockly.Block) {
    const trig = block.getFieldValue('TRIG');
    const echo = block.getFieldValue('ECHO');
    (arduinoGenerator as any).setups_['ultrasonic_func'] = `long readUltrasonicDistance(int triggerPin, int echoPin) {\n  pinMode(triggerPin, OUTPUT);\n  digitalWrite(triggerPin, LOW);\n  delayMicroseconds(2);\n  digitalWrite(triggerPin, HIGH);\n  delayMicroseconds(10);\n  digitalWrite(triggerPin, LOW);\n  pinMode(echoPin, INPUT);\n  return pulseIn(echoPin, HIGH) * 0.01723;\n}`;
    return [`readUltrasonicDistance(${trig}, ${echo})`, (arduinoGenerator as any).ORDER_ATOMIC];
};

(arduinoGenerator as any).forBlock['arduino_relay_write'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const state = block.getFieldValue('STATE') || 'LOW';
    (arduinoGenerator as any).setups_[`relay_pin_${pin}`] = `  pinMode(${pin}, OUTPUT);`;
    return `  digitalWrite(${pin}, ${state});\n`;
};

(arduinoGenerator as any).forBlock['arduino_buzzer_tone'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const freq = (arduinoGenerator as any).valueToCode(block, 'FREQ', (arduinoGenerator as any).ORDER_NONE) || '1000';
    const duration = (arduinoGenerator as any).valueToCode(block, 'DURATION', (arduinoGenerator as any).ORDER_NONE) || '250';
    (arduinoGenerator as any).setups_[`buzzer_pin_${pin}`] = `  pinMode(${pin}, OUTPUT);`;
    return `  tone(${pin}, ${freq}, ${duration});\n`;
};

(arduinoGenerator as any).forBlock['arduino_tone_pin'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const freq = (arduinoGenerator as any).valueToCode(block, 'FREQ', (arduinoGenerator as any).ORDER_NONE) || '1000';
    (arduinoGenerator as any).setups_[`tone_pin_${pin}`] = `  pinMode(${pin}, OUTPUT);`;
    return `  tone(${pin}, ${freq});\n`;
};

(arduinoGenerator as any).forBlock['arduino_tone_pin_duration'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const freq = (arduinoGenerator as any).valueToCode(block, 'FREQ', (arduinoGenerator as any).ORDER_NONE) || '1000';
    const duration = (arduinoGenerator as any).valueToCode(block, 'DUR', (arduinoGenerator as any).ORDER_NONE) || '250';
    (arduinoGenerator as any).setups_[`tone_pin_${pin}`] = `  pinMode(${pin}, OUTPUT);`;
    return `  tone(${pin}, ${freq}, ${duration});\n`;
};
(arduinoGenerator as any).forBlock['arduino_buzzer_stop'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    (arduinoGenerator as any).setups_[`buzzer_pin_${pin}`] = `  pinMode(${pin}, OUTPUT);`;
    return `  noTone(${pin});\n`;
};

(arduinoGenerator as any).forBlock['arduino_no_tone_pin'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    (arduinoGenerator as any).setups_[`tone_pin_${pin}`] = `  pinMode(${pin}, OUTPUT);`;
    return `  noTone(${pin});\n`;
};
(arduinoGenerator as any).forBlock['arduino_pir_read'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    (arduinoGenerator as any).setups_[`pir_pin_${pin}`] = `  pinMode(${pin}, INPUT);`;
    return [`digitalRead(${pin})`, (arduinoGenerator as any).ORDER_ATOMIC];
};

(arduinoGenerator as any).forBlock['arduino_touch_read'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    (arduinoGenerator as any).setups_[`touch_pin_${pin}`] = `  pinMode(${pin}, INPUT);`;
    return [`digitalRead(${pin})`, (arduinoGenerator as any).ORDER_ATOMIC];
};

(arduinoGenerator as any).forBlock['arduino_soil_moisture_read'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    return [`analogRead(${pin})`, (arduinoGenerator as any).ORDER_ATOMIC];
};

(arduinoGenerator as any).forBlock['arduino_rain_read'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    return [`analogRead(${pin})`, (arduinoGenerator as any).ORDER_ATOMIC];
};

(arduinoGenerator as any).forBlock['arduino_water_level_read'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    return [`analogRead(${pin})`, (arduinoGenerator as any).ORDER_ATOMIC];
};

(arduinoGenerator as any).forBlock['arduino_ir_init'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN') || '2';
    (arduinoGenerator as any).setups_['ir_include'] = '#include <IRremote.hpp>';
    (arduinoGenerator as any).setups_['ir_begin'] = `  IrReceiver.begin(${pin}, ENABLE_LED_FEEDBACK);`;
    (arduinoGenerator as any).setups_['ir_helper'] = `unsigned long readIrCode() {\n  if (IrReceiver.decode()) {\n    unsigned long code = IrReceiver.decodedIRData.decodedRawData;\n    IrReceiver.resume();\n    return code;\n  }\n  return 0;\n}`;
    return '';
};

(arduinoGenerator as any).forBlock['arduino_ir_read_code'] = function () {
    if (!(arduinoGenerator as any).setups_['ir_include']) {
        (arduinoGenerator as any).setups_['ir_include'] = '#include <IRremote.hpp>';
    }
    if (!(arduinoGenerator as any).setups_['ir_begin']) {
        (arduinoGenerator as any).setups_['ir_begin'] = '  IrReceiver.begin(2, ENABLE_LED_FEEDBACK);';
    }
    if (!(arduinoGenerator as any).setups_['ir_helper']) {
        (arduinoGenerator as any).setups_['ir_helper'] = 'unsigned long readIrCode() {\n  if (IrReceiver.decode()) {\n    unsigned long code = IrReceiver.decodedIRData.decodedRawData;\n    IrReceiver.resume();\n    return code;\n  }\n  return 0;\n}';
    }
    return ['readIrCode()', (arduinoGenerator as any).ORDER_ATOMIC];
};

(arduinoGenerator as any).forBlock['arduino_keypad_init'] = function (block: Blockly.Block) {
    const r1 = block.getFieldValue('R1') || '9';
    const r2 = block.getFieldValue('R2') || '8';
    const r3 = block.getFieldValue('R3') || '7';
    const r4 = block.getFieldValue('R4') || '6';
    const c1 = block.getFieldValue('C1') || '5';
    const c2 = block.getFieldValue('C2') || '4';
    const c3 = block.getFieldValue('C3') || '3';
    const c4 = block.getFieldValue('C4') || '2';
    (arduinoGenerator as any).setups_['keypad_global'] = `#include <Keypad.h>\nconst byte KP_ROWS = 4;\nconst byte KP_COLS = 4;\nchar KP_KEYS[KP_ROWS][KP_COLS] = {\n  {'1','2','3','A'},\n  {'4','5','6','B'},\n  {'7','8','9','C'},\n  {'*','0','#','D'}\n};\nbyte kpRowPins[KP_ROWS] = {${r1}, ${r2}, ${r3}, ${r4}};\nbyte kpColPins[KP_COLS] = {${c1}, ${c2}, ${c3}, ${c4}};\nKeypad customKeypad = Keypad(makeKeymap(KP_KEYS), kpRowPins, kpColPins, KP_ROWS, KP_COLS);`;
    (arduinoGenerator as any).setups_['keypad_helper'] = `String readKeypadKey() {\n  char key = customKeypad.getKey();\n  if (key == NO_KEY) return String(\"\");\n  return String(key);\n}`;
    return '';
};

(arduinoGenerator as any).forBlock['arduino_keypad_get_key'] = function () {
    if (!(arduinoGenerator as any).setups_['keypad_global']) {
        (arduinoGenerator as any).setups_['keypad_global'] = '#include <Keypad.h>\nconst byte KP_ROWS = 4;\nconst byte KP_COLS = 4;\nchar KP_KEYS[KP_ROWS][KP_COLS] = {\n  {\'1\',\'2\',\'3\',\'A\'},\n  {\'4\',\'5\',\'6\',\'B\'},\n  {\'7\',\'8\',\'9\',\'C\'},\n  {\'*\',\'0\',\'#\',\'D\'}\n};\nbyte kpRowPins[KP_ROWS] = {9, 8, 7, 6};\nbyte kpColPins[KP_COLS] = {5, 4, 3, 2};\nKeypad customKeypad = Keypad(makeKeymap(KP_KEYS), kpRowPins, kpColPins, KP_ROWS, KP_COLS);';
    }
    if (!(arduinoGenerator as any).setups_['keypad_helper']) {
        (arduinoGenerator as any).setups_['keypad_helper'] = 'String readKeypadKey() {\n  char key = customKeypad.getKey();\n  if (key == NO_KEY) return String(\"\");\n  return String(key);\n}';
    }
    return ['readKeypadKey()', (arduinoGenerator as any).ORDER_ATOMIC];
};
(arduinoGenerator as any).forBlock['arduino_dht_init'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const type = block.getFieldValue('TYPE') || 'DHT11';
    (arduinoGenerator as any).setups_[`dht_global_${pin}`] = `#include <DHT.h>\nDHT dht_${pin}(${pin}, ${type});`;
    (arduinoGenerator as any).setups_[`dht_begin_${pin}`] = `  dht_${pin}.begin();`;
    return '';
};

(arduinoGenerator as any).forBlock['arduino_dht_read'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const type = block.getFieldValue('TYPE') || 'DHT11';
    const metric = block.getFieldValue('METRIC') || 'TEMP_C';
    (arduinoGenerator as any).setups_[`dht_global_${pin}`] = `#include <DHT.h>\nDHT dht_${pin}(${pin}, ${type});`;
    (arduinoGenerator as any).setups_[`dht_begin_${pin}`] = `  dht_${pin}.begin();`;
    const expression = metric === 'HUMIDITY' ? `dht_${pin}.readHumidity()` : `dht_${pin}.readTemperature()`;
    return [expression, (arduinoGenerator as any).ORDER_ATOMIC];
};

(arduinoGenerator as any).forBlock['arduino_bme280_init'] = function (block: Blockly.Block) {
    const address = block.getFieldValue('ADDRESS') || '0x76';
    (arduinoGenerator as any).setups_['bme280_global'] = '#include <Wire.h>\n#include <Adafruit_Sensor.h>\n#include <Adafruit_BME280.h>\nAdafruit_BME280 bme;';
    (arduinoGenerator as any).setups_['bme280_begin'] = `  bme.begin(${address});`;
    return '';
};

(arduinoGenerator as any).forBlock['arduino_bme280_read'] = function (block: Blockly.Block) {
    const metric = block.getFieldValue('METRIC') || 'TEMP_C';
    (arduinoGenerator as any).setups_['bme280_global'] = '#include <Wire.h>\n#include <Adafruit_Sensor.h>\n#include <Adafruit_BME280.h>\nAdafruit_BME280 bme;';
    (arduinoGenerator as any).setups_['bme280_begin'] = '  bme.begin(0x76);';
    let expression = 'bme.readTemperature()';
    if (metric === 'HUMIDITY') expression = 'bme.readHumidity()';
    if (metric === 'PRESSURE_HPA') expression = '(bme.readPressure() / 100.0F)';
    if (metric === 'ALTITUDE_M') expression = 'bme.readAltitude(1013.25)';
    return [expression, (arduinoGenerator as any).ORDER_ATOMIC];
};

(arduinoGenerator as any).forBlock['arduino_bh1750_init'] = function () {
    (arduinoGenerator as any).setups_['bh1750_global'] = '#include <Wire.h>\n#include <BH1750.h>\nBH1750 lightMeter;';
    (arduinoGenerator as any).setups_['bh1750_begin'] = '  Wire.begin();\n  lightMeter.begin();';
    return '';
};

(arduinoGenerator as any).forBlock['arduino_bh1750_read'] = function () {
    (arduinoGenerator as any).setups_['bh1750_global'] = '#include <Wire.h>\n#include <BH1750.h>\nBH1750 lightMeter;';
    (arduinoGenerator as any).setups_['bh1750_begin'] = '  Wire.begin();\n  lightMeter.begin();';
    return ['lightMeter.readLightLevel()', (arduinoGenerator as any).ORDER_ATOMIC];
};
(arduinoGenerator as any).forBlock['arduino_setup_loop'] = function (block: Blockly.Block) {
    const setupCode = (arduinoGenerator as any).statementToCode(block, 'SETUP') || '';
    const loopCode = (arduinoGenerator as any).statementToCode(block, 'LOOP') || '';
    (arduinoGenerator as any).setups_['__setup_code__'] = setupCode;
    (arduinoGenerator as any).setups_['__loop_code__'] = loopCode;
    return '';
};

(arduinoGenerator as any).forBlock['arduino_on_start'] = function (block: Blockly.Block) {
    const setupCode = (arduinoGenerator as any).statementToCode(block, 'SETUP') || '';
    const existing = (arduinoGenerator as any).setups_['__setup_code__'] || '';
    (arduinoGenerator as any).setups_['__setup_code__'] = existing + setupCode;
    return '';
};

(arduinoGenerator as any).forBlock['arduino_forever'] = function (block: Blockly.Block) {
    const loopCode = (arduinoGenerator as any).statementToCode(block, 'LOOP') || '';
    const existing = (arduinoGenerator as any).setups_['__loop_code__'] || '';
    (arduinoGenerator as any).setups_['__loop_code__'] = existing + loopCode;
    return '';
};

(arduinoGenerator as any).forBlock['oled_init'] = function (block: Blockly.Block) {
    const width = block.getFieldValue('WIDTH');
    const height = block.getFieldValue('HEIGHT');
    (arduinoGenerator as any).setups_['include_wire'] = '#include <Wire.h>';
    (arduinoGenerator as any).setups_['include_adafruit_gfx'] = '#include <Adafruit_GFX.h>';
    (arduinoGenerator as any).setups_['include_adafruit_ssd1306'] = '#include <Adafruit_SSD1306.h>';
    (arduinoGenerator as any).setups_['declare_display'] = `Adafruit_SSD1306 display(${width}, ${height}, &Wire, -1);`;
    (arduinoGenerator as any).setups_['init_display'] = `  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {\n    for(;;);\n  }\n  display.clearDisplay();\n  display.setTextColor(WHITE);`;
    return '';
};

(arduinoGenerator as any).forBlock['oled_clear'] = function (block: Blockly.Block) {
    return '  display.clearDisplay();\n  display.display();\n';
};

(arduinoGenerator as any).forBlock['oled_print'] = function (block: Blockly.Block) {
    const x = (arduinoGenerator as any).valueToCode(block, 'X', (arduinoGenerator as any).ORDER_NONE) || '0';
    const y = (arduinoGenerator as any).valueToCode(block, 'Y', (arduinoGenerator as any).ORDER_NONE) || '0';
    const text = (arduinoGenerator as any).valueToCode(block, 'TEXT', (arduinoGenerator as any).ORDER_NONE) || '""';
    return `  display.setCursor(${x}, ${y});\n  display.print(${text});\n  display.display();\n`;
};

(arduinoGenerator as any).forBlock['lcd_i2c_init'] = function (block: Blockly.Block) {
    const address = block.getFieldValue('ADDRESS') || '0x27';
    const cols = block.getFieldValue('COLS') || '16';
    const rows = block.getFieldValue('ROWS') || '2';
    (arduinoGenerator as any).setups_['lcd_i2c_global'] = `#include <Wire.h>\n#include <LiquidCrystal_I2C.h>\nLiquidCrystal_I2C lcd(${address}, ${cols}, ${rows});`;
    (arduinoGenerator as any).setups_['lcd_i2c_begin'] = '  lcd.init();\n  lcd.backlight();';
    return '';
};

(arduinoGenerator as any).forBlock['lcd_i2c_clear'] = function () {
    if (!(arduinoGenerator as any).setups_['lcd_i2c_global']) {
        (arduinoGenerator as any).setups_['lcd_i2c_global'] = '#include <Wire.h>\n#include <LiquidCrystal_I2C.h>\nLiquidCrystal_I2C lcd(0x27, 16, 2);';
    }
    if (!(arduinoGenerator as any).setups_['lcd_i2c_begin']) {
        (arduinoGenerator as any).setups_['lcd_i2c_begin'] = '  lcd.init();\n  lcd.backlight();';
    }
    return '  lcd.clear();\n';
};

(arduinoGenerator as any).forBlock['lcd_i2c_print'] = function (block: Blockly.Block) {
    const text = (arduinoGenerator as any).valueToCode(block, 'TEXT', (arduinoGenerator as any).ORDER_NONE) || '""';
    const col = (arduinoGenerator as any).valueToCode(block, 'COL', (arduinoGenerator as any).ORDER_NONE) || '0';
    const row = (arduinoGenerator as any).valueToCode(block, 'ROW', (arduinoGenerator as any).ORDER_NONE) || '0';
    if (!(arduinoGenerator as any).setups_['lcd_i2c_global']) {
        (arduinoGenerator as any).setups_['lcd_i2c_global'] = '#include <Wire.h>\n#include <LiquidCrystal_I2C.h>\nLiquidCrystal_I2C lcd(0x27, 16, 2);';
    }
    if (!(arduinoGenerator as any).setups_['lcd_i2c_begin']) {
        (arduinoGenerator as any).setups_['lcd_i2c_begin'] = '  lcd.init();\n  lcd.backlight();';
    }
    return `  lcd.setCursor(${col}, ${row});\n  lcd.print(${text});\n`;
};
(arduinoGenerator as any).forBlock['neopixel_init'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const count = block.getFieldValue('COUNT');
    (arduinoGenerator as any).setups_['include_neopixel'] = '#include <Adafruit_NeoPixel.h>';
    (arduinoGenerator as any).setups_[`declare_strip_${pin}`] = `Adafruit_NeoPixel pixels_${pin}(${count}, ${pin}, NEO_GRB + NEO_KHZ800);`;
    (arduinoGenerator as any).setups_[`init_strip_${pin}`] = `  pixels_${pin}.begin();`;
    return '';
};

(arduinoGenerator as any).forBlock['neopixel_set_color'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const index = (arduinoGenerator as any).valueToCode(block, 'INDEX', (arduinoGenerator as any).ORDER_NONE) || '0';
    const r = (arduinoGenerator as any).valueToCode(block, 'R', (arduinoGenerator as any).ORDER_NONE) || '0';
    const g = (arduinoGenerator as any).valueToCode(block, 'G', (arduinoGenerator as any).ORDER_NONE) || '0';
    const b = (arduinoGenerator as any).valueToCode(block, 'B', (arduinoGenerator as any).ORDER_NONE) || '0';
    return `  pixels_${pin}.setPixelColor(${index}, pixels_${pin}.Color(${r}, ${g}, ${b}));\n`;
};

(arduinoGenerator as any).forBlock['neopixel_show'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    return `  pixels_${pin}.show();\n`;
};

(arduinoGenerator as any).forBlock['neopixel_clear'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    return `  pixels_${pin}.clear();\n  pixels_${pin}.show();\n`;
};

(arduinoGenerator as any).forBlock['motor_forward'] = function (block: Blockly.Block) {
    const pin1 = block.getFieldValue('PIN1');
    const pin2 = block.getFieldValue('PIN2');
    const speed = (arduinoGenerator as any).valueToCode(block, 'SPEED', (arduinoGenerator as any).ORDER_NONE) || '255';
    (arduinoGenerator as any).setups_[`motor_pinMode_${pin1}`] = `  pinMode(${pin1}, OUTPUT);`;
    (arduinoGenerator as any).setups_[`motor_pinMode_${pin2}`] = `  pinMode(${pin2}, OUTPUT);`;
    return `  analogWrite(${pin1}, ${speed});\n  digitalWrite(${pin2}, LOW);\n`;
};

(arduinoGenerator as any).forBlock['motor_backward'] = function (block: Blockly.Block) {
    const pin1 = block.getFieldValue('PIN1');
    const pin2 = block.getFieldValue('PIN2');
    const speed = (arduinoGenerator as any).valueToCode(block, 'SPEED', (arduinoGenerator as any).ORDER_NONE) || '255';
    (arduinoGenerator as any).setups_[`motor_pinMode_${pin1}`] = `  pinMode(${pin1}, OUTPUT);`;
    (arduinoGenerator as any).setups_[`motor_pinMode_${pin2}`] = `  pinMode(${pin2}, OUTPUT);`;
    return `  digitalWrite(${pin1}, LOW);\n  analogWrite(${pin2}, ${speed});\n`;
};

(arduinoGenerator as any).forBlock['motor_stop'] = function (block: Blockly.Block) {
    const pin1 = block.getFieldValue('PIN1');
    const pin2 = block.getFieldValue('PIN2');
    (arduinoGenerator as any).setups_[`motor_pinMode_${pin1}`] = `  pinMode(${pin1}, OUTPUT);`;
    (arduinoGenerator as any).setups_[`motor_pinMode_${pin2}`] = `  pinMode(${pin2}, OUTPUT);`;
    return `  digitalWrite(${pin1}, LOW);\n  digitalWrite(${pin2}, LOW);\n`;
};

(arduinoGenerator as any).forBlock['arduino_l298n_drive'] = function (block: Blockly.Block) {
    const en = block.getFieldValue('EN');
    const in1 = block.getFieldValue('IN1');
    const in2 = block.getFieldValue('IN2');
    const dir = block.getFieldValue('DIR') || 'STOP';
    const speed = (arduinoGenerator as any).valueToCode(block, 'SPEED', (arduinoGenerator as any).ORDER_NONE) || '255';
    const pwm = `constrain(${speed}, 0, 255)`;

    (arduinoGenerator as any).setups_[`l298_en_${en}`] = `  pinMode(${en}, OUTPUT);`;
    (arduinoGenerator as any).setups_[`l298_in1_${in1}`] = `  pinMode(${in1}, OUTPUT);`;
    (arduinoGenerator as any).setups_[`l298_in2_${in2}`] = `  pinMode(${in2}, OUTPUT);`;

    if (dir === 'FORWARD') {
        return `  analogWrite(${en}, ${pwm});\n  digitalWrite(${in1}, HIGH);\n  digitalWrite(${in2}, LOW);\n`;
    }
    if (dir === 'REVERSE') {
        return `  analogWrite(${en}, ${pwm});\n  digitalWrite(${in1}, LOW);\n  digitalWrite(${in2}, HIGH);\n`;
    }
    if (dir === 'BRAKE') {
        return `  analogWrite(${en}, ${pwm});\n  digitalWrite(${in1}, HIGH);\n  digitalWrite(${in2}, HIGH);\n`;
    }
    return `  analogWrite(${en}, 0);\n  digitalWrite(${in1}, LOW);\n  digitalWrite(${in2}, LOW);\n`;
};
// -- Standard Blocks (Loops, Math, Text) --
(arduinoGenerator as any).ORDER_ATOMIC = 0;
(arduinoGenerator as any).ORDER_NONE = 99;

(arduinoGenerator as any).forBlock['math_number'] = function (block: Blockly.Block) {
    return [block.getFieldValue('NUM'), (arduinoGenerator as any).ORDER_ATOMIC];
};

(arduinoGenerator as any).forBlock['math_single'] = function (block: Blockly.Block) {
    const operator = block.getFieldValue('OP');
    const arg = (arduinoGenerator as any).valueToCode(block, 'NUM', (arduinoGenerator as any).ORDER_NONE) || '0';
    let code;
    if (operator === 'ROOT') code = `sqrt(${arg})`;
    else if (operator === 'ABS') code = `abs(${arg})`;
    else if (operator === 'NEG') code = `-${arg}`;
    else if (operator === 'LN') code = `log(${arg})`;
    else if (operator === 'LOG10') code = `log10(${arg})`;
    else if (operator === 'EXP') code = `exp(${arg})`;
    else if (operator === 'POW10') code = `pow(10, ${arg})`;
    else code = `(${arg})`;
    return [code, (arduinoGenerator as any).ORDER_ATOMIC];
};

(arduinoGenerator as any).forBlock['math_arithmetic'] = function (block: Blockly.Block) {
    const operator = block.getFieldValue('OP');
    const argument0 = (arduinoGenerator as any).valueToCode(block, 'A', (arduinoGenerator as any).ORDER_NONE) || '0';
    const argument1 = (arduinoGenerator as any).valueToCode(block, 'B', (arduinoGenerator as any).ORDER_NONE) || '0';

    if (operator === 'POWER') {
        return [`pow(${argument0}, ${argument1})`, (arduinoGenerator as any).ORDER_ATOMIC];
    }

    const operatorMap: Record<string, string> = {
        ADD: '+',
        MINUS: '-',
        MULTIPLY: '*',
        DIVIDE: '/'
    };
    const op = operatorMap[operator] || '+';
    return [`(${argument0} ${op} ${argument1})`, (arduinoGenerator as any).ORDER_ATOMIC];
};

(arduinoGenerator as any).forBlock['logic_boolean'] = function (block: Blockly.Block) {
    return [block.getFieldValue('BOOL') === 'TRUE' ? 'true' : 'false', (arduinoGenerator as any).ORDER_ATOMIC];
};

(arduinoGenerator as any).forBlock['logic_compare'] = function (block: Blockly.Block) {
    const operator = block.getFieldValue('OP');
    const argument0 = (arduinoGenerator as any).valueToCode(block, 'A', (arduinoGenerator as any).ORDER_NONE) || '0';
    const argument1 = (arduinoGenerator as any).valueToCode(block, 'B', (arduinoGenerator as any).ORDER_NONE) || '0';
    const operatorMap: Record<string, string> = {
        EQ: '==',
        NEQ: '!=',
        LT: '<',
        LTE: '<=',
        GT: '>',
        GTE: '>='
    };
    const op = operatorMap[operator] || '==';
    return [`(${argument0} ${op} ${argument1})`, (arduinoGenerator as any).ORDER_ATOMIC];
};

(arduinoGenerator as any).forBlock['logic_operation'] = function (block: Blockly.Block) {
    const operator = block.getFieldValue('OP');
    const argument0 = (arduinoGenerator as any).valueToCode(block, 'A', (arduinoGenerator as any).ORDER_NONE) || 'false';
    const argument1 = (arduinoGenerator as any).valueToCode(block, 'B', (arduinoGenerator as any).ORDER_NONE) || 'false';
    const op = operator === 'AND' ? '&&' : '||';
    return [`(${argument0} ${op} ${argument1})`, (arduinoGenerator as any).ORDER_ATOMIC];
};

(arduinoGenerator as any).forBlock['logic_negate'] = function (block: Blockly.Block) {
    const argument0 = (arduinoGenerator as any).valueToCode(block, 'BOOL', (arduinoGenerator as any).ORDER_NONE) || 'false';
    return [`(!(${argument0}))`, (arduinoGenerator as any).ORDER_ATOMIC];
};

(arduinoGenerator as any).forBlock['controls_if'] = function (block: Blockly.Block) {
    let n = 0;
    let code = '';

    do {
        const condition = (arduinoGenerator as any).valueToCode(block, `IF${n}`, (arduinoGenerator as any).ORDER_NONE) || 'false';
        const branch = (arduinoGenerator as any).statementToCode(block, `DO${n}`) || '';
        code += n === 0
            ? `  if (${condition}) {\n${branch}  }\n`
            : `  else if (${condition}) {\n${branch}  }\n`;
        n++;
    } while (block.getInput(`IF${n}`));

    if (block.getInput('ELSE')) {
        const elseBranch = (arduinoGenerator as any).statementToCode(block, 'ELSE') || '';
        code += `  else {\n${elseBranch}  }\n`;
    }

    return code;
};

(arduinoGenerator as any).forBlock['text_print'] = function (block: Blockly.Block) {
    const text = (arduinoGenerator as any).valueToCode(block, 'TEXT', (arduinoGenerator as any).ORDER_NONE) || '""';
    (arduinoGenerator as any).setups_['serial_begin'] = '  Serial.begin(9600);';
    return `  Serial.println(${text});\n`;
};

(arduinoGenerator as any).forBlock['controls_whileUntil'] = function (block: Blockly.Block) {
    const until = block.getFieldValue('MODE') === 'UNTIL';
    const argument0 = (arduinoGenerator as any).valueToCode(block, 'BOOL', (arduinoGenerator as any).ORDER_NONE) || 'false';
    const branch = (arduinoGenerator as any).statementToCode(block, 'DO') || '';
    if (until) {
        return `  while (!(${argument0})) {\n${branch}  }\n`;
    }
    return `  while (${argument0}) {\n${branch}  }\n`;
};

(arduinoGenerator as any).forBlock['controls_repeat_ext'] = function (block: Blockly.Block) {
    const repeats = (arduinoGenerator as any).valueToCode(block, 'TIMES', (arduinoGenerator as any).ORDER_NONE) || '0';
    const branch = (arduinoGenerator as any).statementToCode(block, 'DO') || '';
    return `  for (int count = 0; count < ${repeats}; count++) {\n${branch}  }\n`;
};

(arduinoGenerator as any).forBlock['text'] = function (block: Blockly.Block) {
    return ['"' + block.getFieldValue('TEXT') + '"', (arduinoGenerator as any).ORDER_ATOMIC];
};

// ----------------------------------------------------------------------------
// 2. MICROPYTHON GENERATOR
// ----------------------------------------------------------------------------
export const micropythonGenerator = new Blockly.CodeGenerator('MicroPython');
micropythonGenerator.INDENT = '    ';

function getMicroPythonState(generator: Blockly.CodeGenerator) {
    const state = generator as any;
    if (!state.imports_) {
        state.imports_ = new Set<string>();
    }
    if (!state.setups_) {
        state.setups_ = Object.create(null);
    }
    return state as { imports_: Set<string>; setups_: Record<string, string> };
}

(micropythonGenerator as any).init = function (workspace: Blockly.Workspace) {
    const state = getMicroPythonState(this as Blockly.CodeGenerator);
    state.imports_.clear();
    state.setups_ = Object.create(null);
};

(micropythonGenerator as any).finish = function (code: string) {
    // We do NOT wrap the code anymore, the template system handles it
    return code;
};

function getMicroPythonImports(generator: Blockly.CodeGenerator) {
    const state = getMicroPythonState(generator);
    const imports: string[] = [];

    if (state.imports_.has('machine')) imports.push('import machine');
    if (state.imports_.has('time')) imports.push('import time');
    if (state.imports_.has('math')) imports.push('import math');
    if (state.imports_.has('random')) imports.push('import random');
    if (state.imports_.has('array')) imports.push('import array');
    if (state.imports_.has('dht')) imports.push('import dht');
    if (state.imports_.has('bme280')) imports.push('import bme280');
    if (state.imports_.has('bh1750')) imports.push('import bh1750');
    if (state.imports_.has('ssd1306')) imports.push('import ssd1306');
    if (state.imports_.has('neopixel')) imports.push('import neopixel');
    if (state.imports_.has('pico_i2c_lcd')) imports.push('from pico_i2c_lcd import I2cLcd');

    return Array.from(new Set(imports));
}
(micropythonGenerator as any).getImports = function () {
    return getMicroPythonImports(this as Blockly.CodeGenerator);
};

function dedentMicroPython(code: string) {
    if (!code) return '';
    const indent = micropythonGenerator.INDENT || '    ';
    return code
        .split('\n')
        .map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line))
        .join('\n');
}
(micropythonGenerator as any).scrub_ = function (block: Blockly.Block, code: string, opt_thisOnly?: boolean): string {
    const nextBlock = block.nextConnection && block.nextConnection.targetBlock();
    const nextCode = opt_thisOnly ? '' : this.blockToCode(nextBlock);
    return code + nextCode;
};

// -- MicroPython Blocks --
(micropythonGenerator as any).forBlock['arduino_pinMode'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const mode = block.getFieldValue('MODE') === 'OUTPUT' ? 'machine.Pin.OUT' : 'machine.Pin.IN';
    const state = getMicroPythonState(micropythonGenerator);
    state.imports_.add('machine');
    state.setups_[`pinMode_${pin}`] = `pin_${pin} = machine.Pin(${pin}, ${mode})`;
    return '';
};

(micropythonGenerator as any).forBlock['arduino_digitalWrite'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const state = block.getFieldValue('STATE') === 'HIGH' ? '1' : '0';
    return `pin_${pin}.value(${state})\n`;
};

(micropythonGenerator as any).forBlock['arduino_board_led'] = function (block: Blockly.Block) {
    const state = getMicroPythonState(micropythonGenerator);
    state.imports_.add('machine');
    state.setups_['board_led_helper'] = `def _sticial_board_led():
    for candidate in ("LED", 25, 2):
        try:
            return machine.Pin(candidate, machine.Pin.OUT)
        except Exception:
            pass
    raise RuntimeError("Built-in LED pin is not available on this board")`;
    state.setups_['board_led_init'] = 'board_led = _sticial_board_led()';
    return `board_led.value(${block.getFieldValue('STATE') === 'HIGH' ? '1' : '0'})\n`;
};

function getMicroPythonLedConfig(block: Blockly.Block) {
    const rawSensor = block.getFieldValue('SENSOR') || block.getFieldValue('PIN') || '2';
    const pin = resolveComponentNamedPinOrPin(rawSensor, 'SIG', resolveComponentOrPin(rawSensor, '2'));
    return {
        identifier: getInstanceIdentifier(rawSensor, 'led', pin),
        pin,
    };
}

(micropythonGenerator as any).forBlock['arduino_led_set'] = function (block: Blockly.Block) {
    const state = getMicroPythonState(micropythonGenerator);
    const { identifier, pin } = getMicroPythonLedConfig(block);
    state.imports_.add('machine');
    state.setups_[`led_${identifier}`] = `led_${identifier} = machine.Pin(${pin}, machine.Pin.OUT)`;
    return `led_${identifier}.value(${block.getFieldValue('STATE') === 'HIGH' ? '1' : '0'})\n`;
};
(micropythonGenerator as any).forBlock['arduino_delay'] = function (block: Blockly.Block) {
    const ms = block.getFieldValue('MS');
    getMicroPythonState(micropythonGenerator).imports_.add('time');
    return `time.sleep_ms(${ms})\n`;
};

(micropythonGenerator as any).forBlock['time_delay'] = function (block: Blockly.Block) {
    const ms = (micropythonGenerator as any).valueToCode(block, 'MS', (micropythonGenerator as any).ORDER_NONE) || '0';
    getMicroPythonState(micropythonGenerator).imports_.add('time');
    return `time.sleep_ms(int(${ms}))\n`;
};

(micropythonGenerator as any).forBlock['time_wait_seconds'] = function (block: Blockly.Block) {
    const seconds = (micropythonGenerator as any).valueToCode(block, 'SECONDS', (micropythonGenerator as any).ORDER_NONE) || '0';
    getMicroPythonState(micropythonGenerator).imports_.add('time');
    return `time.sleep(${seconds})\n`;
};

(micropythonGenerator as any).forBlock['time_wait_until'] = function (block: Blockly.Block) {
    const condition = (micropythonGenerator as any).valueToCode(block, 'BOOL', (micropythonGenerator as any).ORDER_NONE) || 'False';
    getMicroPythonState(micropythonGenerator).imports_.add('time');
    const indent = micropythonGenerator.INDENT || '    ';
    return `while not (${condition}):\n${indent}time.sleep_ms(1)\n`;
};

(micropythonGenerator as any).forBlock['arduino_digitalRead'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const state = getMicroPythonState(micropythonGenerator);
    state.imports_.add('machine');
    state.setups_[`pinMode_${pin}`] = `pin_${pin} = machine.Pin(${pin}, machine.Pin.IN)`;
    return [`pin_${pin}.value()`, (micropythonGenerator as any).ORDER_ATOMIC];
};

(micropythonGenerator as any).forBlock['arduino_analogRead'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const pinNum = pin.replace('A', '');
    const state = getMicroPythonState(micropythonGenerator);
    state.imports_.add('machine');
    state.setups_[`adc_${pin}`] = `adc_${pin} = machine.ADC(machine.Pin(${pinNum}))`;
    return [`adc_${pin}.read()`, (micropythonGenerator as any).ORDER_ATOMIC];
};

(micropythonGenerator as any).forBlock['arduino_analogWrite'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const value = (micropythonGenerator as any).valueToCode(block, 'VALUE', (micropythonGenerator as any).ORDER_NONE) || '0';
    const state = getMicroPythonState(micropythonGenerator);
    state.imports_.add('machine');
    state.setups_[`pwm_${pin}`] = `pwm_${pin} = machine.PWM(machine.Pin(${pin}))\npwm_${pin}.freq(1000)`;
    // Map standard Arduino 8-bit (0-255) to 10-bit typical micropython mapping
    return `pwm_${pin}.duty(int(${value}) * 4)\n`;
};

(micropythonGenerator as any).forBlock['arduino_tone_pin'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const freq = (micropythonGenerator as any).valueToCode(block, 'FREQ', (micropythonGenerator as any).ORDER_NONE) || '1000';
    const state = getMicroPythonState(micropythonGenerator);
    state.imports_.add('machine');
    state.setups_[`tone_pwm_${pin}`] = `tone_pwm_${pin} = machine.PWM(machine.Pin(${pin}))\ntone_pwm_${pin}.duty_u16(0)`;
    return `tone_pwm_${pin}.freq(int(${freq}))\ntone_pwm_${pin}.duty_u16(32768)\n`;
};

(micropythonGenerator as any).forBlock['arduino_tone_pin_duration'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const freq = (micropythonGenerator as any).valueToCode(block, 'FREQ', (micropythonGenerator as any).ORDER_NONE) || '1000';
    const duration = (micropythonGenerator as any).valueToCode(block, 'DUR', (micropythonGenerator as any).ORDER_NONE) || '250';
    const state = getMicroPythonState(micropythonGenerator);
    state.imports_.add('machine');
    state.imports_.add('time');
    state.setups_[`tone_pwm_${pin}`] = `tone_pwm_${pin} = machine.PWM(machine.Pin(${pin}))\ntone_pwm_${pin}.duty_u16(0)`;
    return `tone_pwm_${pin}.freq(int(${freq}))\ntone_pwm_${pin}.duty_u16(32768)\ntime.sleep_ms(int(${duration}))\ntone_pwm_${pin}.duty_u16(0)\n`;
};

(micropythonGenerator as any).forBlock['arduino_no_tone_pin'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const state = getMicroPythonState(micropythonGenerator);
    state.imports_.add('machine');
    state.setups_[`tone_pwm_${pin}`] = `tone_pwm_${pin} = machine.PWM(machine.Pin(${pin}))\ntone_pwm_${pin}.duty_u16(0)`;
    return `tone_pwm_${pin}.duty_u16(0)\n`;
};
(micropythonGenerator as any).forBlock['arduino_millis'] = function (block: Blockly.Block) {
    getMicroPythonState(micropythonGenerator).imports_.add('time');
    return [`time.ticks_ms()`, (micropythonGenerator as any).ORDER_ATOMIC];
};

(micropythonGenerator as any).forBlock['arduino_serialPrint'] = function (block: Blockly.Block) {
    const text = (micropythonGenerator as any).valueToCode(block, 'TEXT', (micropythonGenerator as any).ORDER_NONE) || '""';
    return `print(${text}, end="")\n`;
};

(micropythonGenerator as any).forBlock['arduino_serialPrintln'] = function (block: Blockly.Block) {
    const text = (micropythonGenerator as any).valueToCode(block, 'TEXT', (micropythonGenerator as any).ORDER_NONE) || '""';
    return `print(${text})\n`;
};

(micropythonGenerator as any).forBlock['arduino_serialBegin'] = function () {
    return '';
};

(micropythonGenerator as any).forBlock['arduino_hc05_init'] = function (block: Blockly.Block) {
    const rx = block.getFieldValue('RX') || '10';
    const tx = block.getFieldValue('TX') || '11';
    const baud = block.getFieldValue('BAUD') || '9600';
    getMicroPythonState(micropythonGenerator).imports_.add('machine');
    getMicroPythonState(micropythonGenerator).imports_.add('time');
    (micropythonGenerator as any).setups_['hc05_uart'] = `hc05_uart = machine.UART(1, baudrate=${baud}, tx=machine.Pin(${tx}), rx=machine.Pin(${rx}))`;
    (micropythonGenerator as any).setups_['hc05_reader'] = `def hc05_read_byte():\n    data = hc05_uart.read(1)\n    if not data:\n        return -1\n    return data[0]`;
    return '';
};

(micropythonGenerator as any).forBlock['arduino_hc05_send'] = function (block: Blockly.Block) {
    const text = (micropythonGenerator as any).valueToCode(block, 'TEXT', (micropythonGenerator as any).ORDER_NONE) || '""';
    if (!(micropythonGenerator as any).setups_['hc05_uart']) {
        getMicroPythonState(micropythonGenerator).imports_.add('machine');
    getMicroPythonState(micropythonGenerator).imports_.add('time');
        (micropythonGenerator as any).setups_['hc05_uart'] = 'hc05_uart = machine.UART(1, baudrate=9600, tx=machine.Pin(11), rx=machine.Pin(10))';
    }
    return `hc05_uart.write(str(${text}) + "\\n")\n`;
};

(micropythonGenerator as any).forBlock['arduino_hc05_available'] = function () {
    if (!(micropythonGenerator as any).setups_['hc05_uart']) {
        getMicroPythonState(micropythonGenerator).imports_.add('machine');
    getMicroPythonState(micropythonGenerator).imports_.add('time');
        (micropythonGenerator as any).setups_['hc05_uart'] = 'hc05_uart = machine.UART(1, baudrate=9600, tx=machine.Pin(11), rx=machine.Pin(10))';
    }
    return ['hc05_uart.any()', (micropythonGenerator as any).ORDER_ATOMIC];
};

(micropythonGenerator as any).forBlock['arduino_hc05_read_byte'] = function () {
    if (!(micropythonGenerator as any).setups_['hc05_uart']) {
        getMicroPythonState(micropythonGenerator).imports_.add('machine');
    getMicroPythonState(micropythonGenerator).imports_.add('time');
        (micropythonGenerator as any).setups_['hc05_uart'] = 'hc05_uart = machine.UART(1, baudrate=9600, tx=machine.Pin(11), rx=machine.Pin(10))';
    }
    if (!(micropythonGenerator as any).setups_['hc05_reader']) {
        (micropythonGenerator as any).setups_['hc05_reader'] = 'def hc05_read_byte():\n    data = hc05_uart.read(1)\n    if not data:\n        return -1\n    return data[0]';
    }
    return ['hc05_read_byte()', (micropythonGenerator as any).ORDER_ATOMIC];
};

(micropythonGenerator as any).forBlock['arduino_ir_init'] = function () {
    return '# IR receiver blocks are Arduino-only in this phase\n';
};

(micropythonGenerator as any).forBlock['arduino_ir_read_code'] = function () {
    return ['0', (micropythonGenerator as any).ORDER_ATOMIC];
};

(micropythonGenerator as any).forBlock['arduino_keypad_init'] = function () {
    return '# Keypad blocks are Arduino-only in this phase\n';
};

(micropythonGenerator as any).forBlock['arduino_keypad_get_key'] = function () {
    return ['""', (micropythonGenerator as any).ORDER_ATOMIC];
};

(micropythonGenerator as any).forBlock['arduino_relay_write'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const state = block.getFieldValue('STATE') === 'HIGH' ? '1' : '0';
    getMicroPythonState(micropythonGenerator).imports_.add('machine');
    getMicroPythonState(micropythonGenerator).imports_.add('time');
    (micropythonGenerator as any).setups_[`relay_${pin}`] = `relay_${pin} = machine.Pin(${pin}, machine.Pin.OUT)`;
    return `relay_${pin}.value(${state})\n`;
};

(micropythonGenerator as any).forBlock['arduino_buzzer_tone'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const freq = (micropythonGenerator as any).valueToCode(block, 'FREQ', (micropythonGenerator as any).ORDER_NONE) || '1000';
    const duration = (micropythonGenerator as any).valueToCode(block, 'DURATION', (micropythonGenerator as any).ORDER_NONE) || '250';
    getMicroPythonState(micropythonGenerator).imports_.add('machine');
    getMicroPythonState(micropythonGenerator).imports_.add('time');
    (micropythonGenerator as any).setups_[`buzzer_${pin}`] = `buzzer_${pin} = machine.PWM(machine.Pin(${pin}))`;
    return `buzzer_${pin}.freq(int(${freq}))\nbuzzer_${pin}.duty_u16(32768)\ntime.sleep_ms(int(${duration}))\nbuzzer_${pin}.duty_u16(0)\n`;
};

(micropythonGenerator as any).forBlock['arduino_buzzer_stop'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    getMicroPythonState(micropythonGenerator).imports_.add('machine');
    getMicroPythonState(micropythonGenerator).imports_.add('time');
    (micropythonGenerator as any).setups_[`buzzer_${pin}`] = `buzzer_${pin} = machine.PWM(machine.Pin(${pin}))`;
    return `buzzer_${pin}.duty_u16(0)\n`;
};

(micropythonGenerator as any).forBlock['arduino_pir_read'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    getMicroPythonState(micropythonGenerator).imports_.add('machine');
    getMicroPythonState(micropythonGenerator).imports_.add('time');
    (micropythonGenerator as any).setups_[`pir_${pin}`] = `pir_${pin} = machine.Pin(${pin}, machine.Pin.IN)`;
    return [`pir_${pin}.value()`, (micropythonGenerator as any).ORDER_ATOMIC];
};

(micropythonGenerator as any).forBlock['arduino_touch_read'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    getMicroPythonState(micropythonGenerator).imports_.add('machine');
    getMicroPythonState(micropythonGenerator).imports_.add('time');
    (micropythonGenerator as any).setups_[`touch_${pin}`] = `touch_${pin} = machine.Pin(${pin}, machine.Pin.IN)`;
    return [`touch_${pin}.value()`, (micropythonGenerator as any).ORDER_ATOMIC];
};

(micropythonGenerator as any).forBlock['arduino_soil_moisture_read'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const pinNum = String(pin).replace('A', '');
    getMicroPythonState(micropythonGenerator).imports_.add('machine');
    getMicroPythonState(micropythonGenerator).imports_.add('time');
    (micropythonGenerator as any).setups_[`soil_adc_${pin}`] = `soil_adc_${pin} = machine.ADC(machine.Pin(${pinNum}))`;
    return [`soil_adc_${pin}.read_u16()`, (micropythonGenerator as any).ORDER_ATOMIC];
};

(micropythonGenerator as any).forBlock['arduino_rain_read'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const pinNum = String(pin).replace('A', '');
    getMicroPythonState(micropythonGenerator).imports_.add('machine');
    getMicroPythonState(micropythonGenerator).imports_.add('time');
    (micropythonGenerator as any).setups_[`rain_adc_${pin}`] = `rain_adc_${pin} = machine.ADC(machine.Pin(${pinNum}))`;
    return [`rain_adc_${pin}.read_u16()`, (micropythonGenerator as any).ORDER_ATOMIC];
};

(micropythonGenerator as any).forBlock['arduino_water_level_read'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const pinNum = String(pin).replace('A', '');
    getMicroPythonState(micropythonGenerator).imports_.add('machine');
    getMicroPythonState(micropythonGenerator).imports_.add('time');
    (micropythonGenerator as any).setups_[`water_adc_${pin}`] = `water_adc_${pin} = machine.ADC(machine.Pin(${pinNum}))`;
    return [`water_adc_${pin}.read_u16()`, (micropythonGenerator as any).ORDER_ATOMIC];
};

(micropythonGenerator as any).forBlock['arduino_dht_init'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const type = block.getFieldValue('TYPE') || 'DHT11';
    const dhtClass = type === 'DHT22' ? 'DHT22' : 'DHT11';
    getMicroPythonState(micropythonGenerator).imports_.add('machine');
    getMicroPythonState(micropythonGenerator).imports_.add('time');
    getMicroPythonState(micropythonGenerator).imports_.add('dht');
    (micropythonGenerator as any).setups_[`dht_${pin}`] = `dht_${pin} = dht.${dhtClass}(machine.Pin(${pin}))`;
    return '';
};

(micropythonGenerator as any).forBlock['arduino_dht_read'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const type = block.getFieldValue('TYPE') || 'DHT11';
    const metric = block.getFieldValue('METRIC') || 'TEMP_C';
    const dhtClass = type === 'DHT22' ? 'DHT22' : 'DHT11';
    const helperName = metric === 'HUMIDITY' ? `read_dht_h_${pin}` : `read_dht_t_${pin}`;
    const returnLine = metric === 'HUMIDITY'
        ? `    return dht_${pin}.humidity()`
        : `    return dht_${pin}.temperature()`;

    getMicroPythonState(micropythonGenerator).imports_.add('machine');
    getMicroPythonState(micropythonGenerator).imports_.add('time');
    getMicroPythonState(micropythonGenerator).imports_.add('dht');
    (micropythonGenerator as any).setups_[`dht_${pin}`] = `dht_${pin} = dht.${dhtClass}(machine.Pin(${pin}))`;
    (micropythonGenerator as any).setups_[helperName] = `def ${helperName}():\n    dht_${pin}.measure()\n${returnLine}`;
    return [`${helperName}()`, (micropythonGenerator as any).ORDER_ATOMIC];
};

(micropythonGenerator as any).forBlock['arduino_bme280_init'] = function (block: Blockly.Block) {
    const address = block.getFieldValue('ADDRESS') || '0x76';
    getMicroPythonState(micropythonGenerator).imports_.add('machine');
    getMicroPythonState(micropythonGenerator).imports_.add('time');
    getMicroPythonState(micropythonGenerator).imports_.add('bme280');
    (micropythonGenerator as any).setups_['bme280_i2c'] = 'i2c_bme280 = machine.I2C(0, scl=machine.Pin(5), sda=machine.Pin(4))';
    (micropythonGenerator as any).setups_['bme280_sensor'] = `bme = bme280.BME280(i2c=i2c_bme280, address=${address})`;
    return '';
};

(micropythonGenerator as any).forBlock['arduino_bme280_read'] = function (block: Blockly.Block) {
    const metric = block.getFieldValue('METRIC') || 'TEMP_C';
    getMicroPythonState(micropythonGenerator).imports_.add('machine');
    getMicroPythonState(micropythonGenerator).imports_.add('time');
    getMicroPythonState(micropythonGenerator).imports_.add('bme280');
    (micropythonGenerator as any).setups_['bme280_i2c'] = 'i2c_bme280 = machine.I2C(0, scl=machine.Pin(5), sda=machine.Pin(4))';
    (micropythonGenerator as any).setups_['bme280_sensor'] = 'bme = bme280.BME280(i2c=i2c_bme280, address=0x76)';

    if (metric === 'HUMIDITY') {
        return ['(float(bme.values[2].replace("%", "")))', (micropythonGenerator as any).ORDER_ATOMIC];
    }
    if (metric === 'PRESSURE_HPA') {
        return ['(float(bme.values[1].replace("hPa", "")))', (micropythonGenerator as any).ORDER_ATOMIC];
    }
    if (metric === 'ALTITUDE_M') {
        return ['0', (micropythonGenerator as any).ORDER_ATOMIC];
    }
    return ['(float(bme.values[0].replace("C", "")))', (micropythonGenerator as any).ORDER_ATOMIC];
};

(micropythonGenerator as any).forBlock['arduino_bh1750_init'] = function () {
    getMicroPythonState(micropythonGenerator).imports_.add('machine');
    getMicroPythonState(micropythonGenerator).imports_.add('time');
    getMicroPythonState(micropythonGenerator).imports_.add('bh1750');
    (micropythonGenerator as any).setups_['bh1750_i2c'] = 'i2c_bh1750 = machine.I2C(0, scl=machine.Pin(5), sda=machine.Pin(4))';
    (micropythonGenerator as any).setups_['bh1750_sensor'] = 'light_sensor = bh1750.BH1750(i2c_bh1750)';
    return '';
};

(micropythonGenerator as any).forBlock['arduino_bh1750_read'] = function () {
    getMicroPythonState(micropythonGenerator).imports_.add('machine');
    getMicroPythonState(micropythonGenerator).imports_.add('time');
    getMicroPythonState(micropythonGenerator).imports_.add('bh1750');
    (micropythonGenerator as any).setups_['bh1750_i2c'] = 'i2c_bh1750 = machine.I2C(0, scl=machine.Pin(5), sda=machine.Pin(4))';
    (micropythonGenerator as any).setups_['bh1750_sensor'] = 'light_sensor = bh1750.BH1750(i2c_bh1750)';
    return ['light_sensor.luminance(bh1750.BH1750.CONT_HIRES_1)', (micropythonGenerator as any).ORDER_ATOMIC];
};

(micropythonGenerator as any).forBlock['lcd_i2c_init'] = function (block: Blockly.Block) {
    const address = block.getFieldValue('ADDRESS') || '0x27';
    const cols = block.getFieldValue('COLS') || '16';
    const rows = block.getFieldValue('ROWS') || '2';
    getMicroPythonState(micropythonGenerator).imports_.add('machine');
    getMicroPythonState(micropythonGenerator).imports_.add('time');
    getMicroPythonState(micropythonGenerator).imports_.add('pico_i2c_lcd');
    (micropythonGenerator as any).setups_['lcd_i2c_bus'] = 'i2c_lcd = machine.I2C(0, scl=machine.Pin(5), sda=machine.Pin(4), freq=400000)';
    (micropythonGenerator as any).setups_['lcd_device'] = `lcd = I2cLcd(i2c_lcd, ${address}, ${rows}, ${cols})`;
    return '';
};

(micropythonGenerator as any).forBlock['lcd_i2c_clear'] = function () {
    if (!(micropythonGenerator as any).setups_['lcd_device']) {
        getMicroPythonState(micropythonGenerator).imports_.add('machine');
    getMicroPythonState(micropythonGenerator).imports_.add('time');
        getMicroPythonState(micropythonGenerator).imports_.add('pico_i2c_lcd');
        (micropythonGenerator as any).setups_['lcd_i2c_bus'] = 'i2c_lcd = machine.I2C(0, scl=machine.Pin(5), sda=machine.Pin(4), freq=400000)';
        (micropythonGenerator as any).setups_['lcd_device'] = 'lcd = I2cLcd(i2c_lcd, 0x27, 2, 16)';
    }
    return 'lcd.clear()\n';
};

(micropythonGenerator as any).forBlock['lcd_i2c_print'] = function (block: Blockly.Block) {
    const text = (micropythonGenerator as any).valueToCode(block, 'TEXT', (micropythonGenerator as any).ORDER_NONE) || '""';
    const col = (micropythonGenerator as any).valueToCode(block, 'COL', (micropythonGenerator as any).ORDER_NONE) || '0';
    const row = (micropythonGenerator as any).valueToCode(block, 'ROW', (micropythonGenerator as any).ORDER_NONE) || '0';
    if (!(micropythonGenerator as any).setups_['lcd_device']) {
        getMicroPythonState(micropythonGenerator).imports_.add('machine');
    getMicroPythonState(micropythonGenerator).imports_.add('time');
        getMicroPythonState(micropythonGenerator).imports_.add('pico_i2c_lcd');
        (micropythonGenerator as any).setups_['lcd_i2c_bus'] = 'i2c_lcd = machine.I2C(0, scl=machine.Pin(5), sda=machine.Pin(4), freq=400000)';
        (micropythonGenerator as any).setups_['lcd_device'] = 'lcd = I2cLcd(i2c_lcd, 0x27, 2, 16)';
    }
    return `lcd.move_to(int(${col}), int(${row}))\nlcd.putstr(str(${text}))\n`;
};

(micropythonGenerator as any).forBlock['arduino_l298n_drive'] = function (block: Blockly.Block) {
    const en = block.getFieldValue('EN');
    const in1 = block.getFieldValue('IN1');
    const in2 = block.getFieldValue('IN2');
    const dir = block.getFieldValue('DIR') || 'STOP';
    const speed = (micropythonGenerator as any).valueToCode(block, 'SPEED', (micropythonGenerator as any).ORDER_NONE) || '0';
    getMicroPythonState(micropythonGenerator).imports_.add('machine');
    getMicroPythonState(micropythonGenerator).imports_.add('time');

    if (dir === 'FORWARD') {
        return `pwm_${en} = machine.PWM(machine.Pin(${en}))\npwm_${en}.freq(1000)\npwm_${en}.duty(int(${speed}) * 4)\nmachine.Pin(${in1}, machine.Pin.OUT).value(1)\nmachine.Pin(${in2}, machine.Pin.OUT).value(0)\n`;
    }
    if (dir === 'REVERSE') {
        return `pwm_${en} = machine.PWM(machine.Pin(${en}))\npwm_${en}.freq(1000)\npwm_${en}.duty(int(${speed}) * 4)\nmachine.Pin(${in1}, machine.Pin.OUT).value(0)\nmachine.Pin(${in2}, machine.Pin.OUT).value(1)\n`;
    }
    if (dir === 'BRAKE') {
        return `pwm_${en} = machine.PWM(machine.Pin(${en}))\npwm_${en}.freq(1000)\npwm_${en}.duty(int(${speed}) * 4)\nmachine.Pin(${in1}, machine.Pin.OUT).value(1)\nmachine.Pin(${in2}, machine.Pin.OUT).value(1)\n`;
    }
    return `machine.Pin(${in1}, machine.Pin.OUT).value(0)\nmachine.Pin(${in2}, machine.Pin.OUT).value(0)\n`;
};
(micropythonGenerator as any).forBlock['arduino_servo_write'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const angle = (micropythonGenerator as any).valueToCode(block, 'ANGLE', (micropythonGenerator as any).ORDER_NONE) || '90';
    getMicroPythonState(micropythonGenerator).imports_.add('machine');
    (micropythonGenerator as any).setups_[`servo_pwm_${pin}`] = `servo_${pin} = machine.PWM(machine.Pin(${pin}), freq=50)`;
    return `servo_${pin}.duty(int((${angle} / 180) * 75 + 40))\n`;
};

(micropythonGenerator as any).forBlock['arduino_ultrasonic'] = function (block: Blockly.Block) {
    const trig = block.getFieldValue('TRIG');
    const echo = block.getFieldValue('ECHO');
    getMicroPythonState(micropythonGenerator).imports_.add('machine');
    getMicroPythonState(micropythonGenerator).imports_.add('time');
    (micropythonGenerator as any).setups_['ultrasonic_func'] = `def read_ultrasonic(trig_pin, echo_pin):\n    trig = machine.Pin(trig_pin, machine.Pin.OUT)\n    echo = machine.Pin(echo_pin, machine.Pin.IN)\n    trig.value(0)\n    time.sleep_us(2)\n    trig.value(1)\n    time.sleep_us(10)\n    trig.value(0)\n    try:\n        return machine.time_pulse_us(echo, 1, 30000) * 0.017\n    except:\n        return -1`;
    return [`read_ultrasonic(${trig}, ${echo})`, (micropythonGenerator as any).ORDER_ATOMIC];
};

(micropythonGenerator as any).forBlock['arduino_setup_loop'] = function (block: Blockly.Block) {
    const setupCode = (micropythonGenerator as any).statementToCode(block, 'SETUP') || '';
    const loopCode = (micropythonGenerator as any).statementToCode(block, 'LOOP') || '';
    (micropythonGenerator as any).setups_['__setup_code__'] = dedentMicroPython(setupCode).trimEnd();
    (micropythonGenerator as any).setups_['__loop_code__'] = dedentMicroPython(loopCode).trimEnd();
    return '';
};

(micropythonGenerator as any).forBlock['arduino_on_start'] = function (block: Blockly.Block) {
    const setupCode = dedentMicroPython((micropythonGenerator as any).statementToCode(block, 'SETUP') || '').trimEnd();
    const existing = (micropythonGenerator as any).setups_['__setup_code__'] || '';
    (micropythonGenerator as any).setups_['__setup_code__'] = [existing, setupCode].filter(Boolean).join("\n");
    return '';
};

(micropythonGenerator as any).forBlock['arduino_forever'] = function (block: Blockly.Block) {
    const loopCode = dedentMicroPython((micropythonGenerator as any).statementToCode(block, 'LOOP') || '').trimEnd();
    const existing = (micropythonGenerator as any).setups_['__loop_code__'] || '';
    (micropythonGenerator as any).setups_['__loop_code__'] = [existing, loopCode].filter(Boolean).join("\n");
    return '';
};

(micropythonGenerator as any).forBlock['oled_init'] = function (block: Blockly.Block) {
    const width = block.getFieldValue('WIDTH');
    const height = block.getFieldValue('HEIGHT');
    getMicroPythonState(micropythonGenerator).imports_.add('machine');
    getMicroPythonState(micropythonGenerator).imports_.add('time');
    getMicroPythonState(micropythonGenerator).imports_.add('ssd1306');
    (micropythonGenerator as any).setups_['init_i2c'] = 'i2c = machine.I2C(0, scl=machine.Pin(5), sda=machine.Pin(4))';
    (micropythonGenerator as any).setups_['init_display'] = `display = ssd1306.SSD1306_I2C(${width}, ${height}, i2c)`;
    return '';
};

(micropythonGenerator as any).forBlock['oled_clear'] = function (block: Blockly.Block) {
    return 'display.fill(0)\ndisplay.show()\n';
};

(micropythonGenerator as any).forBlock['oled_print'] = function (block: Blockly.Block) {
    const x = (micropythonGenerator as any).valueToCode(block, 'X', (micropythonGenerator as any).ORDER_NONE) || '0';
    const y = (micropythonGenerator as any).valueToCode(block, 'Y', (micropythonGenerator as any).ORDER_NONE) || '0';
    const text = (micropythonGenerator as any).valueToCode(block, 'TEXT', (micropythonGenerator as any).ORDER_NONE) || '""';
    return `display.text(str(${text}), int(${x}), int(${y}))\ndisplay.show()\n`;
};

(micropythonGenerator as any).forBlock['neopixel_init'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const count = block.getFieldValue('COUNT');
    getMicroPythonState(micropythonGenerator).imports_.add('neopixel');
    getMicroPythonState(micropythonGenerator).imports_.add('machine');
    getMicroPythonState(micropythonGenerator).imports_.add('time');
    (micropythonGenerator as any).setups_[`init_np_${pin}`] = `np_${pin} = neopixel.NeoPixel(machine.Pin(${pin}), ${count})`;
    return '';
};

(micropythonGenerator as any).forBlock['neopixel_set_color'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    const index = (micropythonGenerator as any).valueToCode(block, 'INDEX', (micropythonGenerator as any).ORDER_NONE) || '0';
    const r = (micropythonGenerator as any).valueToCode(block, 'R', (micropythonGenerator as any).ORDER_NONE) || '0';
    const g = (micropythonGenerator as any).valueToCode(block, 'G', (micropythonGenerator as any).ORDER_NONE) || '0';
    const b = (micropythonGenerator as any).valueToCode(block, 'B', (micropythonGenerator as any).ORDER_NONE) || '0';
    return `np_${pin}[int(${index})] = (int(${r}), int(${g}), int(${b}))\n`;
};

(micropythonGenerator as any).forBlock['neopixel_show'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    return `np_${pin}.write()\n`;
};

(micropythonGenerator as any).forBlock['neopixel_clear'] = function (block: Blockly.Block) {
    const pin = block.getFieldValue('PIN');
    return `np_${pin}.fill((0, 0, 0))\nnp_${pin}.write()\n`;
};

(micropythonGenerator as any).forBlock['motor_forward'] = function (block: Blockly.Block) {
    const pin1 = block.getFieldValue('PIN1');
    const pin2 = block.getFieldValue('PIN2');
    const speed = (micropythonGenerator as any).valueToCode(block, 'SPEED', (micropythonGenerator as any).ORDER_NONE) || '255';
    getMicroPythonState(micropythonGenerator).imports_.add('machine');
    getMicroPythonState(micropythonGenerator).imports_.add('time');
    return `machine.PWM(machine.Pin(${pin1})).duty(int(${speed} * 4))\nmachine.Pin(${pin2}, machine.Pin.OUT).value(0)\n`;
};

(micropythonGenerator as any).forBlock['motor_backward'] = function (block: Blockly.Block) {
    const pin1 = block.getFieldValue('PIN1');
    const pin2 = block.getFieldValue('PIN2');
    const speed = (micropythonGenerator as any).valueToCode(block, 'SPEED', (micropythonGenerator as any).ORDER_NONE) || '255';
    getMicroPythonState(micropythonGenerator).imports_.add('machine');
    getMicroPythonState(micropythonGenerator).imports_.add('time');
    return `machine.Pin(${pin1}, machine.Pin.OUT).value(0)\nmachine.PWM(machine.Pin(${pin2})).duty(int(${speed} * 4))\n`;
};

(micropythonGenerator as any).forBlock['motor_stop'] = function (block: Blockly.Block) {
    const pin1 = block.getFieldValue('PIN1');
    const pin2 = block.getFieldValue('PIN2');
    getMicroPythonState(micropythonGenerator).imports_.add('machine');
    getMicroPythonState(micropythonGenerator).imports_.add('time');
    return `machine.Pin(${pin1}, machine.Pin.OUT).value(0)\nmachine.Pin(${pin2}, machine.Pin.OUT).value(0)\n`;
};

// -- Standard Blocks (Loops, Math, Text) --
(micropythonGenerator as any).ORDER_ATOMIC = 0;
(micropythonGenerator as any).ORDER_NONE = 99;

(micropythonGenerator as any).forBlock['math_number'] = function (block: Blockly.Block) {
    return [block.getFieldValue('NUM'), (micropythonGenerator as any).ORDER_ATOMIC];
};

(micropythonGenerator as any).forBlock['math_single'] = function (block: Blockly.Block) {
    const operator = block.getFieldValue('OP');
    const arg = (micropythonGenerator as any).valueToCode(block, 'NUM', (micropythonGenerator as any).ORDER_NONE) || '0';
    getMicroPythonState(micropythonGenerator).imports_.add('math');
    let code;
    if (operator === 'ROOT') code = `math.sqrt(${arg})`;
    else if (operator === 'ABS') code = `math.fabs(${arg})`;
    else if (operator === 'NEG') code = `-${arg}`;
    else if (operator === 'LN') code = `math.log(${arg})`;
    else if (operator === 'LOG10') code = `math.log10(${arg})`;
    else if (operator === 'EXP') code = `math.exp(${arg})`;
    else if (operator === 'POW10') code = `math.pow(10, ${arg})`;
    else code = `(${arg})`;
    return [code, (micropythonGenerator as any).ORDER_ATOMIC];
};

(micropythonGenerator as any).forBlock['math_arithmetic'] = function (block: Blockly.Block) {
    const operator = block.getFieldValue('OP');
    const argument0 = (micropythonGenerator as any).valueToCode(block, 'A', (micropythonGenerator as any).ORDER_NONE) || '0';
    const argument1 = (micropythonGenerator as any).valueToCode(block, 'B', (micropythonGenerator as any).ORDER_NONE) || '0';

    if (operator === 'POWER') {
        return [`(${argument0} ** ${argument1})`, (micropythonGenerator as any).ORDER_ATOMIC];
    }

    const operatorMap: Record<string, string> = {
        ADD: '+',
        MINUS: '-',
        MULTIPLY: '*',
        DIVIDE: '/'
    };
    const op = operatorMap[operator] || '+';
    return [`(${argument0} ${op} ${argument1})`, (micropythonGenerator as any).ORDER_ATOMIC];
};

(micropythonGenerator as any).forBlock['logic_boolean'] = function (block: Blockly.Block) {
    return [block.getFieldValue('BOOL') === 'TRUE' ? 'True' : 'False', (micropythonGenerator as any).ORDER_ATOMIC];
};

(micropythonGenerator as any).forBlock['logic_compare'] = function (block: Blockly.Block) {
    const operator = block.getFieldValue('OP');
    const argument0 = (micropythonGenerator as any).valueToCode(block, 'A', (micropythonGenerator as any).ORDER_NONE) || '0';
    const argument1 = (micropythonGenerator as any).valueToCode(block, 'B', (micropythonGenerator as any).ORDER_NONE) || '0';
    const operatorMap: Record<string, string> = {
        EQ: '==',
        NEQ: '!=',
        LT: '<',
        LTE: '<=',
        GT: '>',
        GTE: '>='
    };
    const op = operatorMap[operator] || '==';
    return [`(${argument0} ${op} ${argument1})`, (micropythonGenerator as any).ORDER_ATOMIC];
};

(micropythonGenerator as any).forBlock['logic_operation'] = function (block: Blockly.Block) {
    const operator = block.getFieldValue('OP');
    const argument0 = (micropythonGenerator as any).valueToCode(block, 'A', (micropythonGenerator as any).ORDER_NONE) || 'False';
    const argument1 = (micropythonGenerator as any).valueToCode(block, 'B', (micropythonGenerator as any).ORDER_NONE) || 'False';
    const op = operator === 'AND' ? 'and' : 'or';
    return [`(${argument0} ${op} ${argument1})`, (micropythonGenerator as any).ORDER_ATOMIC];
};

(micropythonGenerator as any).forBlock['logic_negate'] = function (block: Blockly.Block) {
    const argument0 = (micropythonGenerator as any).valueToCode(block, 'BOOL', (micropythonGenerator as any).ORDER_NONE) || 'False';
    return [`(not (${argument0}))`, (micropythonGenerator as any).ORDER_ATOMIC];
};

(micropythonGenerator as any).forBlock['controls_if'] = function (block: Blockly.Block) {
    let n = 0;
    let code = '';

    do {
        const condition = (micropythonGenerator as any).valueToCode(block, `IF${n}`, (micropythonGenerator as any).ORDER_NONE) || 'False';
        const branch = (micropythonGenerator as any).statementToCode(block, `DO${n}`) || '    pass\n';
        code += n === 0
            ? `if ${condition}:\n${branch}`
            : `elif ${condition}:\n${branch}`;
        n++;
    } while (block.getInput(`IF${n}`));

    if (block.getInput('ELSE')) {
        const elseBranch = (micropythonGenerator as any).statementToCode(block, 'ELSE') || '    pass\n';
        code += `else:\n${elseBranch}`;
    }

    return code;
};

(micropythonGenerator as any).forBlock['text_print'] = function (block: Blockly.Block) {
    const text = (micropythonGenerator as any).valueToCode(block, 'TEXT', (micropythonGenerator as any).ORDER_NONE) || '""';
    return `print(${text})\n`;
};

(micropythonGenerator as any).forBlock['controls_whileUntil'] = function (block: Blockly.Block) {
    const until = block.getFieldValue('MODE') === 'UNTIL';
    const argument0 = (micropythonGenerator as any).valueToCode(block, 'BOOL', (micropythonGenerator as any).ORDER_NONE) || 'False';
    const branch = (micropythonGenerator as any).statementToCode(block, 'DO') || '    pass\n';
    if (until) {
        return `while not (${argument0}):\n${branch}`;
    }
    return `while ${argument0}:\n${branch}`;
};

(micropythonGenerator as any).forBlock['controls_repeat_ext'] = function (block: Blockly.Block) {
    const repeats = (micropythonGenerator as any).valueToCode(block, 'TIMES', (micropythonGenerator as any).ORDER_NONE) || '0';
    const branch = (micropythonGenerator as any).statementToCode(block, 'DO') || '    pass\n';
    return `for count in range(${repeats}):\n${branch}`;
};

(micropythonGenerator as any).forBlock['text'] = function (block: Blockly.Block) {
    return ['"' + block.getFieldValue('TEXT') + '"', (micropythonGenerator as any).ORDER_ATOMIC];
};

type BlockHandler = (block: Blockly.Block) => string | [string, number] | '';

type GeneratorWithBlocks = Blockly.CodeGenerator & {
    forBlock: Record<string, BlockHandler>;
    ORDER_NONE: number;
    ORDER_ATOMIC: number;
    valueToCode: (block: Blockly.Block, name: string, order: number) => string;
};

function registerOverrideHandlers(generator: GeneratorWithBlocks, handlers: Record<string, BlockHandler>) {
    for (const [type, handler] of Object.entries(handlers)) {
        generator.forBlock[type] = handler;
    }
}

function getValueCode(generator: GeneratorWithBlocks, block: Blockly.Block, name: string, fallback: string) {
    return generator.valueToCode(block, name, generator.ORDER_NONE) || fallback;
}

function findCreatorBlock(
    block: Blockly.Block,
    creatorTypes: string | string[],
    identityField: string,
    identityValue: string
) {
    if (!identityValue || !block.workspace) return null;
    const types = Array.isArray(creatorTypes) ? creatorTypes : [creatorTypes];
    return block.workspace
        .getAllBlocks(false)
        .find((candidate) => types.includes(candidate.type) && candidate.getFieldValue(identityField) === identityValue) || null;
}

function getCreatorFieldValue(
    block: Blockly.Block,
    creatorTypes: string | string[],
    identityField: string,
    identityValue: string,
    targetField: string,
    fallback: string
) {
    const creator = findCreatorBlock(block, creatorTypes, identityField, identityValue);
    const value = creator?.getFieldValue(targetField);
    return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function ensureArduinoServoSetup(identifier: string, pin: string) {
    const setups = (arduinoGenerator as any).setups_;
    setups['include_servo'] = '#include <Servo.h>';
    setups[`declare_servo_${identifier}`] = `Servo ${identifier};`;
    setups[`servo_attach_${identifier}`] = `  ${identifier}.attach(${pin});`;
}

function getArduinoServoConfig(block: Blockly.Block, mode: 'generic' | 'named') {
    if (mode === 'named') {
        const rawName = block.getFieldValue('NAME') || 'myServo';
        return {
            identifier: sanitizeIdentifier(rawName, 'servo'),
            pin: getCreatorFieldValue(block, 'arduino_servo_attach', 'NAME', rawName, 'PIN', '9'),
        };
    }

    const rawSensor = block.getFieldValue('SENSOR') || block.getFieldValue('PIN') || '9';
    const configuredPin = block.type === 'arduino_servo_init'
        ? (block.getFieldValue('PIN') || '9')
        : getCreatorFieldValue(block, 'arduino_servo_init', 'SENSOR', rawSensor, 'PIN', '9');
    const pin = block.type === 'arduino_servo_init'
        ? configuredPin
        : resolveComponentOrPin(rawSensor, configuredPin);

    return {
        identifier: getInstanceIdentifier(rawSensor, 'servo', pin),
        pin,
    };
}

function ensureArduinoUltrasonicSetup(identifier: string, trig: string, echo: string) {
    const setups = (arduinoGenerator as any).setups_;
    setups[`declare_ultrasonic_${identifier}`] = `const int ${identifier}_trig = ${trig};\nconst int ${identifier}_echo = ${echo};`;
    setups[`helper_ultrasonic_${identifier}`] = `long ${identifier}_read_cm() {\n  pinMode(${identifier}_trig, OUTPUT);\n  digitalWrite(${identifier}_trig, LOW);\n  delayMicroseconds(2);\n  digitalWrite(${identifier}_trig, HIGH);\n  delayMicroseconds(10);\n  digitalWrite(${identifier}_trig, LOW);\n  pinMode(${identifier}_echo, INPUT);\n  return pulseIn(${identifier}_echo, HIGH) * 0.01723;\n}`;
}

function getArduinoUltrasonicConfig(block: Blockly.Block, mode: 'generic' | 'named') {
    if (mode === 'named') {
        const rawName = block.getFieldValue('NAME') || 'mySonar';
        return {
            identifier: sanitizeIdentifier(rawName, 'sonar'),
            trig: getCreatorFieldValue(block, 'arduino_sonar_add', 'NAME', rawName, 'TRIG', '9'),
            echo: getCreatorFieldValue(block, 'arduino_sonar_add', 'NAME', rawName, 'ECHO', '10'),
        };
    }

    const rawSensor = block.getFieldValue('SENSOR') || 'ultrasonic';
    const fallbackTrig = block.type === 'arduino_ultrasonic_init'
        ? (block.getFieldValue('TRIG') || '9')
        : getCreatorFieldValue(block, 'arduino_ultrasonic_init', 'SENSOR', rawSensor, 'TRIG', '9');
    const fallbackEcho = block.type === 'arduino_ultrasonic_init'
        ? (block.getFieldValue('ECHO') || '10')
        : getCreatorFieldValue(block, 'arduino_ultrasonic_init', 'SENSOR', rawSensor, 'ECHO', '10');

    return {
        identifier: getInstanceIdentifier(rawSensor, 'ultrasonic', fallbackTrig),
        trig: resolveComponentNamedPinOrPin(rawSensor, 'TRIG', fallbackTrig),
        echo: resolveComponentNamedPinOrPin(rawSensor, 'ECHO', fallbackEcho),
    };
}

function ensureArduinoDhtSetup(identifier: string, pin: string, type: string) {
    const setups = (arduinoGenerator as any).setups_;
    setups['include_dht'] = '#include <DHT.h>';
    setups[`declare_dht_${identifier}`] = `DHT ${identifier}(${pin}, ${type});`;
    setups[`dht_begin_${identifier}`] = `  ${identifier}.begin();`;
}

function getArduinoDhtConfig(block: Blockly.Block, mode: 'generic' | 'named') {
    if (mode === 'named') {
        const rawName = block.getFieldValue('NAME') || 'myDHT';
        return {
            identifier: sanitizeIdentifier(rawName, 'dht'),
            pin: getCreatorFieldValue(block, 'arduino_dht_named_add', 'NAME', rawName, 'PIN', '2'),
            type: getCreatorFieldValue(block, 'arduino_dht_named_add', 'NAME', rawName, 'TYPE', 'DHT11'),
        };
    }

    const rawSensor = block.getFieldValue('SENSOR') || 'dht';
    const type = block.getFieldValue('TYPE') || getCreatorFieldValue(block, 'arduino_dht_init', 'SENSOR', rawSensor, 'TYPE', 'DHT11');
    const fallbackPin = block.type === 'arduino_dht_init'
        ? (block.getFieldValue('PIN') || '2')
        : getCreatorFieldValue(block, 'arduino_dht_init', 'SENSOR', rawSensor, 'PIN', '2');

    return {
        identifier: getInstanceIdentifier(rawSensor, 'dht', fallbackPin),
        pin: resolveComponentOrPin(rawSensor, fallbackPin),
        type,
    };
}

registerOverrideHandlers(arduinoGenerator as GeneratorWithBlocks, {
    arduino_servo_init(block: Blockly.Block) {
        const { identifier, pin } = getArduinoServoConfig(block, 'generic');
        ensureArduinoServoSetup(identifier, pin);
        return '';
    },
    arduino_servo_write(block: Blockly.Block) {
        const { identifier, pin } = getArduinoServoConfig(block, 'generic');
        const angle = getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'ANGLE', '90');
        ensureArduinoServoSetup(identifier, pin);
        return `  ${identifier}.write(${angle});\n`;
    },
    arduino_servo_read(block: Blockly.Block) {
        const { identifier, pin } = getArduinoServoConfig(block, 'generic');
        ensureArduinoServoSetup(identifier, pin);
        return [`${identifier}.read()`, (arduinoGenerator as any).ORDER_ATOMIC];
    },
    arduino_servo_attach(block: Blockly.Block) {
        const { identifier, pin } = getArduinoServoConfig(block, 'named');
        ensureArduinoServoSetup(identifier, pin);
        return '';
    },
    arduino_servo_detach(block: Blockly.Block) {
        const { identifier, pin } = getArduinoServoConfig(block, 'named');
        ensureArduinoServoSetup(identifier, pin);
        return `  ${identifier}.detach();\n`;
    },
    arduino_servo_set_angle(block: Blockly.Block) {
        const { identifier, pin } = getArduinoServoConfig(block, 'named');
        const angle = getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'ANGLE', '90');
        ensureArduinoServoSetup(identifier, pin);
        return `  ${identifier}.write(${angle});\n`;
    },
    arduino_servo_read_angle(block: Blockly.Block) {
        const { identifier, pin } = getArduinoServoConfig(block, 'named');
        ensureArduinoServoSetup(identifier, pin);
        return [`${identifier}.read()`, (arduinoGenerator as any).ORDER_ATOMIC];
    },
    arduino_ultrasonic_init(block: Blockly.Block) {
        const { identifier, trig, echo } = getArduinoUltrasonicConfig(block, 'generic');
        ensureArduinoUltrasonicSetup(identifier, trig, echo);
        return '';
    },
    arduino_ultrasonic(block: Blockly.Block) {
        const { identifier, trig, echo } = getArduinoUltrasonicConfig(block, 'generic');
        ensureArduinoUltrasonicSetup(identifier, trig, echo);
        return [`${identifier}_read_cm()`, (arduinoGenerator as any).ORDER_ATOMIC];
    },
    arduino_sonar_add(block: Blockly.Block) {
        const { identifier, trig, echo } = getArduinoUltrasonicConfig(block, 'named');
        ensureArduinoUltrasonicSetup(identifier, trig, echo);
        return '';
    },
    arduino_sonar_read(block: Blockly.Block) {
        const { identifier, trig, echo } = getArduinoUltrasonicConfig(block, 'named');
        const unit = block.getFieldValue('UNIT') || 'CM';
        ensureArduinoUltrasonicSetup(identifier, trig, echo);
        if (unit === 'INCH') return [`(${identifier}_read_cm() / 2.54)`, (arduinoGenerator as any).ORDER_ATOMIC];
        if (unit === 'MM') return [`(${identifier}_read_cm() * 10)`, (arduinoGenerator as any).ORDER_ATOMIC];
        return [`${identifier}_read_cm()`, (arduinoGenerator as any).ORDER_ATOMIC];
    },
    arduino_dht_init(block: Blockly.Block) {
        const { identifier, pin, type } = getArduinoDhtConfig(block, 'generic');
        ensureArduinoDhtSetup(identifier, pin, type);
        return '';
    },
    arduino_dht_read(block: Blockly.Block) {
        const { identifier, pin, type } = getArduinoDhtConfig(block, 'generic');
        const metric = block.getFieldValue('METRIC') || 'TEMP_C';
        ensureArduinoDhtSetup(identifier, pin, type);
        return [metric === 'HUMIDITY' ? `${identifier}.readHumidity()` : `${identifier}.readTemperature()`, (arduinoGenerator as any).ORDER_ATOMIC];
    },
    arduino_dht_named_add(block: Blockly.Block) {
        const { identifier, pin, type } = getArduinoDhtConfig(block, 'named');
        ensureArduinoDhtSetup(identifier, pin, type);
        return '';
    },
    arduino_dht_named_temp(block: Blockly.Block) {
        const { identifier, pin, type } = getArduinoDhtConfig(block, 'named');
        ensureArduinoDhtSetup(identifier, pin, type);
        return [`${identifier}.readTemperature()`, (arduinoGenerator as any).ORDER_ATOMIC];
    },
    arduino_dht_named_humidity(block: Blockly.Block) {
        const { identifier, pin, type } = getArduinoDhtConfig(block, 'named');
        ensureArduinoDhtSetup(identifier, pin, type);
        return [`${identifier}.readHumidity()`, (arduinoGenerator as any).ORDER_ATOMIC];
    },
    arduino_dht_named_temp_f(block: Blockly.Block) {
        const { identifier, pin, type } = getArduinoDhtConfig(block, 'named');
        ensureArduinoDhtSetup(identifier, pin, type);
        return [`${identifier}.readTemperature(true)`, (arduinoGenerator as any).ORDER_ATOMIC];
    },
});
function ensureArduinoEncoderSetup(identifier: string, clk: string, dt: string) {
    const setups = (arduinoGenerator as any).setups_;
    setups['include_encoder'] = '#include <Encoder.h>';
    setups[`declare_encoder_${identifier}`] = `Encoder ${identifier}(${clk}, ${dt});`;
}

function getArduinoEncoderConfig(block: Blockly.Block, mode: 'generic' | 'named') {
    if (mode === 'named') {
        const rawName = block.getFieldValue('NAME') || 'myEncoder';
        return {
            identifier: sanitizeIdentifier(rawName, 'encoder'),
            clk: getCreatorFieldValue(block, 'arduino_encoder_add', 'NAME', rawName, 'CLK', '2'),
            dt: getCreatorFieldValue(block, 'arduino_encoder_add', 'NAME', rawName, 'DT', '3'),
        };
    }

    const rawSensor = block.getFieldValue('SENSOR') || 'encoder_1';
    return {
        identifier: sanitizeIdentifier(rawSensor, 'encoder'),
        clk: getCreatorFieldValue(block, 'arduino_encoder_init', 'SENSOR', rawSensor, 'CLK', '2'),
        dt: getCreatorFieldValue(block, 'arduino_encoder_init', 'SENSOR', rawSensor, 'DT', '3'),
    };
}

function ensureArduinoStepperSetup(identifier: string, stepsPerRevolution: string, pins: string[]) {
    const setups = (arduinoGenerator as any).setups_;
    setups['include_stepper'] = '#include <Stepper.h>';
    setups[`declare_stepper_${identifier}`] = `Stepper ${identifier}(${stepsPerRevolution}, ${pins.join(', ')});`;
    setups[`stepper_speed_${identifier}`] = `  ${identifier}.setSpeed(60);`;
}

function getArduinoStepperConfig(block: Blockly.Block, mode: 'generic' | 'named') {
    if (mode === 'named') {
        const rawName = block.getFieldValue('NAME') || 'myStepper';
        const creator = findCreatorBlock(block, ['arduino_stepper_add_2wire', 'arduino_stepper_add_4wire'], 'NAME', rawName);
        const stepsPerRevolution = creator ? getValueCode(arduinoGenerator as GeneratorWithBlocks, creator, 'STEPS', '200') : '200';
        const pin1 = creator?.getFieldValue('PIN1') || '8';
        const pin2 = creator?.getFieldValue('PIN2') || '9';
        const pin3 = creator?.getFieldValue('PIN3') || '';
        const pin4 = creator?.getFieldValue('PIN4') || '';
        const pins = pin3 && pin4 ? [pin1, pin2, pin3, pin4] : [pin1, pin2];
        return { identifier: sanitizeIdentifier(rawName, 'stepper'), stepsPerRevolution, pins };
    }

    const rawSensor = block.getFieldValue('SENSOR') || 'stepper_1';
    const creator = findCreatorBlock(block, 'arduino_stepper_init', 'SENSOR', rawSensor);
    return {
        identifier: sanitizeIdentifier(rawSensor, 'stepper'),
        stepsPerRevolution: creator?.getFieldValue('STEPS') || '200',
        pins: [creator?.getFieldValue('PIN1') || '8', creator?.getFieldValue('PIN2') || '9'],
    };
}

function ensureArduinoL298nSetup(identifier: string, config: { ena: string; enb: string; in1: string; in2: string; in3: string; in4: string }) {
    const setups = (arduinoGenerator as any).setups_;
    setups[`declare_l298n_${identifier}`] = `const int ${identifier}_ena = ${config.ena};\nconst int ${identifier}_enb = ${config.enb};\nconst int ${identifier}_in1 = ${config.in1};\nconst int ${identifier}_in2 = ${config.in2};\nconst int ${identifier}_in3 = ${config.in3};\nconst int ${identifier}_in4 = ${config.in4};`;
    setups[`l298_pinmode_ena_${identifier}`] = `  pinMode(${identifier}_ena, OUTPUT);`;
    setups[`l298_pinmode_enb_${identifier}`] = `  pinMode(${identifier}_enb, OUTPUT);`;
    setups[`l298_pinmode_in1_${identifier}`] = `  pinMode(${identifier}_in1, OUTPUT);`;
    setups[`l298_pinmode_in2_${identifier}`] = `  pinMode(${identifier}_in2, OUTPUT);`;
    setups[`l298_pinmode_in3_${identifier}`] = `  pinMode(${identifier}_in3, OUTPUT);`;
    setups[`l298_pinmode_in4_${identifier}`] = `  pinMode(${identifier}_in4, OUTPUT);`;
}

function getArduinoL298nConfig(block: Blockly.Block, mode: 'generic' | 'named') {
    if (mode === 'named') {
        const rawName = block.getFieldValue('NAME') || 'myL298N';
        return {
            identifier: sanitizeIdentifier(rawName, 'l298n'),
            ena: getCreatorFieldValue(block, 'arduino_l298n_attach', 'NAME', rawName, 'ENA', '5'),
            enb: getCreatorFieldValue(block, 'arduino_l298n_attach', 'NAME', rawName, 'ENB', '6'),
            in1: getCreatorFieldValue(block, 'arduino_l298n_attach', 'NAME', rawName, 'IN1', '7'),
            in2: getCreatorFieldValue(block, 'arduino_l298n_attach', 'NAME', rawName, 'IN2', '8'),
            in3: getCreatorFieldValue(block, 'arduino_l298n_attach', 'NAME', rawName, 'IN3', '9'),
            in4: getCreatorFieldValue(block, 'arduino_l298n_attach', 'NAME', rawName, 'IN4', '10'),
        };
    }

    const rawSensor = block.getFieldValue('SENSOR') || 'l298n_1';
    return {
        identifier: sanitizeIdentifier(rawSensor, 'l298n'),
        ena: getCreatorFieldValue(block, 'arduino_l298n_init', 'SENSOR', rawSensor, 'ENA', '5'),
        enb: getCreatorFieldValue(block, 'arduino_l298n_init', 'SENSOR', rawSensor, 'ENB', '6'),
        in1: getCreatorFieldValue(block, 'arduino_l298n_init', 'SENSOR', rawSensor, 'IN1', '7'),
        in2: getCreatorFieldValue(block, 'arduino_l298n_init', 'SENSOR', rawSensor, 'IN2', '8'),
        in3: getCreatorFieldValue(block, 'arduino_l298n_init', 'SENSOR', rawSensor, 'IN3', '9'),
        in4: getCreatorFieldValue(block, 'arduino_l298n_init', 'SENSOR', rawSensor, 'IN4', '10'),
    };
}

function arduinoL298nDirectionStatement(identifier: string, motor: string, direction: string) {
    const enablePin = motor === 'B' ? `${identifier}_enb` : `${identifier}_ena`;
    const inA = motor === 'B' ? `${identifier}_in3` : `${identifier}_in1`;
    const inB = motor === 'B' ? `${identifier}_in4` : `${identifier}_in2`;

    if (direction === 'FORWARD') return `  analogWrite(${enablePin}, 255);\n  digitalWrite(${inA}, HIGH);\n  digitalWrite(${inB}, LOW);\n`;
    if (direction === 'REVERSE' || direction === 'BACKWARD') return `  analogWrite(${enablePin}, 255);\n  digitalWrite(${inA}, LOW);\n  digitalWrite(${inB}, HIGH);\n`;
    if (direction === 'BRAKE') return `  analogWrite(${enablePin}, 255);\n  digitalWrite(${inA}, HIGH);\n  digitalWrite(${inB}, HIGH);\n`;
    return `  analogWrite(${enablePin}, 0);\n  digitalWrite(${inA}, LOW);\n  digitalWrite(${inB}, LOW);\n`;
}

registerOverrideHandlers(arduinoGenerator as GeneratorWithBlocks, {
    arduino_encoder_init(block: Blockly.Block) {
        const { identifier, clk, dt } = getArduinoEncoderConfig(block, 'generic');
        ensureArduinoEncoderSetup(identifier, clk, dt);
        return '';
    },
    arduino_encoder_read(block: Blockly.Block) {
        const { identifier, clk, dt } = getArduinoEncoderConfig(block, 'generic');
        ensureArduinoEncoderSetup(identifier, clk, dt);
        return [`${identifier}.read()`, (arduinoGenerator as any).ORDER_ATOMIC];
    },
    arduino_encoder_write(block: Blockly.Block) {
        const { identifier, clk, dt } = getArduinoEncoderConfig(block, 'generic');
        const value = getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'VALUE', '0');
        ensureArduinoEncoderSetup(identifier, clk, dt);
        return `  ${identifier}.write(${value});\n`;
    },
    arduino_encoder_add(block: Blockly.Block) {
        const { identifier, clk, dt } = getArduinoEncoderConfig(block, 'named');
        ensureArduinoEncoderSetup(identifier, clk, dt);
        return '';
    },
    arduino_encoder_named_read(block: Blockly.Block) {
        const { identifier, clk, dt } = getArduinoEncoderConfig(block, 'named');
        ensureArduinoEncoderSetup(identifier, clk, dt);
        return [`${identifier}.read()`, (arduinoGenerator as any).ORDER_ATOMIC];
    },
    arduino_encoder_reset(block: Blockly.Block) {
        const { identifier, clk, dt } = getArduinoEncoderConfig(block, 'named');
        ensureArduinoEncoderSetup(identifier, clk, dt);
        return `  ${identifier}.write(0);\n`;
    },
    arduino_stepper_init(block: Blockly.Block) {
        const { identifier, stepsPerRevolution, pins } = getArduinoStepperConfig(block, 'generic');
        ensureArduinoStepperSetup(identifier, stepsPerRevolution, pins);
        return '';
    },
    arduino_stepper_speed(block: Blockly.Block) {
        const { identifier, stepsPerRevolution, pins } = getArduinoStepperConfig(block, 'generic');
        const rpm = block.getFieldValue('RPM') || '60';
        ensureArduinoStepperSetup(identifier, stepsPerRevolution, pins);
        return `  ${identifier}.setSpeed(${rpm});\n`;
    },
    arduino_stepper_step(block: Blockly.Block) {
        const { identifier, stepsPerRevolution, pins } = getArduinoStepperConfig(block, 'generic');
        const steps = getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'STEPS', '200');
        ensureArduinoStepperSetup(identifier, stepsPerRevolution, pins);
        return `  ${identifier}.step(${steps});\n`;
    },
    arduino_stepper_add_2wire(block: Blockly.Block) {
        const { identifier, stepsPerRevolution, pins } = getArduinoStepperConfig(block, 'named');
        ensureArduinoStepperSetup(identifier, stepsPerRevolution, pins);
        return '';
    },
    arduino_stepper_add_4wire(block: Blockly.Block) {
        const { identifier, stepsPerRevolution, pins } = getArduinoStepperConfig(block, 'named');
        ensureArduinoStepperSetup(identifier, stepsPerRevolution, pins);
        return '';
    },
    arduino_stepper_set_speed(block: Blockly.Block) {
        const { identifier, stepsPerRevolution, pins } = getArduinoStepperConfig(block, 'named');
        const rpm = getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'RPM', '60');
        ensureArduinoStepperSetup(identifier, stepsPerRevolution, pins);
        return `  ${identifier}.setSpeed(${rpm});\n`;
    },
    arduino_stepper_step_named(block: Blockly.Block) {
        const { identifier, stepsPerRevolution, pins } = getArduinoStepperConfig(block, 'named');
        const steps = getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'STEPS', '200');
        ensureArduinoStepperSetup(identifier, stepsPerRevolution, pins);
        return `  ${identifier}.step(${steps});\n`;
    },
    arduino_l298n_init(block: Blockly.Block) {
        const config = getArduinoL298nConfig(block, 'generic');
        ensureArduinoL298nSetup(config.identifier, config);
        return '';
    },
    arduino_l298n_drive(block: Blockly.Block) {
        const config = getArduinoL298nConfig(block, 'generic');
        ensureArduinoL298nSetup(config.identifier, config);
        return arduinoL298nDirectionStatement(config.identifier, block.getFieldValue('MOTOR') || 'A', block.getFieldValue('DIR') || 'STOP');
    },
    arduino_l298n_speed(block: Blockly.Block) {
        const config = getArduinoL298nConfig(block, 'generic');
        const enablePin = (block.getFieldValue('MOTOR') || 'A') === 'B' ? `${config.identifier}_enb` : `${config.identifier}_ena`;
        const speed = getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'SPEED', '255');
        ensureArduinoL298nSetup(config.identifier, config);
        return `  analogWrite(${enablePin}, constrain(${speed}, 0, 255));\n`;
    },
    arduino_l298n_attach(block: Blockly.Block) {
        const config = getArduinoL298nConfig(block, 'named');
        ensureArduinoL298nSetup(config.identifier, config);
        return '';
    },
    arduino_l298n_set_direction(block: Blockly.Block) {
        const config = getArduinoL298nConfig(block, 'named');
        ensureArduinoL298nSetup(config.identifier, config);
        return arduinoL298nDirectionStatement(config.identifier, block.getFieldValue('MOTOR') || 'A', block.getFieldValue('DIR') || 'STOP');
    },
    arduino_l298n_set_speed(block: Blockly.Block) {
        const config = getArduinoL298nConfig(block, 'named');
        const enablePin = (block.getFieldValue('MOTOR') || 'A') === 'B' ? `${config.identifier}_enb` : `${config.identifier}_ena`;
        const speed = getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'SPEED', '255');
        ensureArduinoL298nSetup(config.identifier, config);
        return `  analogWrite(${enablePin}, constrain(${speed}, 0, 255));\n`;
    },
});
function getArduinoNeoPixelConfig(block: Blockly.Block) {
    const rawSensor = block.getFieldValue('SENSOR') || 'NONE';
    const creator = findCreatorBlock(block, 'neopixel_init', 'SENSOR', rawSensor);
    return {
        identifier: getInstanceIdentifier(rawSensor, 'neopixel', '6'),
        count: creator?.getFieldValue('COUNT') || block.getFieldValue('COUNT') || '8',
        pin: resolveComponentOrPin(rawSensor, '6'),
    };
}

function ensureArduinoNeoPixelSetup(identifier: string, count: string, pin: string) {
    const setups = (arduinoGenerator as any).setups_;
    setups['include_neopixel'] = '#include <Adafruit_NeoPixel.h>';
    setups[`declare_neopixel_${identifier}`] = `Adafruit_NeoPixel ${identifier}(${count}, ${pin}, NEO_GRB + NEO_KHZ800);`;
    setups[`neopixel_begin_${identifier}`] = `  ${identifier}.begin();`;
    setups[`neopixel_show_${identifier}`] = `  ${identifier}.show();`;
}

function getArduinoOledConfig(block: Blockly.Block) {
    const rawSensor = block.getFieldValue('SENSOR') || 'NONE';
    const creator = findCreatorBlock(block, 'oled_init', 'SENSOR', rawSensor);
    return {
        identifier: getInstanceIdentifier(rawSensor, 'display', 'oled'),
        width: creator?.getFieldValue('WIDTH') || block.getFieldValue('WIDTH') || '128',
        height: creator?.getFieldValue('HEIGHT') || block.getFieldValue('HEIGHT') || '64',
    };
}

function ensureArduinoOledSetup(identifier: string, width: string, height: string) {
    const setups = (arduinoGenerator as any).setups_;
    setups['include_wire'] = '#include <Wire.h>';
    setups['include_adafruit_gfx'] = '#include <Adafruit_GFX.h>';
    setups['include_adafruit_ssd1306'] = '#include <Adafruit_SSD1306.h>';
    setups[`declare_oled_${identifier}`] = `Adafruit_SSD1306 ${identifier}(${width}, ${height}, &Wire, -1);`;
    setups[`oled_begin_${identifier}`] = `  if (!${identifier}.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {\n    for (;;) {}\n  }\n  ${identifier}.clearDisplay();\n  ${identifier}.setTextColor(WHITE);`;
}

function ensureArduinoTftSetup() {
    const setups = (arduinoGenerator as any).setups_;
    setups['include_mcufriend_tft'] = '#include <MCUFRIEND_kbv.h>';
    setups['declare_tft_display'] = 'MCUFRIEND_kbv tft;';
    setups['tft_display_begin'] = '  uint16_t tftId = tft.readID();\n  tft.begin(tftId);\n  tft.setRotation(1);\n  tft.fillScreen(TFT_BLACK);\n  tft.setTextColor(TFT_WHITE);\n  tft.setTextSize(2);';
}

registerOverrideHandlers(arduinoGenerator as GeneratorWithBlocks, {
    neopixel_init(block: Blockly.Block) {
        const { identifier, count, pin } = getArduinoNeoPixelConfig(block);
        ensureArduinoNeoPixelSetup(identifier, count, pin);
        return '';
    },
    neopixel_set_color(block: Blockly.Block) {
        const { identifier, count, pin } = getArduinoNeoPixelConfig(block);
        ensureArduinoNeoPixelSetup(identifier, count, pin);
        return `  ${identifier}.setPixelColor(${getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'INDEX', '0')}, ${identifier}.Color(${getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'R', '0')}, ${getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'G', '0')}, ${getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'B', '0')}));\n`;
    },
    neopixel_show(block: Blockly.Block) {
        const { identifier, count, pin } = getArduinoNeoPixelConfig(block);
        ensureArduinoNeoPixelSetup(identifier, count, pin);
        return `  ${identifier}.show();\n`;
    },
    neopixel_clear(block: Blockly.Block) {
        const { identifier, count, pin } = getArduinoNeoPixelConfig(block);
        ensureArduinoNeoPixelSetup(identifier, count, pin);
        return `  ${identifier}.clear();\n  ${identifier}.show();\n`;
    },
    oled_init(block: Blockly.Block) {
        const { identifier, width, height } = getArduinoOledConfig(block);
        ensureArduinoOledSetup(identifier, width, height);
        return '';
    },
    oled_clear(block: Blockly.Block) {
        const { identifier, width, height } = getArduinoOledConfig(block);
        ensureArduinoOledSetup(identifier, width, height);
        return `  ${identifier}.clearDisplay();\n  ${identifier}.display();\n`;
    },
    oled_print(block: Blockly.Block) {
        const { identifier, width, height } = getArduinoOledConfig(block);
        ensureArduinoOledSetup(identifier, width, height);
        return `  ${identifier}.setCursor(${getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'X', '0')}, ${getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'Y', '0')});\n  ${identifier}.print(${getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'TEXT', '""')});\n  ${identifier}.display();\n`;
    },
    oled_set_rotation(block: Blockly.Block) {
        const { identifier, width, height } = getArduinoOledConfig(block);
        ensureArduinoOledSetup(identifier, width, height);
        return `  ${identifier}.setRotation(${block.getFieldValue('ROTATION') || '0'});\n  ${identifier}.display();\n`;
    },
    oled_set_text_color(block: Blockly.Block) {
        const { identifier, width, height } = getArduinoOledConfig(block);
        ensureArduinoOledSetup(identifier, width, height);
        return `  ${identifier}.setTextColor(${block.getFieldValue('COLOR') || 'WHITE'});\n  ${identifier}.display();\n`;
    },
    oled_draw_pixel(block: Blockly.Block) {
        const { identifier, width, height } = getArduinoOledConfig(block);
        ensureArduinoOledSetup(identifier, width, height);
        return `  ${identifier}.drawPixel(${getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'X', '0')}, ${getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'Y', '0')}, ${block.getFieldValue('COLOR') || 'WHITE'});\n  ${identifier}.display();\n`;
    },
    oled_draw_line(block: Blockly.Block) {
        const { identifier, width, height } = getArduinoOledConfig(block);
        ensureArduinoOledSetup(identifier, width, height);
        return `  ${identifier}.drawLine(${getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'X0', '0')}, ${getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'Y0', '0')}, ${getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'X1', '10')}, ${getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'Y1', '10')}, ${block.getFieldValue('COLOR') || 'WHITE'});\n  ${identifier}.display();\n`;
    },
    oled_draw_rect(block: Blockly.Block) {
        const { identifier, width, height } = getArduinoOledConfig(block);
        ensureArduinoOledSetup(identifier, width, height);
        const command = block.getFieldValue('FILL') === 'TRUE' ? 'fillRect' : 'drawRect';
        return `  ${identifier}.${command}(${getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'X', '0')}, ${getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'Y', '0')}, ${getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'W', '10')}, ${getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'H', '10')}, ${block.getFieldValue('COLOR') || 'WHITE'});\n  ${identifier}.display();\n`;
    },
    oled_draw_circle(block: Blockly.Block) {
        const { identifier, width, height } = getArduinoOledConfig(block);
        ensureArduinoOledSetup(identifier, width, height);
        const command = block.getFieldValue('FILL') === 'TRUE' ? 'fillCircle' : 'drawCircle';
        return `  ${identifier}.${command}(${getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'X', '0')}, ${getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'Y', '0')}, ${getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'R', '5')}, ${block.getFieldValue('COLOR') || 'WHITE'});\n  ${identifier}.display();\n`;
    },
    oled_draw_triangle(block: Blockly.Block) {
        const { identifier, width, height } = getArduinoOledConfig(block);
        ensureArduinoOledSetup(identifier, width, height);
        const command = block.getFieldValue('FILL') === 'TRUE' ? 'fillTriangle' : 'drawTriangle';
        return `  ${identifier}.${command}(${getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'X0', '0')}, ${getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'Y0', '10')}, ${getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'X1', '10')}, ${getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'Y1', '0')}, ${getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'X2', '20')}, ${getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'Y2', '10')}, ${block.getFieldValue('COLOR') || 'WHITE'});\n  ${identifier}.display();\n`;
    },
    arduino_tft_init(block: Blockly.Block) {
        void block;
        ensureArduinoTftSetup();
        return '';
    },
    arduino_tft_clear(block: Blockly.Block) {
        ensureArduinoTftSetup();
        const color = block.getFieldValue('COLOR') || 'TFT_BLACK';
        return `  tft.fillScreen(${color});
`;
    },
    arduino_tft_print(block: Blockly.Block) {
        ensureArduinoTftSetup();
        const textValue = getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'TEXT', '""');
        const x = getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'X', '0');
        const y = getValueCode(arduinoGenerator as GeneratorWithBlocks, block, 'Y', '0');
        const size = block.getFieldValue('SIZE') || '2';
        const color = block.getFieldValue('COLOR') || 'TFT_WHITE';
        return `  tft.setCursor(${x}, ${y});
  tft.setTextColor(${color});
  tft.setTextSize(${size});
  tft.print(${textValue});
`;
    },
});
// ----------------------------------------------------------------------------
// 2b. PALETTE COVERAGE (2026-11)
// Every palette block now has a generator for each board its registry entry lists;
// scripts/validate-blockly-codegen.mjs generates all of them headlessly to keep it that way.
// Handlers here also replace older ones that read a PIN field the blocks no longer have
// (they now pick their part from a SENSOR dropdown), which produced code like digitalRead(null).
// ----------------------------------------------------------------------------

const ARDUINO = arduinoGenerator as GeneratorWithBlocks;
const arduinoValue = (block: Blockly.Block, name: string, fallback: string) => getValueCode(ARDUINO, block, name, fallback);
const arduinoAtomic = (code: string): [string, number] => [code, (arduinoGenerator as any).ORDER_ATOMIC];

/** Loop counter name that does not clash with an enclosing repeat block (i, j, k, ...). */
function loopCounterName(block: Blockly.Block) {
    const loopTypes = new Set(['controls_repeat', 'controls_for_loop']);
    let depth = 0;
    for (let parent = block.getSurroundParent(); parent; parent = parent.getSurroundParent()) {
        if (loopTypes.has(parent.type)) depth += 1;
    }
    return ['i', 'j', 'k', 'm', 'n'][depth] ?? `i${depth}`;
}

function variableFieldName(block: Blockly.Block, fieldName: string, fallback: string) {
    const field = block.getField(fieldName);
    return sanitizeIdentifier(field?.getText() || fallback, fallback);
}

function arduinoPinMode(pin: string, mode: 'INPUT' | 'INPUT_PULLUP' | 'OUTPUT') {
    (arduinoGenerator as any).setups_[`pin_mode_${sanitizeIdentifier(pin, 'pin')}`] = `  pinMode(${pin}, ${mode});`;
}

function ensureArduinoButtonSetup(identifier: string, pin: string) {
    const setups = (arduinoGenerator as any).setups_;
    setups[`declare_button_${identifier}`] = `const int ${identifier}_pin = ${pin};\nbool ${identifier}_last = HIGH;`;
    setups[`helper_button_${identifier}`] = `bool ${identifier}_was_pressed() {\n  bool now = digitalRead(${identifier}_pin);\n  bool pressed = (${identifier}_last == HIGH && now == LOW);\n  ${identifier}_last = now;\n  return pressed;\n}`;
    setups[`button_pinmode_${identifier}`] = `  pinMode(${identifier}_pin, INPUT_PULLUP);`;
}

function getButtonConfig(block: Blockly.Block) {
    const rawName = block.getFieldValue('NAME') || 'myButton';
    return {
        identifier: sanitizeIdentifier(rawName, 'button'),
        pin: resolveComponentOrPin(getCreatorFieldValue(block, 'arduino_button_add', 'NAME', rawName, 'PIN', '2'), '2'),
    };
}

/** Moving-average filters keep up to 32 samples; the size block picks how many are averaged. */
function ensureArduinoMovingAverage(identifier: string) {
    const setups = (arduinoGenerator as any).setups_;
    setups[`declare_avg_${identifier}`] = `float ${identifier}_buf[32];\nint ${identifier}_size = 10;\nint ${identifier}_count = 0;\nint ${identifier}_index = 0;\nfloat ${identifier}_sum = 0;`;
    setups[`helper_avg_${identifier}`] = `void ${identifier}_add(float value) {\n  if (${identifier}_count == ${identifier}_size) {\n    ${identifier}_sum -= ${identifier}_buf[${identifier}_index];\n  } else {\n    ${identifier}_count++;\n  }\n  ${identifier}_buf[${identifier}_index] = value;\n  ${identifier}_sum += value;\n  ${identifier}_index = (${identifier}_index + 1) % ${identifier}_size;\n}`;
}

function ensureArduinoAfMotor(motor: string) {
    const setups = (arduinoGenerator as any).setups_;
    setups['include_afmotor'] = '#include <AFMotor.h>';
    setups[`declare_afmotor_${motor}`] = `AF_DCMotor motor${motor}(${motor});`;
}

/** Robot blocks drive motors 1 (left) and 2 (right) on an Adafruit motor shield. */
function arduinoRobotDrive(left: 'FORWARD' | 'BACKWARD' | 'RELEASE', right: 'FORWARD' | 'BACKWARD' | 'RELEASE', speed = '200') {
    ensureArduinoAfMotor('1');
    ensureArduinoAfMotor('2');
    return `  motor1.setSpeed(${speed});\n  motor2.setSpeed(${speed});\n  motor1.run(${left});\n  motor2.run(${right});\n`;
}

function ensureArduinoMax30102Setup() {
    const setups = (arduinoGenerator as any).setups_;
    setups['include_wire'] = '#include <Wire.h>';
    setups['include_max30105'] = '#include "MAX30105.h"';
    setups['include_heart_rate'] = '#include "heartRate.h"';
    setups['include_spo2_algorithm'] = '#include "spo2_algorithm.h"';
    setups['declare_max30102'] = 'MAX30105 particleSensor;';
    setups['helper_max30102_heart_rate'] = `// Averages detected beats over about 5 seconds (SparkFun MAX3010x heartRate.h).
int sticial_max30102_heart_rate() {
  long lastBeat = 0;
  float total = 0;
  int beats = 0;
  unsigned long start = millis();
  while (millis() - start < 5000) {
    long ir = particleSensor.getIR();
    if (ir < 50000) continue; // no finger on the sensor
    if (checkForBeat(ir)) {
      long now = millis();
      if (lastBeat > 0) {
        float bpm = 60.0 / ((now - lastBeat) / 1000.0);
        if (bpm > 20 && bpm < 255) {
          total += bpm;
          beats++;
        }
      }
      lastBeat = now;
    }
  }
  return beats > 0 ? (int)(total / beats) : 0;
}`;
    setups['helper_max30102_spo2'] = `// Samples 100 readings and runs the Maxim SpO2 algorithm (SparkFun spo2_algorithm.h).
int sticial_max30102_spo2() {
#if defined(__AVR_ATmega328P__) || defined(__AVR_ATmega168__)
  uint16_t irBuffer[100];
  uint16_t redBuffer[100];
#else
  uint32_t irBuffer[100];
  uint32_t redBuffer[100];
#endif
  for (byte i = 0; i < 100; i++) {
    while (!particleSensor.available()) particleSensor.check();
    redBuffer[i] = particleSensor.getRed();
    irBuffer[i] = particleSensor.getIR();
    particleSensor.nextSample();
  }
  int32_t spo2;
  int8_t validSpo2;
  int32_t heartRate;
  int8_t validHeartRate;
  maxim_heart_rate_and_oxygen_saturation(irBuffer, 100, redBuffer, &spo2, &validSpo2, &heartRate, &validHeartRate);
  return validSpo2 ? spo2 : 0;
}`;
    setups['max30102_begin'] = '  particleSensor.begin(Wire, I2C_SPEED_FAST);\n  particleSensor.setup();\n  particleSensor.setPulseAmplitudeRed(0x0A);';
}

function ensureArduinoColorSensorHelper() {
    (arduinoGenerator as any).setups_['helper_tcs3200_read'] = `// TCS3200: select a colour filter with S2/S3, then time one pulse on OUT (lower = stronger colour).
long sticial_tcs3200_read(int s2, int s3, int out, int s2State, int s3State) {
  pinMode(s2, OUTPUT);
  pinMode(s3, OUTPUT);
  pinMode(out, INPUT);
  digitalWrite(s2, s2State);
  digitalWrite(s3, s3State);
  return pulseIn(out, LOW);
}`;
}

const TRAFFIC_LIGHT_STATES: Record<string, [string, string, string]> = {
    RED: ['HIGH', 'LOW', 'LOW'],
    YELLOW: ['LOW', 'HIGH', 'LOW'],
    GREEN: ['LOW', 'LOW', 'HIGH'],
    OFF: ['LOW', 'LOW', 'LOW'],
};

registerOverrideHandlers(ARDUINO, {
    // --- Pins and simple parts ---
    arduino_pin_state(block: Blockly.Block) {
        return arduinoAtomic(`digitalRead(${getSensorPin(block, '2')})`);
    },
    arduino_pir_read(block: Blockly.Block) {
        const pin = getSensorPin(block, '2', 'OUT');
        arduinoPinMode(pin, 'INPUT');
        return arduinoAtomic(`digitalRead(${pin})`);
    },
    arduino_touch_read(block: Blockly.Block) {
        const pin = getSensorPin(block, '2', 'SIG');
        arduinoPinMode(pin, 'INPUT');
        return arduinoAtomic(`digitalRead(${pin})`);
    },
    arduino_button_read(block: Blockly.Block) {
        const pin = getSensorPin(block, '2', 'SIG');
        arduinoPinMode(pin, 'INPUT');
        return arduinoAtomic(`digitalRead(${pin})`);
    },
    arduino_ir_obstacle_read(block: Blockly.Block) {
        const pin = getSensorPin(block, '2', 'OUT');
        arduinoPinMode(pin, 'INPUT');
        return arduinoAtomic(`digitalRead(${pin})`);
    },
    arduino_soil_moisture_read(block: Blockly.Block) {
        return arduinoAtomic(`analogRead(${getSensorPin(block, 'A0', 'AO')})`);
    },
    arduino_rain_read(block: Blockly.Block) {
        return arduinoAtomic(`analogRead(${getSensorPin(block, 'A0', 'AO')})`);
    },
    arduino_water_level_read(block: Blockly.Block) {
        return arduinoAtomic(`analogRead(${getSensorPin(block, 'A0', 'SIG')})`);
    },
    arduino_potentiometer_read(block: Blockly.Block) {
        return arduinoAtomic(`analogRead(${getSensorPin(block, 'A0', 'SIG')})`);
    },
    arduino_sound_sensor_read(block: Blockly.Block) {
        return arduinoAtomic(`analogRead(${getSensorPin(block, 'A0', 'AO')})`);
    },
    arduino_photo_sensor_read(block: Blockly.Block) {
        return arduinoAtomic(`analogRead(${getSensorPin(block, 'A0', 'SIG')})`);
    },
    arduino_relay_write(block: Blockly.Block) {
        const pin = getSensorPin(block, '7', 'IN');
        arduinoPinMode(pin, 'OUTPUT');
        return `  digitalWrite(${pin}, ${block.getFieldValue('STATE') || 'LOW'});\n`;
    },
    arduino_buzzer_tone(block: Blockly.Block) {
        const pin = getSensorPin(block, '8', 'SIG');
        return `  tone(${pin}, ${arduinoValue(block, 'FREQ', '1000')}, ${arduinoValue(block, 'DURATION', '250')});\n`;
    },
    arduino_buzzer_stop(block: Blockly.Block) {
        return `  noTone(${getSensorPin(block, '8', 'SIG')});\n`;
    },
    arduino_active_buzzer_set(block: Blockly.Block) {
        const pin = resolveComponentOrPin(block.getFieldValue('PIN'), '8');
        arduinoPinMode(pin, 'OUTPUT');
        return `  digitalWrite(${pin}, ${block.getFieldValue('STATE') || 'LOW'});\n`;
    },
    arduino_water_pump_set(block: Blockly.Block) {
        const pin = resolveComponentOrPin(block.getFieldValue('PIN'), '7');
        arduinoPinMode(pin, 'OUTPUT');
        return `  digitalWrite(${pin}, ${block.getFieldValue('STATE') || 'LOW'});\n`;
    },
    arduino_dc_motor_set(block: Blockly.Block) {
        const pin = resolveComponentOrPin(block.getFieldValue('PIN'), '5');
        arduinoPinMode(pin, 'OUTPUT');
        return `  analogWrite(${pin}, constrain(${arduinoValue(block, 'SPEED', '0')}, 0, 255));\n`;
    },
    arduino_rgb_set(block: Blockly.Block) {
        const pins = ['R_PIN', 'G_PIN', 'B_PIN'].map((name, index) => resolveComponentOrPin(block.getFieldValue(name), ['9', '10', '11'][index]));
        const values = ['R_VAL', 'G_VAL', 'B_VAL'].map((name) => arduinoValue(block, name, '0'));
        pins.forEach((pin) => arduinoPinMode(pin, 'OUTPUT'));
        return pins.map((pin, index) => `  analogWrite(${pin}, constrain(${values[index]}, 0, 255));\n`).join('');
    },
    arduino_traffic_light_set(block: Blockly.Block) {
        const pins = ['R_PIN', 'Y_PIN', 'G_PIN'].map((name, index) => resolveComponentOrPin(block.getFieldValue(name), ['2', '3', '4'][index]));
        const levels = TRAFFIC_LIGHT_STATES[block.getFieldValue('STATE')] || TRAFFIC_LIGHT_STATES.OFF;
        pins.forEach((pin) => arduinoPinMode(pin, 'OUTPUT'));
        return pins.map((pin, index) => `  digitalWrite(${pin}, ${levels[index]});\n`).join('');
    },
    arduino_color_sensor_read(block: Blockly.Block) {
        const s2 = resolveComponentOrPin(block.getFieldValue('S2'), '6');
        const s3 = resolveComponentOrPin(block.getFieldValue('S3'), '7');
        const out = resolveComponentOrPin(block.getFieldValue('OUT'), '8');
        const filter = block.getFieldValue('COLOR') || 'RED';
        const [s2State, s3State] = filter === 'GREEN' ? ['HIGH', 'HIGH'] : filter === 'BLUE' ? ['LOW', 'HIGH'] : ['LOW', 'LOW'];
        ensureArduinoColorSensorHelper();
        return arduinoAtomic(`sticial_tcs3200_read(${s2}, ${s3}, ${out}, ${s2State}, ${s3State})`);
    },
    arduino_max30102_init() {
        ensureArduinoMax30102Setup();
        return '';
    },
    arduino_max30102_read(block: Blockly.Block) {
        ensureArduinoMax30102Setup();
        return arduinoAtomic(block.getFieldValue('METRIC') === 'SPO2' ? 'sticial_max30102_spo2()' : 'sticial_max30102_heart_rate()');
    },

    // --- Named buttons ---
    arduino_button_add(block: Blockly.Block) {
        const rawName = block.getFieldValue('NAME') || 'myButton';
        ensureArduinoButtonSetup(sanitizeIdentifier(rawName, 'button'), resolveComponentOrPin(block.getFieldValue('PIN'), '2'));
        return '';
    },
    arduino_button_is_pressed(block: Blockly.Block) {
        const { identifier, pin } = getButtonConfig(block);
        ensureArduinoButtonSetup(identifier, pin);
        return arduinoAtomic(`(digitalRead(${identifier}_pin) == LOW)`);
    },
    arduino_button_was_pressed(block: Blockly.Block) {
        const { identifier, pin } = getButtonConfig(block);
        ensureArduinoButtonSetup(identifier, pin);
        return arduinoAtomic(`${identifier}_was_pressed()`);
    },

    // --- Motors and robot (Adafruit motor shield, AFMotor library) ---
    arduino_afmotor_run(block: Blockly.Block) {
        const motor = block.getFieldValue('MOTOR') || '1';
        const direction = block.getFieldValue('DIR') || 'FORWARD';
        ensureArduinoAfMotor(motor);
        const speed = `map(constrain(${arduinoValue(block, 'SPEED', '100')}, 0, 100), 0, 100, 0, 255)`;
        return `  motor${motor}.setSpeed(${speed});\n  motor${motor}.run(${direction});\n`;
    },
    robot_move_forward() {
        return arduinoRobotDrive('FORWARD', 'FORWARD');
    },
    robot_move_backward() {
        return arduinoRobotDrive('BACKWARD', 'BACKWARD');
    },
    robot_turn_left() {
        return arduinoRobotDrive('BACKWARD', 'FORWARD');
    },
    robot_turn_right() {
        return arduinoRobotDrive('FORWARD', 'BACKWARD');
    },
    robot_stop() {
        return arduinoRobotDrive('RELEASE', 'RELEASE', '0');
    },
    robot_move_speed(block: Blockly.Block) {
        return arduinoRobotDrive('FORWARD', 'FORWARD', `map(constrain(${arduinoValue(block, 'SPEED', '100')}, 0, 100), 0, 100, 0, 255)`);
    },

    // --- Loops ---
    controls_repeat(block: Blockly.Block) {
        const counter = loopCounterName(block);
        const times = block.getFieldValue('TIMES') || '10';
        const branch = (arduinoGenerator as any).statementToCode(block, 'DO') || '';
        return `  for (int ${counter} = 0; ${counter} < ${times}; ${counter}++) {\n${branch}  }\n`;
    },
    controls_forever(block: Blockly.Block) {
        const branch = (arduinoGenerator as any).statementToCode(block, 'DO') || '';
        return `  while (true) {\n${branch}  }\n`;
    },
    controls_repeat_until(block: Blockly.Block) {
        const condition = arduinoValue(block, 'BOOL', 'false');
        const branch = (arduinoGenerator as any).statementToCode(block, 'DO') || '';
        return `  while (!(${condition})) {\n${branch}  }\n`;
    },
    controls_for_loop(block: Blockly.Block) {
        const variable = variableFieldName(block, 'VAR', 'i');
        const from = arduinoValue(block, 'FROM', '1');
        const to = arduinoValue(block, 'TO', '10');
        const by = arduinoValue(block, 'BY', '1');
        const branch = (arduinoGenerator as any).statementToCode(block, 'DO') || '';
        return `  for (long ${variable} = ${from}; ${variable} <= ${to}; ${variable} += ${by}) {\n${branch}  }\n`;
    },

    // --- Maths ---
    math_trig_arduino(block: Blockly.Block) {
        const value = arduinoValue(block, 'NUM', '0');
        const op = block.getFieldValue('OP') || 'SIN';
        const forward: Record<string, string> = { SIN: 'sin', COS: 'cos', TAN: 'tan' };
        const inverse: Record<string, string> = { ASIN: 'asin', ACOS: 'acos', ATAN: 'atan' };
        if (forward[op]) return arduinoAtomic(`${forward[op]}((${value}) * DEG_TO_RAD)`);
        return arduinoAtomic(`(${inverse[op] || 'asin'}(${value}) * RAD_TO_DEG)`);
    },
    math_pi_arduino() {
        return arduinoAtomic('PI');
    },
    math_check_arduino(block: Blockly.Block) {
        const value = arduinoValue(block, 'NUM', '0');
        const checks: Record<string, string> = {
            EVEN: `((long)(${value}) % 2 == 0)`,
            ODD: `((long)(${value}) % 2 != 0)`,
            POSITIVE: `((${value}) > 0)`,
            NEGATIVE: `((${value}) < 0)`,
            ZERO: `((${value}) == 0)`,
        };
        return arduinoAtomic(checks[block.getFieldValue('PROPERTY')] || checks.EVEN);
    },
    math_random_fraction_arduino() {
        return arduinoAtomic('(random(0, 10000) / 10000.0)');
    },
    math_abs_arduino(block: Blockly.Block) {
        return arduinoAtomic(`abs(${arduinoValue(block, 'NUM', '0')})`);
    },
    math_bit_read(block: Blockly.Block) {
        return arduinoAtomic(`bitRead((long)(${arduinoValue(block, 'NUM', '0')}), ${arduinoValue(block, 'BIT', '0')})`);
    },
    math_bit_set(block: Blockly.Block) {
        return arduinoAtomic(`((long)(${arduinoValue(block, 'NUM', '0')}) | (1L << (${arduinoValue(block, 'BIT', '0')})))`);
    },
    math_bit_clear(block: Blockly.Block) {
        return arduinoAtomic(`((long)(${arduinoValue(block, 'NUM', '0')}) & ~(1L << (${arduinoValue(block, 'BIT', '0')})))`);
    },
    math_high_byte(block: Blockly.Block) {
        return arduinoAtomic(`highByte((long)(${arduinoValue(block, 'NUM', '0')}))`);
    },
    math_low_byte(block: Blockly.Block) {
        return arduinoAtomic(`lowByte((long)(${arduinoValue(block, 'NUM', '0')}))`);
    },
    math_moving_avg_new(block: Blockly.Block) {
        const identifier = sanitizeIdentifier(block.getFieldValue('NAME') || 'myFilter', 'filter');
        ensureArduinoMovingAverage(identifier);
        return `  ${identifier}_size = constrain(${arduinoValue(block, 'SIZE', '10')}, 1, 32);\n  ${identifier}_count = 0;\n  ${identifier}_index = 0;\n  ${identifier}_sum = 0;\n`;
    },
    math_moving_avg_add(block: Blockly.Block) {
        const identifier = sanitizeIdentifier(block.getFieldValue('NAME') || 'myFilter', 'filter');
        ensureArduinoMovingAverage(identifier);
        return `  ${identifier}_add(${arduinoValue(block, 'VALUE', '0')});\n`;
    },
    math_moving_avg_get(block: Blockly.Block) {
        const identifier = sanitizeIdentifier(block.getFieldValue('NAME') || 'myFilter', 'filter');
        ensureArduinoMovingAverage(identifier);
        return arduinoAtomic(`(${identifier}_count > 0 ? ${identifier}_sum / ${identifier}_count : 0)`);
    },
    math_random_int_custom(block: Blockly.Block) {
        return arduinoAtomic(`random(${arduinoValue(block, 'FROM', '1')}, (${arduinoValue(block, 'TO', '6')}) + 1)`);
    },
    math_modulo_custom(block: Blockly.Block) {
        return arduinoAtomic(`((long)(${arduinoValue(block, 'DIVIDEND', '0')}) % (long)(${arduinoValue(block, 'DIVISOR', '1')}))`);
    },
    math_round(block: Blockly.Block) {
        const value = arduinoValue(block, 'NUM', '0');
        const op = block.getFieldValue('OP') || 'ROUND';
        return arduinoAtomic(op === 'ROUNDUP' ? `ceil(${value})` : op === 'ROUNDDOWN' ? `floor(${value})` : `round(${value})`);
    },
    math_on_list(block: Blockly.Block) {
        // C++ arrays can't be passed around like lists and the palette has no list blocks yet,
        // so this reads as 0 on Arduino. MicroPython computes min()/max() of a real list.
        void block;
        return arduinoAtomic('0');
    },
    arduino_map(block: Blockly.Block) {
        return arduinoAtomic(`map(${arduinoValue(block, 'VALUE', '0')}, ${arduinoValue(block, 'FROM_LOW', '0')}, ${arduinoValue(block, 'FROM_HIGH', '1023')}, ${arduinoValue(block, 'TO_LOW', '0')}, ${arduinoValue(block, 'TO_HIGH', '255')})`);
    },
    arduino_constrain(block: Blockly.Block) {
        return arduinoAtomic(`constrain(${arduinoValue(block, 'VALUE', '0')}, ${arduinoValue(block, 'LOW', '0')}, ${arduinoValue(block, 'HIGH', '255')})`);
    },
});

const MICROPYTHON = micropythonGenerator as GeneratorWithBlocks;
const mpValue = (block: Blockly.Block, name: string, fallback: string) => getValueCode(MICROPYTHON, block, name, fallback);
const mpAtomic = (code: string): [string, number] => [code, (micropythonGenerator as any).ORDER_ATOMIC];
const mpIndent = () => micropythonGenerator.INDENT || '    ';

function mpUse(...modules: string[]) {
    const state = getMicroPythonState(micropythonGenerator);
    modules.forEach((name) => state.imports_.add(name));
    return state.setups_;
}

function mpBranch(block: Blockly.Block, name = 'DO') {
    return (micropythonGenerator as any).statementToCode(block, name) || `${mpIndent()}pass\n`;
}

/** Pin label as an identifier suffix: "2" -> 2, "GP15" -> GP15, "A0" -> A0. */
const mpPinSuffix = (pin: string) => String(pin).replace(/[^A-Za-z0-9_]/g, '_');

/** Digital input pin object, created once at start-up. */
function mpInputPin(prefix: string, pin: string, pull = false) {
    const identifier = `${prefix}_${mpPinSuffix(pin)}`;
    mpUse('machine')[`${identifier}_pin`] = `${identifier} = machine.Pin(${toMicroPythonPin(pin)}, machine.Pin.IN${pull ? ', machine.Pin.PULL_UP' : ''})`;
    return identifier;
}

function mpOutputPin(prefix: string, pin: string) {
    const identifier = `${prefix}_${mpPinSuffix(pin)}`;
    mpUse('machine')[`${identifier}_pin`] = `${identifier} = machine.Pin(${toMicroPythonPin(pin)}, machine.Pin.OUT)`;
    return identifier;
}

/** ADC reading scaled to Arduino's 0-1023 range so the same thresholds work on every board. */
function mpAnalogRead(prefix: string, pin: string) {
    const identifier = `${prefix}_adc_${mpPinSuffix(pin)}`;
    mpUse('machine')[`${identifier}`] = `${identifier} = machine.ADC(machine.Pin(${toMicroPythonPin(pin)}))`;
    return mpAtomic(`(${identifier}.read_u16() >> 6)`);
}

/** PWM output with a 0-255 duty input, like Arduino's analogWrite. */
function mpPwm(prefix: string, pin: string, freq = 1000) {
    const identifier = `${prefix}_pwm_${mpPinSuffix(pin)}`;
    mpUse('machine')[`${identifier}`] = `${identifier} = machine.PWM(machine.Pin(${toMicroPythonPin(pin)}))\n${identifier}.freq(${freq})`;
    return identifier;
}

function mpDuty(identifier: string, value: string) {
    return `${identifier}.duty_u16(min(max(int(${value}), 0), 255) * 257)\n`;
}

function ensureMpButtonSetup(identifier: string, pin: string) {
    const setups = mpUse('machine');
    setups[`button_${identifier}`] = `${identifier} = machine.Pin(${toMicroPythonPin(pin)}, machine.Pin.IN, machine.Pin.PULL_UP)\n${identifier}_last = 1`;
    setups[`button_${identifier}_helper`] = `def ${identifier}_was_pressed():\n    global ${identifier}_last\n    now = ${identifier}.value()\n    pressed = ${identifier}_last == 1 and now == 0\n    ${identifier}_last = now\n    return pressed`;
}

function ensureMpMovingAverage(identifier: string) {
    const setups = mpUse();
    setups[`avg_${identifier}`] = `${identifier}_values = []\n${identifier}_size = 10`;
    setups[`avg_${identifier}_helper`] = `def ${identifier}_add(value):\n    ${identifier}_values.append(value)\n    while len(${identifier}_values) > ${identifier}_size:\n        ${identifier}_values.pop(0)`;
}

function ensureMpUltrasonicHelper() {
    mpUse('machine', 'time')['ultrasonic_func'] = `def read_ultrasonic(trig_pin, echo_pin):\n    trig = machine.Pin(trig_pin, machine.Pin.OUT)\n    echo = machine.Pin(echo_pin, machine.Pin.IN)\n    trig.value(0)\n    time.sleep_us(2)\n    trig.value(1)\n    time.sleep_us(10)\n    trig.value(0)\n    try:\n        return machine.time_pulse_us(echo, 1, 30000) * 0.017\n    except OSError:\n        return -1`;
}

/** Hobby servo on a 50 Hz PWM pin; the last angle is remembered so it can be read back. */
function ensureMpServo(identifier: string, pin: string) {
    mpUse('machine')[`servo_${identifier}`] = `${identifier} = machine.PWM(machine.Pin(${toMicroPythonPin(pin)}))\n${identifier}.freq(50)\n${identifier}_angle = 90`;
}

function mpServoWrite(identifier: string, angle: string) {
    // 0-180 degrees -> 0.5-2.5 ms pulses at 50 Hz (duty_u16 1638-8192).
    return `${identifier}_angle = min(max(int(${angle}), 0), 180)\n${identifier}.duty_u16(1638 + ${identifier}_angle * 6554 // 180)\n`;
}

function ensureMpEncoder(identifier: string, clk: string, dt: string) {
    const setups = mpUse('machine');
    setups['encoder_class'] = `class _SticialEncoder:\n    def __init__(self, clk, dt):\n        self.clk = machine.Pin(clk, machine.Pin.IN, machine.Pin.PULL_UP)\n        self.dt = machine.Pin(dt, machine.Pin.IN, machine.Pin.PULL_UP)\n        self.value = 0\n        self.clk.irq(trigger=machine.Pin.IRQ_FALLING, handler=self._tick)\n\n    def _tick(self, pin):\n        self.value += 1 if self.dt.value() else -1`;
    setups[`encoder_${identifier}`] = `${identifier} = _SticialEncoder(${toMicroPythonPin(clk)}, ${toMicroPythonPin(dt)})`;
}

function ensureMpStepper(identifier: string, stepsPerRevolution: string, pins: string[]) {
    const setups = mpUse('machine', 'time');
    setups['stepper_class'] = `class _SticialStepper:\n    _SEQ = ((0, 1), (1, 1), (1, 0), (0, 0))\n\n    def __init__(self, steps, pin1, pin2):\n        self.steps = steps\n        self.pins = (machine.Pin(pin1, machine.Pin.OUT), machine.Pin(pin2, machine.Pin.OUT))\n        self.index = 0\n        self.set_speed(60)\n\n    def set_speed(self, rpm):\n        self.delay_us = int(60000000 / (self.steps * max(1, rpm)))\n\n    def step(self, count):\n        direction = 1 if count > 0 else -1\n        for _ in range(abs(int(count))):\n            self.index = (self.index + direction) % 4\n            a, b = self._SEQ[self.index]\n            self.pins[0].value(a)\n            self.pins[1].value(b)\n            time.sleep_us(self.delay_us)`;
    setups[`stepper_${identifier}`] = `${identifier} = _SticialStepper(${stepsPerRevolution}, ${toMicroPythonPin(pins[0])}, ${toMicroPythonPin(pins[1])})`;
}

function ensureMpL298n(identifier: string, config: { ena: string; enb: string; in1: string; in2: string; in3: string; in4: string }) {
    const setups = mpUse('machine');
    const pin = (value: string) => toMicroPythonPin(value);
    setups[`l298n_${identifier}`] = [
        `${identifier}_ena = machine.PWM(machine.Pin(${pin(config.ena)}))`,
        `${identifier}_ena.freq(1000)`,
        `${identifier}_enb = machine.PWM(machine.Pin(${pin(config.enb)}))`,
        `${identifier}_enb.freq(1000)`,
        `${identifier}_in1 = machine.Pin(${pin(config.in1)}, machine.Pin.OUT)`,
        `${identifier}_in2 = machine.Pin(${pin(config.in2)}, machine.Pin.OUT)`,
        `${identifier}_in3 = machine.Pin(${pin(config.in3)}, machine.Pin.OUT)`,
        `${identifier}_in4 = machine.Pin(${pin(config.in4)}, machine.Pin.OUT)`,
    ].join('\n');
}

function mpL298nDirection(identifier: string, motor: string, direction: string) {
    const enable = motor === 'B' ? `${identifier}_enb` : `${identifier}_ena`;
    const inA = motor === 'B' ? `${identifier}_in3` : `${identifier}_in1`;
    const inB = motor === 'B' ? `${identifier}_in4` : `${identifier}_in2`;
    const levels = direction === 'FORWARD' ? [1, 0] : direction === 'REVERSE' || direction === 'BACKWARD' ? [0, 1] : direction === 'BRAKE' ? [1, 1] : [0, 0];
    const duty = direction === 'STOP' ? 0 : 65535;
    return `${enable}.duty_u16(${duty})\n${inA}.value(${levels[0]})\n${inB}.value(${levels[1]})\n`;
}

/** The OLED uses the shared `display` object from oled_init; text colour is a module variable. */
const MP_OLED_COLORS: Record<string, string> = { WHITE: '1', BLACK: '0', INVERSE: '1' };
function mpOledColor(block: Blockly.Block) {
    return MP_OLED_COLORS[block.getFieldValue('COLOR')] ?? '1';
}
function mpOledFill(block: Blockly.Block) {
    return block.getFieldValue('FILL') === 'TRUE';
}
function ensureMpOled() {
    const setups = mpUse('machine', 'ssd1306');
    setups['init_i2c'] = setups['init_i2c'] || 'i2c = machine.I2C(0, scl=machine.Pin(5), sda=machine.Pin(4))';
    setups['init_display'] = setups['init_display'] || 'display = ssd1306.SSD1306_I2C(128, 64, i2c)';
    setups['oled_text_color'] = 'oled_text_color = 1';
}

function getMpNeoPixelConfig(block: Blockly.Block) {
    const { identifier, count, pin } = getArduinoNeoPixelConfig(block);
    mpUse('machine', 'neopixel')[`neopixel_${identifier}`] = `${identifier} = neopixel.NeoPixel(machine.Pin(${toMicroPythonPin(pin)}), ${count})`;
    return identifier;
}

registerOverrideHandlers(MICROPYTHON, {
    // --- Pins and simple parts ---
    arduino_pin_state(block: Blockly.Block) {
        mpUse('machine');
        return mpAtomic(`machine.Pin(${toMicroPythonPin(getSensorPin(block, '2'))}).value()`);
    },
    arduino_pir_read(block: Blockly.Block) {
        return mpAtomic(`${mpInputPin('pir', getSensorPin(block, '2', 'OUT'))}.value()`);
    },
    arduino_touch_read(block: Blockly.Block) {
        return mpAtomic(`${mpInputPin('touch', getSensorPin(block, '2', 'SIG'))}.value()`);
    },
    arduino_button_read(block: Blockly.Block) {
        return mpAtomic(`${mpInputPin('button', getSensorPin(block, '2', 'SIG'))}.value()`);
    },
    arduino_ir_obstacle_read(block: Blockly.Block) {
        return mpAtomic(`${mpInputPin('ir_obstacle', getSensorPin(block, '2', 'OUT'))}.value()`);
    },
    arduino_soil_moisture_read(block: Blockly.Block) {
        return mpAnalogRead('soil', getSensorPin(block, '26', 'AO'));
    },
    arduino_rain_read(block: Blockly.Block) {
        return mpAnalogRead('rain', getSensorPin(block, '26', 'AO'));
    },
    arduino_water_level_read(block: Blockly.Block) {
        return mpAnalogRead('water', getSensorPin(block, '26', 'SIG'));
    },
    arduino_potentiometer_read(block: Blockly.Block) {
        return mpAnalogRead('pot', getSensorPin(block, '26', 'SIG'));
    },
    arduino_sound_sensor_read(block: Blockly.Block) {
        return mpAnalogRead('sound', getSensorPin(block, '26', 'AO'));
    },
    arduino_photo_sensor_read(block: Blockly.Block) {
        return mpAnalogRead('photo', getSensorPin(block, '26', 'SIG'));
    },
    arduino_relay_write(block: Blockly.Block) {
        const relay = mpOutputPin('relay', getSensorPin(block, '7', 'IN'));
        return `${relay}.value(${block.getFieldValue('STATE') === 'HIGH' ? 1 : 0})\n`;
    },
    arduino_buzzer_tone(block: Blockly.Block) {
        const buzzer = mpPwm('buzzer', getSensorPin(block, '8', 'SIG'));
        mpUse('time');
        return `${buzzer}.freq(int(${mpValue(block, 'FREQ', '1000')}))\n${buzzer}.duty_u16(32768)\ntime.sleep_ms(int(${mpValue(block, 'DURATION', '250')}))\n${buzzer}.duty_u16(0)\n`;
    },
    arduino_buzzer_stop(block: Blockly.Block) {
        return `${mpPwm('buzzer', getSensorPin(block, '8', 'SIG'))}.duty_u16(0)\n`;
    },
    arduino_active_buzzer_set(block: Blockly.Block) {
        const buzzer = mpOutputPin('active_buzzer', resolveComponentOrPin(block.getFieldValue('PIN'), '8'));
        return `${buzzer}.value(${block.getFieldValue('STATE') === 'HIGH' ? 1 : 0})\n`;
    },
    arduino_water_pump_set(block: Blockly.Block) {
        const pump = mpOutputPin('pump', resolveComponentOrPin(block.getFieldValue('PIN'), '7'));
        return `${pump}.value(${block.getFieldValue('STATE') === 'HIGH' ? 1 : 0})\n`;
    },
    arduino_dc_motor_set(block: Blockly.Block) {
        return mpDuty(mpPwm('motor', resolveComponentOrPin(block.getFieldValue('PIN'), '5')), mpValue(block, 'SPEED', '0'));
    },
    arduino_rgb_set(block: Blockly.Block) {
        return ['R', 'G', 'B']
            .map((channel, index) => {
                const pin = resolveComponentOrPin(block.getFieldValue(`${channel}_PIN`), ['9', '10', '11'][index]);
                return mpDuty(mpPwm(`rgb_${channel.toLowerCase()}`, pin), mpValue(block, `${channel}_VAL`, '0'));
            })
            .join('');
    },
    arduino_traffic_light_set(block: Blockly.Block) {
        const levels = TRAFFIC_LIGHT_STATES[block.getFieldValue('STATE')] || TRAFFIC_LIGHT_STATES.OFF;
        return ['R_PIN', 'Y_PIN', 'G_PIN']
            .map((name, index) => {
                const light = mpOutputPin(`traffic_${name[0].toLowerCase()}`, resolveComponentOrPin(block.getFieldValue(name), ['2', '3', '4'][index]));
                return `${light}.value(${levels[index] === 'HIGH' ? 1 : 0})\n`;
            })
            .join('');
    },

    // --- Named buttons ---
    arduino_button_add(block: Blockly.Block) {
        const rawName = block.getFieldValue('NAME') || 'myButton';
        ensureMpButtonSetup(sanitizeIdentifier(rawName, 'button'), resolveComponentOrPin(block.getFieldValue('PIN'), '2'));
        return '';
    },
    arduino_button_is_pressed(block: Blockly.Block) {
        const { identifier, pin } = getButtonConfig(block);
        ensureMpButtonSetup(identifier, pin);
        return mpAtomic(`(${identifier}.value() == 0)`);
    },
    arduino_button_was_pressed(block: Blockly.Block) {
        const { identifier, pin } = getButtonConfig(block);
        ensureMpButtonSetup(identifier, pin);
        return mpAtomic(`${identifier}_was_pressed()`);
    },

    // --- Sensors with a named part ---
    arduino_ultrasonic_init(block: Blockly.Block) {
        getArduinoUltrasonicConfig(block, 'generic');
        ensureMpUltrasonicHelper();
        return '';
    },
    arduino_ultrasonic(block: Blockly.Block) {
        const { trig, echo } = getArduinoUltrasonicConfig(block, 'generic');
        ensureMpUltrasonicHelper();
        return mpAtomic(`read_ultrasonic(${toMicroPythonPin(trig)}, ${toMicroPythonPin(echo)})`);
    },
    arduino_dht_init(block: Blockly.Block) {
        const { identifier, pin, type } = getArduinoDhtConfig(block, 'generic');
        mpUse('machine', 'dht')[`dht_${identifier}`] = `${identifier} = dht.${type === 'DHT22' ? 'DHT22' : 'DHT11'}(machine.Pin(${toMicroPythonPin(pin)}))`;
        return '';
    },
    arduino_dht_read(block: Blockly.Block) {
        const { identifier, pin, type } = getArduinoDhtConfig(block, 'generic');
        const humidity = block.getFieldValue('METRIC') === 'HUMIDITY';
        const helper = `${identifier}_${humidity ? 'humidity' : 'temperature'}`;
        const setups = mpUse('machine', 'dht');
        setups[`dht_${identifier}`] = `${identifier} = dht.${type === 'DHT22' ? 'DHT22' : 'DHT11'}(machine.Pin(${toMicroPythonPin(pin)}))`;
        setups[`dht_${helper}`] = `def ${helper}():\n    ${identifier}.measure()\n    return ${identifier}.${humidity ? 'humidity' : 'temperature'}()`;
        return mpAtomic(`${helper}()`);
    },
    arduino_encoder_init(block: Blockly.Block) {
        const { identifier, clk, dt } = getArduinoEncoderConfig(block, 'generic');
        ensureMpEncoder(identifier, clk, dt);
        return '';
    },
    arduino_encoder_read(block: Blockly.Block) {
        const { identifier, clk, dt } = getArduinoEncoderConfig(block, 'generic');
        ensureMpEncoder(identifier, clk, dt);
        return mpAtomic(`${identifier}.value`);
    },
    arduino_encoder_write(block: Blockly.Block) {
        const { identifier, clk, dt } = getArduinoEncoderConfig(block, 'generic');
        ensureMpEncoder(identifier, clk, dt);
        return `${identifier}.value = int(${mpValue(block, 'VALUE', '0')})\n`;
    },

    // --- Servos, steppers, motor drivers, NeoPixels ---
    arduino_servo_init(block: Blockly.Block) {
        const { identifier, pin } = getArduinoServoConfig(block, 'generic');
        ensureMpServo(identifier, pin);
        return '';
    },
    arduino_servo_write(block: Blockly.Block) {
        const { identifier, pin } = getArduinoServoConfig(block, 'generic');
        ensureMpServo(identifier, pin);
        return mpServoWrite(identifier, mpValue(block, 'ANGLE', '90'));
    },
    arduino_servo_read(block: Blockly.Block) {
        const { identifier, pin } = getArduinoServoConfig(block, 'generic');
        ensureMpServo(identifier, pin);
        return mpAtomic(`${identifier}_angle`);
    },
    arduino_stepper_init(block: Blockly.Block) {
        const { identifier, stepsPerRevolution, pins } = getArduinoStepperConfig(block, 'generic');
        ensureMpStepper(identifier, stepsPerRevolution, pins);
        return '';
    },
    arduino_stepper_speed(block: Blockly.Block) {
        const { identifier, stepsPerRevolution, pins } = getArduinoStepperConfig(block, 'generic');
        ensureMpStepper(identifier, stepsPerRevolution, pins);
        return `${identifier}.set_speed(${block.getFieldValue('RPM') || '60'})\n`;
    },
    arduino_stepper_step(block: Blockly.Block) {
        const { identifier, stepsPerRevolution, pins } = getArduinoStepperConfig(block, 'generic');
        ensureMpStepper(identifier, stepsPerRevolution, pins);
        return `${identifier}.step(${mpValue(block, 'STEPS', '200')})\n`;
    },
    arduino_l298n_init(block: Blockly.Block) {
        const config = getArduinoL298nConfig(block, 'generic');
        ensureMpL298n(config.identifier, config);
        return '';
    },
    arduino_l298n_drive(block: Blockly.Block) {
        const config = getArduinoL298nConfig(block, 'generic');
        ensureMpL298n(config.identifier, config);
        return mpL298nDirection(config.identifier, block.getFieldValue('MOTOR') || 'A', block.getFieldValue('DIR') || 'STOP');
    },
    arduino_l298n_speed(block: Blockly.Block) {
        const config = getArduinoL298nConfig(block, 'generic');
        ensureMpL298n(config.identifier, config);
        const enable = (block.getFieldValue('MOTOR') || 'A') === 'B' ? `${config.identifier}_enb` : `${config.identifier}_ena`;
        return mpDuty(enable, mpValue(block, 'SPEED', '255'));
    },
    neopixel_init(block: Blockly.Block) {
        getMpNeoPixelConfig(block);
        return '';
    },
    neopixel_set_color(block: Blockly.Block) {
        const strip = getMpNeoPixelConfig(block);
        return `${strip}[int(${mpValue(block, 'INDEX', '0')})] = (int(${mpValue(block, 'R', '0')}), int(${mpValue(block, 'G', '0')}), int(${mpValue(block, 'B', '0')}))\n`;
    },
    neopixel_show(block: Blockly.Block) {
        return `${getMpNeoPixelConfig(block)}.write()\n`;
    },
    neopixel_clear(block: Blockly.Block) {
        const strip = getMpNeoPixelConfig(block);
        return `${strip}.fill((0, 0, 0))\n${strip}.write()\n`;
    },

    // --- OLED drawing (ssd1306 framebuf on the shared `display`) ---
    oled_print(block: Blockly.Block) {
        ensureMpOled();
        return `display.text(str(${mpValue(block, 'TEXT', '""')}), int(${mpValue(block, 'X', '0')}), int(${mpValue(block, 'Y', '0')}), oled_text_color)\ndisplay.show()\n`;
    },
    oled_set_rotation(block: Blockly.Block) {
        ensureMpOled();
        // The ssd1306 driver can only flip 180 degrees; 90/270 keep the normal orientation.
        return `display.rotate(${block.getFieldValue('ROTATION') === '2' ? 'True' : 'False'})\ndisplay.show()\n`;
    },
    oled_set_text_color(block: Blockly.Block) {
        ensureMpOled();
        return `oled_text_color = ${mpOledColor(block)}\n`;
    },
    oled_draw_pixel(block: Blockly.Block) {
        ensureMpOled();
        return `display.pixel(int(${mpValue(block, 'X', '0')}), int(${mpValue(block, 'Y', '0')}), ${mpOledColor(block)})\ndisplay.show()\n`;
    },
    oled_draw_line(block: Blockly.Block) {
        ensureMpOled();
        const coords = ['X0', 'Y0', 'X1', 'Y1'].map((name, index) => `int(${mpValue(block, name, ['0', '0', '10', '10'][index])})`);
        return `display.line(${coords.join(', ')}, ${mpOledColor(block)})\ndisplay.show()\n`;
    },
    oled_draw_rect(block: Blockly.Block) {
        ensureMpOled();
        const coords = ['X', 'Y', 'W', 'H'].map((name, index) => `int(${mpValue(block, name, ['0', '0', '10', '10'][index])})`);
        return `display.${mpOledFill(block) ? 'fill_rect' : 'rect'}(${coords.join(', ')}, ${mpOledColor(block)})\ndisplay.show()\n`;
    },
    oled_draw_circle(block: Blockly.Block) {
        ensureMpOled();
        const radius = `int(${mpValue(block, 'R', '5')})`;
        return `display.ellipse(int(${mpValue(block, 'X', '0')}), int(${mpValue(block, 'Y', '0')}), ${radius}, ${radius}, ${mpOledColor(block)}, ${mpOledFill(block) ? 'True' : 'False'})\ndisplay.show()\n`;
    },
    oled_draw_triangle(block: Blockly.Block) {
        ensureMpOled();
        mpUse('array');
        const points = ['X0', 'Y0', 'X1', 'Y1', 'X2', 'Y2'].map((name, index) => `int(${mpValue(block, name, ['0', '10', '10', '0', '20', '10'][index])})`);
        return `display.poly(0, 0, array.array("h", [${points.join(', ')}]), ${mpOledColor(block)}, ${mpOledFill(block) ? 'True' : 'False'})\ndisplay.show()\n`;
    },

    // --- Loops ---
    controls_repeat(block: Blockly.Block) {
        return `for _ in range(${block.getFieldValue('TIMES') || '10'}):\n${mpBranch(block)}`;
    },
    controls_forever(block: Blockly.Block) {
        return `while True:\n${mpBranch(block)}`;
    },
    controls_repeat_until(block: Blockly.Block) {
        return `while not (${mpValue(block, 'BOOL', 'False')}):\n${mpBranch(block)}`;
    },
    controls_for_loop(block: Blockly.Block) {
        const variable = variableFieldName(block, 'VAR', 'i');
        return `for ${variable} in range(int(${mpValue(block, 'FROM', '1')}), int(${mpValue(block, 'TO', '10')}) + 1, int(${mpValue(block, 'BY', '1')})):\n${mpBranch(block)}`;
    },

    // --- Maths ---
    math_trig_arduino(block: Blockly.Block) {
        mpUse('math');
        const value = mpValue(block, 'NUM', '0');
        const op = block.getFieldValue('OP') || 'SIN';
        if (['SIN', 'COS', 'TAN'].includes(op)) return mpAtomic(`math.${op.toLowerCase()}(math.radians(${value}))`);
        return mpAtomic(`math.degrees(math.${op.toLowerCase()}(${value}))`);
    },
    math_pi_arduino() {
        mpUse('math');
        return mpAtomic('math.pi');
    },
    math_check_arduino(block: Blockly.Block) {
        const value = mpValue(block, 'NUM', '0');
        const checks: Record<string, string> = {
            EVEN: `(int(${value}) % 2 == 0)`,
            ODD: `(int(${value}) % 2 != 0)`,
            POSITIVE: `((${value}) > 0)`,
            NEGATIVE: `((${value}) < 0)`,
            ZERO: `((${value}) == 0)`,
        };
        return mpAtomic(checks[block.getFieldValue('PROPERTY')] || checks.EVEN);
    },
    math_random_fraction_arduino() {
        mpUse('random');
        return mpAtomic('random.random()');
    },
    math_abs_arduino(block: Blockly.Block) {
        return mpAtomic(`abs(${mpValue(block, 'NUM', '0')})`);
    },
    math_bit_read(block: Blockly.Block) {
        return mpAtomic(`((int(${mpValue(block, 'NUM', '0')}) >> int(${mpValue(block, 'BIT', '0')})) & 1)`);
    },
    math_bit_set(block: Blockly.Block) {
        return mpAtomic(`(int(${mpValue(block, 'NUM', '0')}) | (1 << int(${mpValue(block, 'BIT', '0')})))`);
    },
    math_bit_clear(block: Blockly.Block) {
        return mpAtomic(`(int(${mpValue(block, 'NUM', '0')}) & ~(1 << int(${mpValue(block, 'BIT', '0')})))`);
    },
    math_high_byte(block: Blockly.Block) {
        return mpAtomic(`((int(${mpValue(block, 'NUM', '0')}) >> 8) & 0xFF)`);
    },
    math_low_byte(block: Blockly.Block) {
        return mpAtomic(`(int(${mpValue(block, 'NUM', '0')}) & 0xFF)`);
    },
    math_moving_avg_new(block: Blockly.Block) {
        const identifier = sanitizeIdentifier(block.getFieldValue('NAME') || 'myFilter', 'filter');
        ensureMpMovingAverage(identifier);
        return `${identifier}_size = max(1, int(${mpValue(block, 'SIZE', '10')}))\n${identifier}_values.clear()\n`;
    },
    math_moving_avg_add(block: Blockly.Block) {
        const identifier = sanitizeIdentifier(block.getFieldValue('NAME') || 'myFilter', 'filter');
        ensureMpMovingAverage(identifier);
        return `${identifier}_add(${mpValue(block, 'VALUE', '0')})\n`;
    },
    math_moving_avg_get(block: Blockly.Block) {
        const identifier = sanitizeIdentifier(block.getFieldValue('NAME') || 'myFilter', 'filter');
        ensureMpMovingAverage(identifier);
        return mpAtomic(`(sum(${identifier}_values) / len(${identifier}_values) if ${identifier}_values else 0)`);
    },
    math_random_int_custom(block: Blockly.Block) {
        mpUse('random');
        return mpAtomic(`random.randint(int(${mpValue(block, 'FROM', '1')}), int(${mpValue(block, 'TO', '6')}))`);
    },
    math_modulo_custom(block: Blockly.Block) {
        return mpAtomic(`(int(${mpValue(block, 'DIVIDEND', '0')}) % int(${mpValue(block, 'DIVISOR', '1')}))`);
    },
    math_round(block: Blockly.Block) {
        const value = mpValue(block, 'NUM', '0');
        const op = block.getFieldValue('OP') || 'ROUND';
        if (op === 'ROUND') return mpAtomic(`round(${value})`);
        mpUse('math');
        return mpAtomic(`math.${op === 'ROUNDUP' ? 'ceil' : 'floor'}(${value})`);
    },
    math_on_list(block: Blockly.Block) {
        return mpAtomic(`${block.getFieldValue('OP') === 'MAX' ? 'max' : 'min'}(${mpValue(block, 'LIST', '[0]')})`);
    },
    arduino_map(block: Blockly.Block) {
        const [value, fromLow, fromHigh, toLow, toHigh] = [['VALUE', '0'], ['FROM_LOW', '0'], ['FROM_HIGH', '1023'], ['TO_LOW', '0'], ['TO_HIGH', '255']].map(([name, fallback]) => mpValue(block, name, fallback));
        return mpAtomic(`((int(${value}) - (${fromLow})) * ((${toHigh}) - (${toLow})) // ((${fromHigh}) - (${fromLow})) + (${toLow}))`);
    },
    arduino_constrain(block: Blockly.Block) {
        return mpAtomic(`min(max(${mpValue(block, 'VALUE', '0')}, ${mpValue(block, 'LOW', '0')}), ${mpValue(block, 'HIGH', '255')})`);
    },
});

// ----------------------------------------------------------------------------
// 3. GENERATOR HELPERS
// ----------------------------------------------------------------------------
// We no longer export a unified generateCode that returns a single string, 
// because BlockEditor needs the raw setups dictionary from the generator to fill the templates.

export function getGenerator(type: string): Blockly.CodeGenerator {
    if (type === "micropython") return micropythonGenerator;
    return arduinoGenerator;
}
