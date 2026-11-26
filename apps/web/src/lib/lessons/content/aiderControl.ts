import type { LessonActivity, LessonStep } from '../types';
import {
  BME280_NOT_FOUND,
  BME280_PART,
  BREADBOARD,
  CLOCK_FROM_INTERNET,
  OLED_PART,
  PICO,
  RELAY_PART,
  USB,
  WIFI,
  WIFI_JOIN,
  aiderLesson,
  autoRefreshes,
  bme280Wiring,
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
  relayModuleStep,
  servesOnPort80,
  uploadStep,
  watchStep,
  webServer,
  wireStep,
} from './aiderShared';

// AIDER projects 42-49 (without 47): an OLED dashboard, switching a motor, a pump and a timed
// relay from a web page, a dimmer, and two loggers. Adapted from the STEMAIDE AIDER student
// manuals; see aiderShared.ts for the corrections every program shares.
//
// Corrections to single manuals:
// - 42: the Wi-Fi settings move to the top and a failed join shows on the screen; the IP address
//   starts at the left edge (at x=20 a long address ran off the 128-pixel screen).
// - 43, 48: searched the bytes from recv() for '/on', which stops the server at the first click.
// - 44: the button was only checked when the page reloaded, so presses in between were lost; an
//   interrupt (with a short debounce) now logs every press, with the time from the internet.
// - 45: the brightness is worked out with whole numbers (65535 // 100), as single-precision floats
//   on the Pico made 100% come out at 65534.
// - 46: the page refreshed its own address, /?duration=30, every second, which restarted the timer
//   for ever; and the relay only switched off when someone had the page open. A machine.Timer now
//   switches it off, and the page refreshes to /.
// - 47 (heart rate) is not here: its code never reads the MAX30102 and always shows 72 BPM.
// - 49: readings were only logged when the page loaded; a Timer now logs one every 10 seconds,
//   timed by the clock from the internet.

const LED_PART = { type: 'LED', label: 'LED', count: 1 };
const RESISTOR_220 = { type: 'RESISTOR_220', label: '220 Ω resistor (red-red-brown)', count: 1 };
const EXTERNAL_5V = { type: 'POWER_5V', label: 'External 5 V supply (4 × AA battery pack or USB power bank)', count: 1 };

const ledOnGp0 = (): LessonStep =>
  wireStep(
    'build',
    'Build the LED circuit',
    'Put the LED on the breadboard: long leg (+) in one row, short leg (−) in another. Connect a 220 Ω resistor from the long leg\'s row to an empty row. Run a wire from GP0 (pin 1) to the resistor, and a wire from GND (pin 38) to the LED\'s short leg.',
    'If the LED never lights, turn it round: the long leg must go towards GP0.'
  );

// --- Project 42: IoT dashboard on an OLED --------------------------------------------------------

const DASHBOARD_CODE = String.raw`import network
from machine import Pin, I2C
import sh1106
import BME280
import time

# ==================== SETTINGS ====================
SSID = "YOUR_WIFI_NAME"
PASSWORD = "YOUR_PASSWORD"

# ==================== I2C DEVICES ====================
# The screen and the sensor share I2C bus 0 (SDA on GP8, SCL on GP9)
i2c = I2C(0, sda=Pin(8), scl=Pin(9), freq=400000)
print("I2C devices found:", [hex(address) for address in i2c.scan()])

display = sh1106.SH1106_I2C(128, 64, i2c)

# BME280 boards answer at address 0x76 or 0x77: try both
try:
    bme = BME280.BME280(i2c=i2c, address=0x76)
except OSError:
    bme = BME280.BME280(i2c=i2c, address=0x77)

# Splash screen
display.fill(0)
display.text("IoT Dashboard", 12, 20, 1)
display.text("Starting...", 20, 40, 1)
display.show()

# ==================== Wi-Fi ====================
wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect(SSID, PASSWORD)

print("Connecting to Wi-Fi...")
while wlan.isconnected() == False:
    if wlan.status() < 0:  # the Pico gave up: wrong Wi-Fi name or password
        print("Could not join", SSID, "- check the Wi-Fi name and password (2.4 GHz networks only)")
        display.fill(0)
        display.text("Wi-Fi failed:", 12, 16, 1)
        display.text("check name and", 8, 32, 1)
        display.text("password", 32, 44, 1)
        display.show()
        raise SystemExit
    display.fill(0)
    display.text("Connecting...", 12, 28, 1)
    display.show()
    time.sleep(1)

ip = wlan.ifconfig()[0]
print("Connected!")
print("IP Address:", ip)

# ==================== DASHBOARD ====================
while True:
    temp = bme.temperature  # text such as "23.45C"
    hum = bme.humidity      # text such as "45.23%"

    display.fill(0)

    # Title and a line under it
    display.text("IoT Dashboard", 12, 0, 1)
    display.line(0, 10, 127, 10, 1)

    # Wi-Fi info
    display.text("Wi-Fi: OK", 0, 16, 1)
    display.text("IP:", 0, 26, 1)
    display.text(ip, 0, 36, 1)

    # Sensor data
    display.line(0, 46, 127, 46, 1)
    display.text("T:" + temp, 0, 50, 1)
    display.text("H:" + hum, 64, 50, 1)

    display.show()
    time.sleep(2)
`;

const dashboardActivity: LessonActivity = {
  id: 'aider-42-dashboard',
  title: 'Build a dashboard on an OLED screen',
  goal: 'Show the Wi-Fi status, the IP address, the temperature and the humidity on a small OLED screen, updated every 2 seconds.',
  realWorld: 'Routers, 3D printers and lab instruments show their status on a small screen like this, so nobody needs a computer to check them.',
  parts: [PICO, OLED_PART, BME280_PART, BREADBOARD, jumpers(8), USB, WIFI],
  onRealHardware: true,
  steps: [
    libraryStep('SH1106', 'OLED screen'),
    libraryStep('BME280', 'BME280'),
    wireStep(
      'build',
      'Connect the screen and the sensor',
      'Both modules use the same four lines. Connect each one\'s VCC to 3V3 (pin 36), GND to GND (pin 38), SDA to GP8 (pin 11) and SCL to GP9 (pin 12). Use breadboard rows to join the two SDA wires together, and the two SCL wires together.',
      'Devices on one I2C bus have different addresses, like houses on one street: the screen is 0x3c and the BME280 0x76 or 0x77. When the program starts, the Terminal lists the addresses the Pico finds.'
    ),
    pasteCodeStep(
      DASHBOARD_CODE,
      [
        importsDriver('sh1106'),
        importsDriver('BME280'),
        i2cOnGp8Gp9,
        code(String.raw`SH1106_I2C\(\s*128\s*,\s*64\s*,\s*i2c`, 'Sets up the 128 × 64 screen'),
        code(String.raw`display\.show\(\)`, 'Shows each drawing on the screen'),
      ],
      'shows a splash screen, joins your Wi-Fi network, and then draws the IP address, temperature and humidity on the screen every 2 seconds'
    ),
    credentialsStep(),
    uploadStep(),
    watchStep(
      'Watch the screen',
      'The screen shows "IoT Dashboard" and "Connecting...", then the dashboard: Wi-Fi OK, the IP address, and T: and H: along the bottom. Breathe on the sensor and watch H: rise.',
      `If the screen stays dark but the Terminal shows readings, check the screen's four wires; the Terminal's list of I2C devices should include 0x3c. If the picture is upside down, change SH1106_I2C(128, 64, i2c) to SH1106_I2C(128, 64, i2c, rotate=180). ${BME280_NOT_FOUND}`
    ),
  ],
  solutionCode: DASHBOARD_CODE,
  observe: 'The screen shows the IP address with the temperature and humidity, and the numbers change every 2 seconds.',
  wrapUp: 'display.text writes into a picture in the Pico\'s memory, and display.show sends the whole picture to the screen at once, so it never flickers. Try this next: draw a bar for the humidity with display.fill_rect.',
};

// --- Project 43: Online motor control --------------------------------------------------------

const MOTOR_CODE = String.raw`import network
import socket
from machine import Pin
import time

${WIFI_JOIN}

# ==================== HARDWARE SETUP ====================
# Relay on GPIO 0 - Active LOW!
relay = Pin(0, Pin.OUT)
relay.value(1)  # Start OFF

# ==================== WEB PAGE ====================
def web_page():
    state = "ON" if relay.value() == 0 else "OFF"
    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Motor Control</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {{font-family: Arial; text-align: center; padding: 50px;}}
        .btn {{padding: 30px 50px; font-size: 28px; margin: 10px; border: none; border-radius: 10px; cursor: pointer;}}
        .on {{background: #4CAF50; color: white;}}
        .off {{background: #f44336; color: white;}}
        .status {{font-size: 36px; margin: 20px;}}
    </style>
</head>
<body>
    <h1>Motor Control</h1>
    <p class="status">Motor: {state}</p>
    <a href="/on"><button class="btn on">START</button></a>
    <a href="/off"><button class="btn off">STOP</button></a>
</body>
</html>"""
    return html

${webServer(
  String.raw`        if '/on' in request:
            relay.value(0)  # Relay ON: the motor runs
            print("Motor ON")
        elif '/off' in request:
            relay.value(1)  # Relay OFF: the motor stops
            print("Motor OFF")

        response = web_page()`,
  'print("Motor control server running!")'
)}`;

const motorActivity: LessonActivity = {
  id: 'aider-43-motor',
  title: 'Start and stop a motor from a web page',
  goal: 'Switch a DC motor on its own power supply through a relay, with START and STOP buttons on a web page.',
  realWorld: 'Fans, conveyor belts and gates are switched like this; the diode across the motor protects the switch, as it does in real machines.',
  parts: [
    PICO,
    RELAY_PART,
    { type: 'DC_MOTOR', label: 'Small DC motor (5 V)', count: 1 },
    { type: 'DIODE_1N4007', label: '1N4007 diode', count: 1 },
    EXTERNAL_5V,
    BREADBOARD,
    jumpers(8),
    USB,
    WIFI,
  ],
  onRealHardware: true,
  steps: [
    relayModuleStep(),
    wireStep(
      'build-motor',
      'Connect the motor through the relay',
      'Connect the external supply\'s + to the relay\'s COM terminal. Connect the relay\'s NO (normally open) terminal to one motor wire, and the other motor wire to the supply\'s −. Then put the 1N4007 diode across the two motor wires: its striped end on the wire from NO, the other end on the wire to −.',
      'A spinning motor pushes back a spike of voltage when its power stops; the diode gives the spike a safe path so it does not burn the relay\'s contacts. The motor gets its own supply because it can draw more current than the Pico\'s USB port gives. Never connect mains (wall socket) power to the relay.'
    ),
    pasteCodeStep(
      MOTOR_CODE,
      [outputPin('relay', 0, 'GP0 is an output for the relay'), handlesPath('/on', 'START switches the motor on'), handlesPath('/off', 'STOP switches it off'), servesOnPort80],
      'joins your Wi-Fi network and serves a page whose START and STOP buttons switch the relay'
    ),
    credentialsStep(),
    uploadStep(),
    openPageStep(
      'Open the Pico\'s IP address on a phone on the same Wi-Fi network. Press START: the relay clicks and the motor spins. Press STOP: it clicks again and the motor stops.',
      'Relay clicks but the motor does not turn? Check the external supply (switched on, batteries fresh) and the COM and NO wires. No click at all? Check VCC, GND and IN on the relay module.'
    ),
  ],
  solutionCode: MOTOR_CODE,
  observe: 'The motor starts when you press START and stops when you press STOP.',
  wrapUp: 'The Pico never powers the motor: it only tells the relay when to join the motor to its own supply. Try this next: add a third button that runs the motor for 5 seconds and then stops it.',
};

// --- Project 44: Wi-Fi button logger -----------------------------------------------------------

const BUTTON_LOG_CODE = String.raw`import network
import socket
import ntptime
from machine import Pin
import time

${WIFI_JOIN}

${CLOCK_FROM_INTERNET}

# ==================== BUTTON SETUP ====================
# Button between GP1 and GND: the pull-up keeps GP1 at 1 until the button pulls it to 0
button = Pin(1, Pin.IN, Pin.PULL_UP)

# Event storage
MAX_EVENTS = 20
events = []
press_count = 0
last_press_ms = 0

def get_timestamp():
    """Get the current time as text (UTC)"""
    t = time.localtime()
    return f"{t[3]:02d}:{t[4]:02d}:{t[5]:02d}"

def button_pressed(pin):
    """Runs by itself (an interrupt) the moment the button is pressed"""
    global press_count, last_press_ms
    now = time.ticks_ms()
    if time.ticks_diff(now, last_press_ms) < 200:  # one press can bounce: ignore the extra ones
        return
    last_press_ms = now
    press_count += 1
    timestamp = get_timestamp()
    events.append(timestamp)
    if len(events) > MAX_EVENTS:
        events.pop(0)
    print("Button pressed at", timestamp)

button.irq(trigger=Pin.IRQ_FALLING, handler=button_pressed)

# ==================== WEB PAGE ====================
def web_page():
    pressed = button.value() == 0

    # Build history table, newest first
    history = ""
    for i, evt in enumerate(reversed(events)):
        history += f"<tr><td>{press_count - i}</td><td>{evt}</td></tr>"

    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Button Logger</title>
    <meta http-equiv="refresh" content="1">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {{font-family: monospace; padding: 20px;}}
        table {{width: 100%; border-collapse: collapse;}}
        th, td {{padding: 10px; border: 1px solid #ddd; text-align: center;}}
        .btn {{background: {'red' if pressed else 'green'}; color: white; padding: 5px 10px;}}
    </style>
</head>
<body>
    <h1>Button Press Logger</h1>
    <p>Button Status: <span class="btn">{'PRESSED' if pressed else 'NOT PRESSED'}</span></p>
    <p>Total Presses: {press_count}</p>
    <h2>History (UTC)</h2>
    <table>
        <tr><th>#</th><th>Time</th></tr>
        {history}
    </table>
</body>
</html>"""
    return html

${webServer('        response = web_page()', 'print("Logger server running!")')}`;

const buttonLogActivity: LessonActivity = {
  id: 'aider-44-button-log',
  title: 'Log every button press',
  goal: 'Record the time of every press of a push button, and show the last 20 on a web page.',
  realWorld: 'Visitor counters, factory machines and call buttons in hospitals log each press with its time.',
  parts: [PICO, { type: 'BUTTON', label: 'Push button', count: 1 }, BREADBOARD, jumpers(2), USB, WIFI],
  onRealHardware: true,
  steps: [
    wireStep(
      'build',
      'Connect the push button',
      'Put the push button across the breadboard\'s middle gap. Connect one of its legs to GP1 (pin 2 on the Pico) and the leg on the same side of the gap, at the other end of the button, to GND (pin 3).',
      'No resistor needed: Pin.PULL_UP connects a resistor inside the Pico, so GP1 reads 1 until the button joins it to GND and it reads 0.'
    ),
    pasteCodeStep(
      BUTTON_LOG_CODE,
      [inputPin('button', 1, 'GP1 is an input for the button'), code(String.raw`button\.irq\(`, 'Catches every press with an interrupt'), servesOnPort80, autoRefreshes],
      'joins your Wi-Fi network, gets the time from the internet, logs every button press, and serves a page with the history'
    ),
    credentialsStep(),
    uploadStep(),
    openPageStep(
      'Open the Pico\'s IP address on a phone on the same Wi-Fi network. Press the button a few times: each press appears in the history with its time, the newest at the top, and the Terminal prints it too.',
      'One press counted twice? The button\'s contacts bounce: the program ignores presses less than 200 ms apart, and you can raise that number. The times are UTC (also called GMT).'
    ),
  ],
  solutionCode: BUTTON_LOG_CODE,
  observe: 'Every button press appears in the history with its time, even presses made while the page was closed.',
  wrapUp: 'The interrupt catches presses the moment they happen; the web page only shows the list. Try this next: count the presses per minute.',
};

// --- Project 45: Web LED brightness ------------------------------------------------------------

const BRIGHTNESS_CODE = String.raw`import network
import socket
from machine import Pin, PWM
import time

${WIFI_JOIN}

# ==================== HARDWARE SETUP ====================
# PWM LED on GPIO 0
led = PWM(Pin(0))
led.freq(1000)  # switch on and off 1000 times a second
brightness = 0
led.duty_u16(0)

# ==================== WEB PAGE ====================
def web_page():
    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>LED Brightness</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {{font-family: Arial; text-align: center; padding: 50px;}}
        .slider {{width: 300px;}}
        .brightness {{font-size: 48px; color: #FFC107;}}
    </style>
</head>
<body>
    <h1>LED Brightness Control</h1>
    <p class="brightness">{brightness}%</p>
    <form action="/">
        <input type="range" name="level" min="0" max="100" value="{brightness}" class="slider">
        <br><br>
        <input type="submit" value="Set Brightness">
    </form>
</body>
</html>"""
    return html

${webServer(
  String.raw`        # The slider sends its value in the address, e.g. GET /?level=75 HTTP/1.1
        if 'level=' in request:
            try:
                start = request.find('level=') + 6
                end = request.find(' ', start)  # the number ends at the space before HTTP
                brightness = int(request[start:end])
                brightness = max(0, min(100, brightness))
                # Map 0-100% to the PWM duty cycle, 0-65535
                led.duty_u16(brightness * 65535 // 100)
                print("Brightness:", brightness, "%")
            except ValueError:
                print("Could not read a brightness in", request)

        response = web_page()`,
  'print("Brightness control server running!")'
)}`;

const brightnessActivity: LessonActivity = {
  id: 'aider-45-brightness',
  title: 'Dim an LED with a web slider',
  goal: 'Set an LED\'s brightness from 0 to 100% with a slider on a web page, using PWM.',
  realWorld: 'Smart bulbs and screen backlights dim the same way: they switch on and off so fast that the eye sees a steady, dimmer light.',
  parts: [PICO, LED_PART, RESISTOR_220, BREADBOARD, jumpers(2), USB, WIFI],
  onRealHardware: true,
  steps: [
    ledOnGp0(),
    pasteCodeStep(
      BRIGHTNESS_CODE,
      [code(String.raw`led\s*=\s*PWM\(\s*Pin\(\s*0\s*\)\s*\)`, 'GP0 drives the LED with PWM'), code(String.raw`duty_u16\(\s*brightness\b`, 'Turns the slider\'s percentage into a duty cycle'), servesOnPort80],
      'joins your Wi-Fi network and serves a page with a slider that sets the LED\'s brightness'
    ),
    credentialsStep(),
    uploadStep(),
    openPageStep(
      'Open the Pico\'s IP address on a phone on the same Wi-Fi network. Move the slider and press Set Brightness: the LED dims or brightens, and the Terminal prints the new percentage. Try 0, 10, 50 and 100.',
      'The address shows the setting, for example /?level=50: you can type that in too.'
    ),
  ],
  solutionCode: BRIGHTNESS_CODE,
  observe: 'The LED gets brighter and dimmer as you move the slider and press Set Brightness.',
  wrapUp: 'PWM keeps the LED on for part of each thousandth of a second: at 50% it is on half the time. Try this next: add buttons for 25%, 50% and 100%.',
};

// --- Project 46: Timer switch ------------------------------------------------------------------

const TIMER_CODE = String.raw`import network
import socket
from machine import Pin, Timer
import time

${WIFI_JOIN}

# ==================== HARDWARE SETUP ====================
# Relay on GPIO 0 - Active LOW
relay = Pin(0, Pin.OUT)
relay.value(1)  # Start OFF

# Timer variables
off_timer = Timer()
timer_active = False
timer_end_time = 0

def timer_finished(t):
    """Runs by itself when the time is up, even if no one has the page open"""
    global timer_active
    relay.value(1)  # Turn OFF
    timer_active = False
    print("Time is up: relay OFF")

# ==================== WEB PAGE ====================
def web_page():
    remaining = max(0, timer_end_time - time.time()) if timer_active else 0
    status = "ON" if relay.value() == 0 else "OFF"

    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Timer Switch</title>
    <meta http-equiv="refresh" content="1; url=/">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {{font-family: Arial; text-align: center; padding: 50px;}}
        .status {{font-size: 48px;}}
        .on {{color: green;}}
        .off {{color: red;}}
    </style>
</head>
<body>
    <h1>Timer Switch</h1>
    <p class="status {'on' if relay.value() == 0 else 'off'}">Status: {status}</p>
    <p>Time Remaining: {remaining} seconds</p>
    <form action="/">
        <input type="number" name="duration" min="1" max="3600" placeholder="Seconds (1-3600)">
        <input type="submit" value="Start Timer">
    </form>
    <br>
    <a href="/stop"><button>STOP NOW</button></a>
</body>
</html>"""
    return html

${webServer(
  String.raw`        if '/stop' in request:
            off_timer.deinit()
            relay.value(1)
            timer_active = False
            print("Timer stopped")
        elif 'duration=' in request:
            try:
                start = request.find('duration=') + 9
                end = request.find(' ', start)
                duration = int(request[start:end])
                if 1 <= duration <= 3600:
                    timer_end_time = time.time() + duration
                    timer_active = True
                    relay.value(0)  # Turn ON
                    off_timer.init(mode=Timer.ONE_SHOT, period=duration * 1000, callback=timer_finished)
                    print("Timer started:", duration, "seconds")
            except ValueError:
                print("Type a number of seconds first")

        response = web_page()`,
  'print("Timer server running!")'
)}`;

const timerActivity: LessonActivity = {
  id: 'aider-46-timer',
  title: 'Switch something on for a set time',
  goal: 'Type a number of seconds on a web page; the relay switches on, and a timer in the Pico switches it off when the time is up.',
  realWorld: 'Water heaters, irrigation pumps and street lights use timer switches, so nothing is left on by mistake.',
  parts: [PICO, RELAY_PART, LED_PART, RESISTOR_220, BREADBOARD, jumpers(8), USB, WIFI],
  onRealHardware: true,
  steps: [
    relayModuleStep(),
    wireStep(
      'build-load',
      'Connect an LED through the relay',
      'Connect the relay\'s COM terminal to 5 V (VBUS, pin 40). Connect its NO (normally open) terminal to the 220 Ω resistor, the resistor to the LED\'s long leg, and the LED\'s short leg to GND.',
      'The LED stands in for whatever the timer would switch, such as a lamp or a pump. Never connect mains (wall socket) power to the relay.'
    ),
    pasteCodeStep(
      TIMER_CODE,
      [
        outputPin('relay', 0, 'GP0 is an output for the relay'),
        code(String.raw`Timer\.ONE_SHOT`, 'A one-shot timer switches the relay off'),
        handlesPath('/stop', 'STOP NOW switches it off at once'),
        servesOnPort80,
      ],
      'joins your Wi-Fi network and serves a page where you type a number of seconds; the relay stays on for that long'
    ),
    credentialsStep(),
    uploadStep(),
    openPageStep(
      'Open the Pico\'s IP address on a phone on the same Wi-Fi network. Type 10 and press Start Timer: the relay clicks, the LED lights and the page counts down. After 10 seconds it clicks off by itself. Start it again and press STOP NOW to end it early.',
      'Close the page while the timer runs: the LED still goes off on time, because the timer runs in the Pico, not in the browser.'
    ),
  ],
  solutionCode: TIMER_CODE,
  observe: 'The LED stays on for the number of seconds you type, then switches off by itself.',
  wrapUp: 'off_timer.init(mode=Timer.ONE_SHOT, ...) asks the Pico to run timer_finished once, after the period, whatever else the program is doing. Try this next: add buttons for 1, 5 and 10 minutes.',
};

// --- Project 48: Remote irrigation control -----------------------------------------------------

const IRRIGATION_CODE = String.raw`import network
import socket
from machine import Pin
import time

${WIFI_JOIN}

# ==================== HARDWARE SETUP ====================
# Relay on GPIO 0 - Active LOW
relay = Pin(0, Pin.OUT)
relay.value(1)  # Start OFF (pump off)

# ==================== WEB PAGE ====================
def web_page():
    status = "IRRIGATING" if relay.value() == 0 else "OFF"
    color = "green" if relay.value() == 0 else "gray"

    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Irrigation Control</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {{font-family: Arial; text-align: center; padding: 50px;}}
        .btn {{padding: 25px 50px; font-size: 28px; margin: 10px; border: none; border-radius: 10px; cursor: pointer; color: white;}}
        .on {{background: #2196F3;}}
        .off {{background: #f44336;}}
        .status {{font-size: 36px; color: {color};}}
    </style>
</head>
<body>
    <h1>💧 Irrigation Control</h1>
    <p class="status">Status: {status}</p>
    <a href="/on"><button class="btn on">START WATERING</button></a>
    <a href="/off"><button class="btn off">STOP WATERING</button></a>
</body>
</html>"""
    return html

${webServer(
  String.raw`        if '/on' in request:
            relay.value(0)  # Pump ON
            print("Watering")
        elif '/off' in request:
            relay.value(1)  # Pump OFF
            print("Watering stopped")

        response = web_page()`,
  'print("Irrigation server running!")'
)}`;

const irrigationActivity: LessonActivity = {
  id: 'aider-48-irrigation',
  title: 'Water a plant from your phone',
  goal: 'Switch a small water pump on and off from a web page, through a relay and its own power supply.',
  realWorld: 'Farmers switch irrigation pumps from their phones instead of walking out to the field.',
  parts: [
    PICO,
    RELAY_PART,
    { type: 'WATER_PUMP', label: 'Small 5 V water pump with tube', count: 1 },
    { type: 'DIODE_1N4007', label: '1N4007 diode', count: 1 },
    EXTERNAL_5V,
    { type: 'CUP', label: 'Container of water and a plant pot', count: 1 },
    BREADBOARD,
    jumpers(8),
    USB,
    WIFI,
  ],
  onRealHardware: true,
  steps: [
    relayModuleStep(),
    wireStep(
      'build-pump',
      'Connect the pump through the relay',
      'Connect the external supply\'s + to the relay\'s COM terminal, the relay\'s NO terminal to the pump\'s + (red) wire, and the pump\'s − (black) wire to the supply\'s −. Put the 1N4007 diode across the pump\'s two wires, striped end on the + wire. Put the pump in the container of water and lead its tube to the plant pot.',
      'A pump is a motor, so the diode protects the relay as in the motor project. Keep the Pico, the relay and the supply well away from the water, and never let the pump run dry: it can overheat.'
    ),
    pasteCodeStep(
      IRRIGATION_CODE,
      [outputPin('relay', 0, 'GP0 is an output for the relay'), handlesPath('/on', 'START WATERING switches the pump on'), handlesPath('/off', 'STOP WATERING switches it off'), servesOnPort80],
      'joins your Wi-Fi network and serves a page whose buttons switch the pump on and off'
    ),
    credentialsStep(),
    uploadStep(),
    openPageStep(
      'Open the Pico\'s IP address on a phone on the same Wi-Fi network. Press START WATERING: the relay clicks and water flows to the plant. Press STOP WATERING after a few seconds.',
      'Pump hums but no water comes? It may need priming: fill the tube with water first. No click from the relay? Check VCC, GND and IN on the relay module.'
    ),
  ],
  solutionCode: IRRIGATION_CODE,
  observe: 'Water flows when you press START WATERING and stops when you press STOP WATERING.',
  wrapUp: 'The same relay circuit switches a motor, a pump or a lamp: only the load changes. Try this next: stop the pump by itself after 30 seconds with a Timer, as in the timer switch project, so the plant is never flooded.',
};

// --- Project 49: Environmental data logger ---------------------------------------------------

const ENV_LOG_CODE = String.raw`import network
import socket
import ntptime
from machine import Pin, I2C, Timer
import BME280
import time

${WIFI_JOIN}

${CLOCK_FROM_INTERNET}

# ==================== SENSOR SETUP ====================
i2c = I2C(0, sda=Pin(8), scl=Pin(9), freq=400000)
bme = BME280.BME280(i2c=i2c)

# Data storage - rolling log of 15 readings
MAX_READINGS = 15
data_log = []

def add_reading(t=None):
    """Add a new reading to the log"""
    temp = bme.temperature
    hum = bme.humidity

    now = time.localtime()
    timestamp = f"{now[3]:02d}:{now[4]:02d}:{now[5]:02d}"

    data_log.append({
        'time': timestamp,
        'temp': temp,
        'hum': hum
    })

    if len(data_log) > MAX_READINGS:
        data_log.pop(0)

# Take a reading now, then one every 10 seconds, whether or not the page is open
add_reading()
log_timer = Timer(period=10000, mode=Timer.PERIODIC, callback=add_reading)

# ==================== WEB PAGE ====================
def web_page():
    # Build table, newest first
    rows = ""
    for i, data in enumerate(reversed(data_log)):
        rows += f"<tr><td>{len(data_log)-i}</td><td>{data['time']}</td><td>{data['temp']}</td><td>{data['hum']}</td></tr>"

    latest = data_log[-1] if data_log else {'temp': '--', 'hum': '--'}

    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Data Logger</title>
    <meta http-equiv="refresh" content="5">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {{font-family: monospace; padding: 20px;}}
        table {{width: 100%; border-collapse: collapse;}}
        th, td {{padding: 8px; border: 1px solid #ddd; text-align: center;}}
    </style>
</head>
<body>
    <h1>📊 Environmental Data Logger</h1>
    <h2>Current: {latest['temp']} | {latest['hum']}</h2>
    <table>
        <tr><th>#</th><th>Time (UTC)</th><th>Temp</th><th>Humidity</th></tr>
        {rows}
    </table>
</body>
</html>"""
    return html

${webServer('        response = web_page()', 'print("Data logger running!")')}`;

const envLogActivity: LessonActivity = {
  id: 'aider-49-env-log',
  title: 'Log temperature and humidity',
  goal: 'Record the temperature and humidity every 10 seconds, with the time, and show the last 15 readings on a web page.',
  realWorld: 'Weather stations, vaccine fridges and greenhouses keep logs like this to prove conditions stayed safe.',
  parts: [PICO, BME280_PART, BREADBOARD, jumpers(4), USB, WIFI],
  onRealHardware: true,
  steps: [
    libraryStep('BME280', 'BME280'),
    bme280Wiring(),
    pasteCodeStep(
      ENV_LOG_CODE,
      [importsDriver('BME280'), i2cOnGp8Gp9, code(String.raw`Timer\.PERIODIC`, 'A timer takes a reading every 10 seconds'), code(String.raw`MAX_READINGS\s*=\s*15\b`, 'Keeps the last 15 readings'), servesOnPort80],
      'joins your Wi-Fi network, gets the time from the internet, logs a reading every 10 seconds, and serves a page with the log'
    ),
    credentialsStep(),
    uploadStep(),
    openPageStep(
      'Open the Pico\'s IP address on a phone on the same Wi-Fi network. A new row appears every 10 seconds, newest at the top. Warm the sensor in your hand for a minute and watch the temperature column climb.',
      `The times are UTC (also called GMT). ${BME280_NOT_FOUND}`
    ),
  ],
  solutionCode: ENV_LOG_CODE,
  observe: 'A new row with the time, temperature and humidity appears every 10 seconds.',
  wrapUp: 'A periodic Timer keeps logging even when nobody is looking; the page only shows what was logged. Try this next: log every minute instead, and keep 60 readings for an hour of history.',
};

// --- Lessons ----------------------------------------------------------------------------------

export const oledDashboardLesson = aiderLesson('iot-dashboard-oled', 'IoT Dashboard OLED', 42, dashboardActivity);
export const motorControlLesson = aiderLesson('online-motor-control', 'Online Motor Control', 43, motorActivity);
export const buttonLoggerLesson = aiderLesson('wi-fi-button-logger', 'Wi-Fi Button Logger', 44, buttonLogActivity);
export const ledBrightnessLesson = aiderLesson('web-led-brightness', 'Web LED Brightness', 45, brightnessActivity);
export const timerSwitchLesson = aiderLesson('cloud-timer-switch', 'Cloud Timer Switch', 46, timerActivity);
export const irrigationLesson = aiderLesson('remote-irrigation-control', 'Remote Irrigation Control', 48, irrigationActivity);
export const environmentLoggerLesson = aiderLesson('environmental-data-logger', 'Environmental Data Logger', 49, envLogActivity);
