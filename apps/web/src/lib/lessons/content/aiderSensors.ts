import type { Lesson, LessonActivity, LessonStep } from '../types';
import {
  BREADBOARD,
  CLOCK_FROM_INTERNET,
  PICO,
  USB,
  WIFI,
  WIFI_JOIN,
  analogPin,
  autoRefreshes,
  code,
  credentialsStep,
  handlesPath,
  i2cOnGp8Gp9,
  importsDriver,
  inputPin,
  jumpers,
  libraryStep,
  openPageStep,
  outputPin,
  pasteCodeStep,
  servesOnPort80,
  uploadStep,
  webServer,
} from './aiderShared';

// AIDER projects 34-41: sensors shown on a web page, and a doorbell rung from one. Adapted from the
// STEMAIDE AIDER student manuals; see aiderShared.ts for the corrections every program shares.
//
// Corrections to single manuals:
// - 35: the kit's BME280 driver returns humidity as "45.23%" (no space), so hum.replace(' %', '')
//   left the % in and float() crashed on every page load. It now strips '%'.
// - 37, 39, 40: the pages showed the time from a clock that nothing had set. 39 and 40 now set it
//   from the internet (ntptime); 37 says how long ago the last motion was instead.
// - 38: the HTTP status line was scrambled ('1 200 OKHTTP/1.'), so browsers rejected the page.
// - 40: the rain module drives its own output, so the internal pull-down is gone (it fought the
//   module's pull-up), and a repeated `global` line is removed.

const wireStep = (id: string, title: string, body: string, hint: string): LessonStep => ({ id, kind: 'wire', title, body, hint });

const BME280_PART = { type: 'BME280', label: 'BME280 sensor module', count: 1 };

const bme280Wiring = (): LessonStep =>
  wireStep(
    'build',
    'Connect the BME280',
    'Put the BME280 module on the breadboard. Connect its VCC (sometimes labelled VIN) to 3V3 (pin 36 on the Pico), GND to GND (pin 38), SDA to GP8 (pin 11) and SCL to GP9 (pin 12).',
    'SDA carries the data and SCL the clock: together they are the I2C bus, which several sensors can share. Use 3V3, not VBUS (5 V).'
  );

const BME280_NOT_FOUND =
  'If the Terminal shows an OSError as the program starts, the Pico cannot reach the sensor: check the four wires, especially SDA and SCL. Some BME280 boards answer at address 0x77: then change BME280.BME280(i2c=i2c) to BME280.BME280(i2c=i2c, address=0x77).';

// --- Project 34: Online temperature monitor -----------------------------------------------------

const TEMPERATURE_CODE = String.raw`import network
import socket
from machine import Pin, I2C
import BME280
import time

${WIFI_JOIN}

# ==================== SENSOR SETUP ====================
# BME280 on I2C bus 0: SDA on GP8, SCL on GP9
i2c = I2C(0, sda=Pin(8), scl=Pin(9), freq=400000)
bme = BME280.BME280(i2c=i2c)
print("Temperature now:", bme.temperature)

# ==================== WEB PAGE ====================
def web_page():
    temp = bme.temperature  # text such as "23.45C"

    html = """<!DOCTYPE html>
<html>
<head>
    <title>Temperature Monitor</title>
    <meta http-equiv="refresh" content="5">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {font-family: Arial; text-align: center; padding: 50px;}
        .temp {font-size: 48px; color: #2196F3;}
        .label {font-size: 24px; color: #666;}
    </style>
</head>
<body>
    <h1>Temperature Monitor</h1>
    <p class="label">Current Temperature:</p>
    <p class="temp">TEMP</p>
    <p><small>Auto-refreshes every 5 seconds</small></p>
</body>
</html>"""
    return html.replace('TEMP', temp)

${webServer('        response = web_page()')}`;

const temperatureActivity: LessonActivity = {
  id: 'aider-34-temperature',
  title: 'Show the temperature on a web page',
  goal: 'Read the temperature from a BME280 sensor and show it on a web page that refreshes itself every 5 seconds.',
  realWorld: 'Server rooms, greenhouses and fridges in clinics are watched like this, from any phone on the network.',
  parts: [PICO, BME280_PART, BREADBOARD, jumpers(4), USB, WIFI],
  onRealHardware: true,
  steps: [
    libraryStep('BME280', 'BME280'),
    bme280Wiring(),
    pasteCodeStep(
      TEMPERATURE_CODE,
      [importsDriver('BME280'), i2cOnGp8Gp9, servesOnPort80, autoRefreshes],
      'joins your Wi-Fi network, reads the BME280 over I2C, and serves a page with the temperature'
    ),
    credentialsStep(),
    uploadStep(),
    openPageStep(
      'Type the Pico\'s IP address into the browser of a phone or computer on the same Wi-Fi network. The page shows the temperature and refreshes every 5 seconds. Hold the sensor between your fingers: the reading climbs within a few refreshes.',
      `The Terminal prints the first reading as soon as the program starts. ${BME280_NOT_FOUND}`
    ),
  ],
  solutionCode: TEMPERATURE_CODE,
  observe: 'The page shows the temperature, and it rises when you warm the sensor with your fingers.',
  wrapUp: 'The <meta http-equiv="refresh"> line makes the browser ask again every 5 seconds, so the page stays live. Try this next: show the pressure as well, with bme.pressure.',
};

// --- Project 35: Online humidity monitor --------------------------------------------------------

const HUMIDITY_CODE = String.raw`import network
import socket
from machine import Pin, I2C
import BME280
import time

${WIFI_JOIN}

# ==================== SENSOR SETUP ====================
i2c = I2C(0, sda=Pin(8), scl=Pin(9), freq=400000)
bme = BME280.BME280(i2c=i2c)
print("Humidity now:", bme.humidity)

def get_humidity_status(humidity):
    """Return status based on humidity level"""
    if humidity < 30:
        return "DRY", "orange"
    elif humidity <= 60:
        return "COMFORTABLE", "green"
    else:
        return "HUMID", "red"

# ==================== WEB PAGE ====================
def web_page():
    hum = bme.humidity  # text such as "45.23%"
    humidity_val = int(float(hum.replace('%', '')))  # the number without the % sign
    status, color = get_humidity_status(humidity_val)

    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Humidity Monitor</title>
    <meta http-equiv="refresh" content="5">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {{font-family: Arial; text-align: center; padding: 50px;}}
        .humidity {{font-size: 60px; color: #2196F3;}}
        .status {{font-size: 32px; padding: 10px 20px; color: white; background-color: {color};}}
    </style>
</head>
<body>
    <h1>Humidity Monitor</h1>
    <p class="humidity">{hum}</p>
    <p class="status">{status}</p>
    <p><small>Comfortable: 30-60% | Auto-refreshes every 5s</small></p>
</body>
</html>"""
    return html

${webServer('        response = web_page()')}`;

const humidityActivity: LessonActivity = {
  id: 'aider-35-humidity',
  title: 'Show humidity with a status',
  goal: 'Read the humidity from the BME280 and show it with a coloured status: DRY, COMFORTABLE or HUMID.',
  realWorld: 'Libraries, museums and grain stores keep humidity in a safe range; a clear status tells staff when to act.',
  parts: [PICO, BME280_PART, BREADBOARD, jumpers(4), USB, WIFI],
  onRealHardware: true,
  steps: [
    libraryStep('BME280', 'BME280'),
    { ...bme280Wiring(), body: `${bme280Wiring().body} This is the same wiring as the temperature monitor.` },
    pasteCodeStep(
      HUMIDITY_CODE,
      [importsDriver('BME280'), i2cOnGp8Gp9, code(String.raw`def\s+get_humidity_status\(`, 'Works out DRY, COMFORTABLE or HUMID'), servesOnPort80],
      'joins your Wi-Fi network, reads the humidity, decides whether the air is dry, comfortable or humid, and serves a page that shows it'
    ),
    credentialsStep(),
    uploadStep(),
    openPageStep(
      'Open the Pico\'s IP address on a phone or computer on the same Wi-Fi network. Then breathe gently on the sensor: within a few refreshes the humidity jumps and the status turns red, HUMID.',
      `${BME280_NOT_FOUND} The driver gives humidity as text such as "45.23%"; the program takes off the % sign before it compares the number.`
    ),
  ],
  solutionCode: HUMIDITY_CODE,
  observe: 'The page shows the humidity and a coloured status, and turns HUMID when you breathe on the sensor.',
  wrapUp: 'get_humidity_status turns a number into a word and a colour, which people read at a glance. Try this next: change the limits for a room you know, such as a store room that must stay below 50%.',
};

// --- Project 36: Light intensity logger ----------------------------------------------------------

const LIGHT_CODE = String.raw`import network
import socket
from machine import Pin, ADC
import time

${WIFI_JOIN}

# ==================== SENSOR SETUP ====================
# Light sensor (LDR) on GP26, an analog input
light_sensor = ADC(Pin(26))

# Data storage - rolling log of the last 10 readings
MAX_READINGS = 10
readings = []

def read_light():
    """Read light sensor and return percentage"""
    value = light_sensor.read_u16()  # 0 to 65535
    percentage = int((value / 65535) * 100)
    return percentage

print("Light level now:", read_light(), "%")

# ==================== WEB PAGE ====================
def web_page():
    # Take a reading every time the page loads
    current = read_light()
    readings.append(current)

    # Keep only the last 10 readings
    if len(readings) > MAX_READINGS:
        readings.pop(0)

    # Make one table row per reading
    history_html = ""
    for i, val in enumerate(readings):
        history_html += f"<tr><td>{i+1}</td><td>{val}%</td></tr>"

    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Light Logger</title>
    <meta http-equiv="refresh" content="3">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {{font-family: Arial; text-align: center; padding: 30px;}}
        .current {{font-size: 60px; color: #FFC107;}}
        table {{margin: 20px auto; border-collapse: collapse;}}
        th, td {{padding: 8px; border: 1px solid #ddd;}}
    </style>
</head>
<body>
    <h1>Light Intensity Logger</h1>
    <p class="current">{current}%</p>
    <h3>History (Last {len(readings)} readings)</h3>
    <table>
        <tr><th>#</th><th>Light Level</th></tr>
        {history_html}
    </table>
</body>
</html>"""
    return html

${webServer('        response = web_page()')}`;

const lightActivity: LessonActivity = {
  id: 'aider-36-light',
  title: 'Log the light level',
  goal: 'Measure light with an LDR and show the last 10 readings in a table on a web page.',
  realWorld: 'Farmers and builders log light through the day to plan where plants grow best and when lights should switch on.',
  parts: [
    PICO,
    { type: 'LDR', label: 'LDR (light-dependent resistor)', count: 1 },
    { type: 'RESISTOR_10K', label: '10 kΩ resistor (brown-black-orange)', count: 1 },
    BREADBOARD,
    jumpers(4),
    USB,
    WIFI,
  ],
  onRealHardware: true,
  steps: [
    wireStep(
      'build',
      'Build the light sensor',
      'Put the LDR in the breadboard with its two legs in different rows. Connect one leg to 3V3 (pin 36). Connect the other leg to GP26 (pin 31), and put the 10 kΩ resistor from that same row to GND (pin 38).',
      'The LDR and the resistor share the 3.3 V between them: more light lowers the LDR\'s resistance, so GP26 sees a higher voltage. GP26, GP27 and GP28 are the Pico\'s analog inputs.'
    ),
    pasteCodeStep(
      LIGHT_CODE,
      [analogPin('light_sensor', 26, 'Reads the light sensor on GP26'), code(String.raw`MAX_READINGS\s*=\s*10\b`, 'Keeps the last 10 readings'), servesOnPort80],
      'joins your Wi-Fi network, reads the light level each time the page loads, and serves a page with the last 10 readings'
    ),
    credentialsStep(),
    uploadStep(),
    openPageStep(
      'Open the Pico\'s IP address on a phone or computer on the same Wi-Fi network. Every 3 seconds the page reloads and adds a reading. Cover the LDR with your hand for a few readings, then shine a torch on it, and watch the table.',
      'The table only grows while the page is open: each reading is taken when the browser asks for the page.'
    ),
  ],
  solutionCode: LIGHT_CODE,
  observe: 'The table fills with readings that fall when you cover the LDR and rise in bright light.',
  wrapUp: 'readings.pop(0) throws away the oldest reading, so the list never grows past 10: a rolling log. Try this next: show the lowest and highest reading with min(readings) and max(readings).',
};

// --- Project 37: PIR motion alert ------------------------------------------------------------

const MOTION_CODE = String.raw`import network
import socket
from machine import Pin
import time

${WIFI_JOIN}

# ==================== SENSOR SETUP ====================
# PIR motion sensor on GP1
pir = Pin(1, Pin.IN, Pin.PULL_DOWN)

# Motion tracking variables
motion_count = 0
last_motion_time = None

def motion_detected(pin):
    """Runs by itself (an interrupt) every time the PIR output goes high"""
    global motion_count, last_motion_time
    motion_count += 1
    last_motion_time = time.time()

# Attach the interrupt
pir.irq(trigger=Pin.IRQ_RISING, handler=motion_detected)

# ==================== WEB PAGE ====================
def web_page():
    # Check the motion state right now
    if pir.value() == 1:
        current_motion = "DETECTED"
        css_class = "detected"
    else:
        current_motion = "No Motion"
        css_class = "clear"

    if last_motion_time is None:
        last_seen = "No motion yet"
    else:
        last_seen = f"Last motion: {time.time() - last_motion_time} seconds ago"

    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Motion Alert</title>
    <meta http-equiv="refresh" content="2">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {{font-family: Arial; text-align: center; padding: 50px;}}
        .status {{font-size: 48px; padding: 20px;}}
        .detected {{background-color: #ff4444; color: white;}}
        .clear {{background-color: #4CAF50; color: white;}}
        .count {{font-size: 24px; color: #666;}}
    </style>
</head>
<body>
    <h1>PIR Motion Alert</h1>
    <p class="status {css_class}">{current_motion}</p>
    <p class="count">Total Detections: {motion_count}</p>
    <p>{last_seen}</p>
    <p><small>Page auto-refreshes every 2 seconds</small></p>
</body>
</html>"""
    return html

print("Wait about a minute for the PIR sensor to settle before testing")
${webServer('        response = web_page()', 'print("Motion detection server running!")')}`;

const motionActivity: LessonActivity = {
  id: 'aider-37-motion',
  title: 'Send motion alerts to a web page',
  goal: 'Count movements with a PIR sensor and an interrupt, and show the alert on a page that refreshes every 2 seconds.',
  realWorld: 'Security lights, alarms and room-occupancy counters all start with a PIR sensor like this one.',
  parts: [PICO, { type: 'PIR', label: 'PIR motion sensor (HC-SR501)', count: 1 }, BREADBOARD, jumpers(3), USB, WIFI],
  onRealHardware: true,
  steps: [
    wireStep(
      'build',
      'Connect the PIR sensor',
      'Connect the PIR sensor\'s VCC to VBUS (5 V, pin 40 on the Pico), GND to GND (pin 38) and OUT to GP1 (pin 2). The labels are next to the pins, sometimes under the white dome: lift it off gently to read them.',
      'The PIR needs 5 V to run, but its OUT pin only gives 3.3 V, which is safe for the Pico. VBUS has 5 V while the Pico is plugged into USB.'
    ),
    pasteCodeStep(
      MOTION_CODE,
      [inputPin('pir', 1, 'GP1 is an input for the PIR sensor'), code(String.raw`pir\.irq\(`, 'Counts motion with an interrupt'), servesOnPort80],
      'joins your Wi-Fi network, counts every movement the PIR sees with an interrupt, and serves an alert page'
    ),
    credentialsStep(),
    uploadStep(),
    openPageStep(
      'Open the Pico\'s IP address on a phone on the same Wi-Fi network, then wait a minute for the sensor to settle. Wave your hand in front of the dome: the page turns red, says DETECTED, and the count goes up.',
      'A PIR sensor needs 30 to 60 seconds after power-up before it works properly. Its two orange knobs set how far it sees and how long OUT stays high after a movement.'
    ),
  ],
  solutionCode: MOTION_CODE,
  observe: 'The page shows DETECTED in red when you move, and the total goes up with each new movement.',
  wrapUp: 'The interrupt counts a movement the moment it happens, even when no one has the page open. Try this next: add a buzzer that beeps on each detection.',
};

// --- Project 38: Water level webpage -------------------------------------------------------------

const WATER_CODE = String.raw`import network
import socket
from machine import Pin, ADC
import time

${WIFI_JOIN}

# ==================== SENSOR SETUP ====================
# Water level sensor on GP26, an analog input
water_sensor = ADC(Pin(26))

def read_water_level():
    """Read water level as percentage"""
    value = water_sensor.read_u16()
    percentage = int((value / 65535) * 100)
    return percentage, value

def get_status_color(level):
    """Get status and color for the water level"""
    if level < 30:
        return "LOW", "red"
    elif level < 70:
        return "MEDIUM", "orange"
    else:
        return "HIGH", "green"

print("Water level now:", read_water_level()[0], "%")

# ==================== WEB PAGE ====================
def web_page():
    level, raw = read_water_level()
    status, color = get_status_color(level)

    # The bar is as wide as the level: 0 to 100%
    bar_width = level

    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Water Level</title>
    <meta http-equiv="refresh" content="3">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {{font-family: Arial; text-align: center; padding: 40px;}}
        .container {{width: 300px; height: 30px; border: 2px solid #333; margin: 20px auto;}}
        .bar {{height: 100%; background-color: {color}; width: {bar_width}%;}}
        .level {{font-size: 48px; color: {color};}}
        .status {{font-size: 24px; padding: 10px; background-color: {color}; color: white;}}
    </style>
</head>
<body>
    <h1>Water Level Monitor</h1>
    <div class="container"><div class="bar"></div></div>
    <p class="level">{level}%</p>
    <p class="status">Status: {status}</p>
    <p>Raw ADC: {raw}</p>
</body>
</html>"""
    return html

${webServer('        response = web_page()', 'print("Water level server running!")')}`;

const waterActivity: LessonActivity = {
  id: 'aider-38-water',
  title: 'Show a water level as a bar',
  goal: 'Measure how deep the sensor is in water and show it as a coloured bar on a web page.',
  realWorld: 'Water tanks at schools and farms use level sensors so nobody has to climb up and look inside.',
  parts: [PICO, { type: 'WATER_LEVEL', label: 'Water level sensor', count: 1 }, { type: 'CUP', label: 'Cup of water', count: 1 }, BREADBOARD, jumpers(3), USB, WIFI],
  onRealHardware: true,
  steps: [
    wireStep(
      'build',
      'Connect the water level sensor',
      'Connect the sensor\'s + (VCC) to 3V3 (pin 36), − (GND) to GND (pin 38) and S (signal) to GP26 (pin 31). Keep the Pico and the top of the sensor dry: only the lines on the lower part go into the water.',
      'The more of the lines are under water, the better they conduct, and the higher the voltage on GP26.'
    ),
    pasteCodeStep(
      WATER_CODE,
      [analogPin('water_sensor', 26, 'Reads the water sensor on GP26'), code(String.raw`def\s+get_status_color\(`, 'Works out LOW, MEDIUM or HIGH'), servesOnPort80],
      'joins your Wi-Fi network, reads the water level, and serves a page with a coloured bar'
    ),
    credentialsStep(),
    uploadStep(),
    openPageStep(
      'Open the Pico\'s IP address on a phone on the same Wi-Fi network. Lower the sensor slowly into a cup of water: the bar grows and the status changes from LOW to MEDIUM to HIGH.',
      'If the level never reaches HIGH even when the sensor is deep in water, the sensor tops out below 100%. Look at the Raw ADC number at full depth and change the limits in get_status_color to suit.'
    ),
  ],
  solutionCode: WATER_CODE,
  observe: 'The bar grows and changes colour as the sensor goes deeper into the water.',
  wrapUp: 'An analog input gives a number from 0 to 65535, and the program turns it into a percentage. Try this next: turn the bar on its side so it fills from the bottom, like a tank.',
};

// --- Project 39: Soil moisture display ---------------------------------------------------------

const SOIL_CODE = String.raw`import network
import socket
import ntptime
from machine import Pin, ADC
import time

${WIFI_JOIN}

${CLOCK_FROM_INTERNET}

# ==================== SENSOR SETUP ====================
# Soil moisture sensor on GP26, an analog input
soil_sensor = ADC(Pin(26))

def read_soil_moisture():
    """Read soil moisture - returns percentage (inverted)"""
    raw = soil_sensor.read_u16()
    # Invert: dry soil = high value, wet soil = low value
    moisture = 100 - int((raw / 65535) * 100)
    return moisture, raw

def get_watering_status(moisture):
    """Decide whether the plant needs water"""
    if moisture < 30:
        return "NEEDS WATER!", "red"
    elif moisture < 60:
        return "OK", "orange"
    else:
        return "WET", "green"

print("Soil moisture now:", read_soil_moisture()[0], "%")

# ==================== WEB PAGE ====================
def web_page():
    moisture, raw = read_soil_moisture()
    status, color = get_watering_status(moisture)

    current_time = time.localtime()
    time_str = f"{current_time[3]:02d}:{current_time[4]:02d}"

    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Plant Monitor</title>
    <meta http-equiv="refresh" content="5">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {{font-family: Arial; text-align: center; padding: 40px;}}
        .moisture {{font-size: 60px; color: #2196F3;}}
        .status {{font-size: 32px; padding: 15px; color: white; background-color: {color};}}
        .bar {{width: 300px; height: 30px; background: #ddd; margin: 20px auto;}}
        .fill {{height: 100%; background-color: {color}; width: {moisture}%;}}
    </style>
</head>
<body>
    <h1>🌱 Plant Monitor</h1>
    <div class="bar"><div class="fill"></div></div>
    <p class="moisture">{moisture}%</p>
    <p class="status">{status}</p>
    <p>Updated: {time_str} (UTC)</p>
</body>
</html>"""
    return html

${webServer('        response = web_page()', 'print("Soil moisture server running!")')}`;

const soilActivity: LessonActivity = {
  id: 'aider-39-soil',
  title: 'Tell when a plant needs water',
  goal: 'Measure how wet the soil is and show a web page that says when the plant needs water.',
  realWorld: 'Smart farms put moisture sensors in the fields and only water where the soil is dry, which saves water.',
  parts: [PICO, { type: 'SOIL_MOISTURE', label: 'Soil moisture sensor', count: 1 }, { type: 'POT_PLANT', label: 'Pot of soil', count: 1 }, BREADBOARD, jumpers(3), USB, WIFI],
  onRealHardware: true,
  steps: [
    wireStep(
      'build',
      'Connect the soil moisture sensor',
      'Connect the sensor\'s VCC to 3V3 (pin 36), GND to GND (pin 38) and AOUT (sometimes A0) to GP26 (pin 31). If your sensor has a small control board, the fork plugs into the board and the board\'s pins go to the Pico.',
      'Push the fork into the soil up to the line, not deeper: the top part with the parts on it must stay dry.'
    ),
    pasteCodeStep(
      SOIL_CODE,
      [analogPin('soil_sensor', 26, 'Reads the soil sensor on GP26'), code(String.raw`100\s*-\s*int\(`, 'Turns the reading round, so wet soil scores high'), servesOnPort80],
      'joins your Wi-Fi network, sets its clock from the internet, reads the soil moisture, and serves a page that says when to water'
    ),
    credentialsStep(),
    uploadStep(),
    openPageStep(
      'Open the Pico\'s IP address on a phone on the same Wi-Fi network. With the sensor in dry soil the page says NEEDS WATER!. Water the pot (or dip the fork in a cup of water): within a few refreshes it says WET.',
      'The time is UTC (also called GMT): add or take away the hours of your time zone. If dry soil never reaches NEEDS WATER!, look at the reading in dry soil and in water, and move the limits in get_watering_status between them.'
    ),
  ],
  solutionCode: SOIL_CODE,
  observe: 'The page says NEEDS WATER! for dry soil and WET once the soil is watered.',
  wrapUp: 'This sensor gives high numbers for dry soil, so 100 minus the percentage turns it the right way round. Try this next: add an LED that lights when the plant needs water.',
};

// --- Project 40: Rain status webpage -----------------------------------------------------------

const RAIN_CODE = String.raw`import network
import socket
import ntptime
from machine import Pin
import time

${WIFI_JOIN}

${CLOCK_FROM_INTERNET}

# ==================== SENSOR SETUP ====================
# Rain sensor's digital output (DO) on GP14: the module sets it to 0 when the plate is wet
rain_sensor = Pin(14, Pin.IN)

# Event tracking
rain_events = 0
was_raining = False

# ==================== WEB PAGE ====================
def web_page():
    global rain_events, was_raining

    # Check rain status
    is_raining = rain_sensor.value() == 0  # Active LOW

    # Count a new rain event when it starts raining
    if is_raining and not was_raining:
        rain_events += 1
    was_raining = is_raining

    status = "RAINING" if is_raining else "DRY"
    icon = "🌧️" if is_raining else "☀️"

    current_time = time.localtime()
    time_str = f"{current_time[3]:02d}:{current_time[4]:02d}"

    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Rain Monitor</title>
    <meta http-equiv="refresh" content="2">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {{font-family: Arial; text-align: center; padding: 50px;}}
        .status {{font-size: 60px;}}
        .rain {{color: #2196F3;}}
        .dry {{color: #4CAF50;}}
        .counter {{font-size: 32px; padding: 20px; background: #f0f0f0;}}
    </style>
</head>
<body>
    <h1>🌧️ Rain Monitor</h1>
    <p class="status {'rain' if is_raining else 'dry'}">
        {icon} {status}
    </p>
    <div class="counter">
        <p>Rain Events Today: <strong>{rain_events}</strong></p>
        <p>Last Update: {time_str} (UTC)</p>
    </div>
</body>
</html>"""
    return html

${webServer('        response = web_page()', 'print("Rain monitor server running!")')}`;

const rainActivity: LessonActivity = {
  id: 'aider-40-rain',
  title: 'Show when it rains',
  goal: 'Detect rain with a rain sensor and show RAINING or DRY on a web page, with a count of rain events.',
  realWorld: 'Smart irrigation systems skip watering when it rains, and weather stations log every shower.',
  parts: [PICO, { type: 'RAIN_SENSOR', label: 'Rain sensor module (plate and control board)', count: 1 }, BREADBOARD, jumpers(3), USB, WIFI],
  onRealHardware: true,
  steps: [
    wireStep(
      'build',
      'Connect the rain sensor',
      'The rain plate connects to the small control board with two wires. Connect the control board\'s VCC to 3V3 (pin 36), GND to GND (pin 38) and DO (digital out) to GP14 (pin 19).',
      'The blue knob on the control board sets how wet counts as rain: drip water on the plate and turn the knob until the board\'s second LED lights.'
    ),
    pasteCodeStep(
      RAIN_CODE,
      [inputPin('rain_sensor', 14, 'GP14 is an input for the rain sensor'), code(String.raw`rain_events\s*\+=\s*1`, 'Counts rain events'), servesOnPort80],
      'joins your Wi-Fi network, sets its clock from the internet, checks the rain sensor, and serves a page that says RAINING or DRY'
    ),
    credentialsStep(),
    uploadStep(),
    openPageStep(
      'Open the Pico\'s IP address on a phone on the same Wi-Fi network. The page says DRY. Drip some water on the plate: it says RAINING and the count goes up. Dry the plate with a tissue and it goes back to DRY.',
      'DO goes to 0 (LOW) when the plate is wet, which is why the code checks value() == 0. The time is UTC (GMT).'
    ),
  ],
  solutionCode: RAIN_CODE,
  observe: 'The page switches between DRY and RAINING as you wet and dry the plate, and counts each new shower.',
  wrapUp: 'A rain event is counted when the state changes from dry to wet, not on every wet reading. Try this next: count rain with an interrupt, like the motion alert, so showers are counted even while no one has the page open.',
};

// --- Project 41: Wi-Fi doorbell ----------------------------------------------------------------

const DOORBELL_CODE = String.raw`import network
import socket
from machine import Pin
import time

${WIFI_JOIN}

# ==================== HARDWARE SETUP ====================
buzzer = Pin(0, Pin.OUT)
ring_count = 0

def play_ding_dong():
    """Play doorbell sound"""
    # Ding
    buzzer.value(1)
    time.sleep(0.1)
    buzzer.value(0)
    time.sleep(0.1)
    # Dong
    buzzer.value(1)
    time.sleep(0.2)
    buzzer.value(0)

# ==================== WEB PAGE ====================
def web_page():
    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Wi-Fi Doorbell</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {{font-family: Arial; text-align: center; padding: 50px;}}
        .bell {{font-size: 100px;}}
        .btn {{padding: 30px 60px; font-size: 32px; background: #2196F3; color: white; border: none; border-radius: 10px; cursor: pointer;}}
        .btn:active {{background: #1976D2;}}
        .count {{font-size: 24px; color: #666;}}
    </style>
</head>
<body>
    <h1>🔔 Wi-Fi Doorbell</h1>
    <p class="bell">🔔</p>
    <a href="/ring"><button class="btn">RING DOORBELL</button></a>
    <p class="count">Total rings: {ring_count}</p>
</body>
</html>"""
    return html

${webServer(
  String.raw`        if '/ring' in request:
            ring_count += 1
            print("Ding dong! Ring number", ring_count)
            play_ding_dong()

        response = web_page()`,
  'print("Doorbell server running!")'
)}`;

const doorbellActivity: LessonActivity = {
  id: 'aider-41-doorbell',
  title: 'Ring a doorbell from a web page',
  goal: 'Make a web page with a big RING DOORBELL button that plays a ding-dong on a buzzer and counts the rings.',
  realWorld: 'Smart doorbells send a message over Wi-Fi when someone presses them; this one works the other way round.',
  parts: [PICO, { type: 'BUZZER', label: 'Active buzzer', count: 1 }, BREADBOARD, jumpers(2), USB, WIFI],
  onRealHardware: true,
  steps: [
    wireStep(
      'build',
      'Connect the buzzer',
      'Connect the active buzzer\'s + leg (the longer leg, or the red wire) to GP0 (pin 1 on the Pico) and its − leg to GND (pin 38).',
      'An active buzzer beeps by itself when it gets power, so switching GP0 on and off makes the ding and the dong.'
    ),
    pasteCodeStep(
      DOORBELL_CODE,
      [outputPin('buzzer', 0, 'GP0 is an output for the buzzer'), handlesPath('/ring', 'Rings when the button is pressed'), servesOnPort80],
      'joins your Wi-Fi network and serves a page with a doorbell button that rings the buzzer'
    ),
    credentialsStep(),
    uploadStep(),
    openPageStep(
      'Open the Pico\'s IP address on a phone on the same Wi-Fi network and press RING DOORBELL. The buzzer plays ding-dong, the Terminal prints the ring number, and the page shows the total.',
      'After a ring the address ends in /ring, so reloading the page rings again: press the button instead.'
    ),
  ],
  solutionCode: DOORBELL_CODE,
  observe: 'The buzzer plays ding-dong each time you press the button, and the total goes up.',
  wrapUp: 'The button is just a link to /ring: the Pico looks for "/ring" in what the browser asks for. Try this next: add a second button that plays a different tune.',
};

// --- Lessons ----------------------------------------------------------------------------------

const aiderLesson = (slug: string, title: string, project: number, activity: LessonActivity): Lesson => ({
  slug,
  title,
  source: `STEMAIDE AIDER student manual: Project ${project}, ${title}`,
  activities: [activity],
});

export const temperatureMonitorLesson = aiderLesson('online-temperature-monitor', 'Online Temperature Monitor', 34, temperatureActivity);
export const humidityMonitorLesson = aiderLesson('online-humidity-monitor', 'Online Humidity Monitor', 35, humidityActivity);
export const lightLoggerLesson = aiderLesson('light-intensity-cloud-logger', 'Light Intensity Cloud Logger', 36, lightActivity);
export const motionAlertLesson = aiderLesson('pir-motion-alert-via-wi-fi', 'PIR Motion Alert via Wi-Fi', 37, motionActivity);
export const waterLevelLesson = aiderLesson('water-level-webpage', 'Water Level Webpage', 38, waterActivity);
export const soilMoistureLesson = aiderLesson('soil-moisture-cloud-display', 'Soil Moisture Cloud Display', 39, soilActivity);
export const rainStatusLesson = aiderLesson('rain-status-webpage', 'Rain Status Webpage', 40, rainActivity);
export const wifiDoorbellLesson = aiderLesson('wi-fi-doorbell', 'Wi-Fi Doorbell', 41, doorbellActivity);
