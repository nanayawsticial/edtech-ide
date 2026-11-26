import type { LessonActivity, LessonStep } from '../types';
import {
  BME280_NOT_FOUND,
  BME280_PART,
  BREADBOARD,
  CLOCK_FROM_INTERNET,
  LOCAL_TIME,
  OLED_PART,
  PICO,
  RELAY_PART,
  USB,
  WIFI,
  WIFI_JOIN,
  aiderLesson,
  analogPin,
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
  webServer,
  wireStep,
} from './aiderShared';

// AIDER projects 50-60 and 62: automation that runs on its own (lights, schedules, alarms,
// pumps), OLED status screens, and alerts. Adapted from the STEMAIDE AIDER student manuals; see
// aiderShared.ts for the corrections every program shares.
//
// The manuals' programs read their sensors and buttons in the same loop that waits for a browser.
// s.accept() waits until a page is requested, so the light, the schedule, the alarm, the pump's
// cut-off and the alerts only worked while someone had the page open (or not at all). Here,
// machine.Timer and pin interrupts do that work, and the web server only shows and changes it.
//
// Corrections to single manuals, besides that:
// - 50: "Toggle Manual" mixed two things; the page has AUTO, ON and OFF buttons instead.
// - 51, 52: they used a clock nothing had set; the time now comes from the internet, with a time
//   zone setting. 51, 52, 53, 54, 55, 56, 57 and 58 sent no blank line after the headers, and 62
//   sent no HTTP reply at all, so browsers showed nothing. 52 sent a page it never built.
// - 55: CSS colours go to 255, not 65535; the sliders now go to 255 and the duty cycle is value * 257.
// - 57: the pump could be started when the tank was already full.
// - 58: the rain module's output goes LOW when wet (as in project 40); the manual sounded the
//   alarm when it was dry.
// - 60: the soil sensor's digital output was read the wrong way round; it now uses the analog
//   output, as in projects 39 and 54, and the Wi-Fi it joined is used for a web page.
// - The parts lists drop push buttons that the code never used (51, 52).

const LED_PART = { type: 'LED', label: 'LED', count: 1 };
const RESISTOR_220 = { type: 'RESISTOR_220', label: '220 Ω resistor (red-red-brown)', count: 1 };
const BUZZER_PART = { type: 'BUZZER', label: 'Active buzzer', count: 1 };
const SOIL_PART = { type: 'SOIL_MOISTURE', label: 'Soil moisture sensor', count: 1 };
const EXTERNAL_5V = { type: 'POWER_5V', label: 'External 5 V supply (4 × AA battery pack or USB power bank)', count: 1 };

/** Reads whole numbers from a form's answer, such as hour=7 in GET /?hour=7&minute=30. */
const GET_NUMBER = String.raw`def get_number(request, name):
    """The whole number after name= in the request, or None if there is none"""
    start = request.find(name + '=')
    if start == -1:
        return None
    start += len(name) + 1
    end = start
    while end < len(request) and request[end].isdigit():
        end += 1
    if end == start:
        return None
    return int(request[start:end])`;

const oledWiring = (extra: string): LessonStep =>
  wireStep(
    'build-oled',
    'Connect the OLED screen',
    `Connect the screen's VCC to 3V3 (pin 36), GND to GND (pin 38), SDA to GP8 (pin 11) and SCL to GP9 (pin 12). ${extra}`.trim(),
    'If the screen stays dark, check SDA and SCL first: they are easy to swap. If the picture is upside down, add rotate=180 to SH1106_I2C(...).'
  );

const relayLedLoad = (): LessonStep =>
  wireStep(
    'build-load',
    'Connect an LED through the relay',
    'Connect the relay\'s COM terminal to 5 V (VBUS, pin 40). Connect its NO (normally open) terminal to a 220 Ω resistor, the resistor to the LED\'s long leg, and the LED\'s short leg to GND.',
    'The LED stands in for a room light or a lamp. Never connect mains (wall socket) power to the relay.'
  );

// --- Project 50: Smart room light ------------------------------------------------------------

const SMART_LIGHT_CODE = String.raw`import network
import socket
from machine import Pin, ADC, Timer
import time

${WIFI_JOIN}

# ==================== HARDWARE SETUP ====================
light = ADC(Pin(26))  # light sensor (LDR) on GP26

# Relay on GPIO 0 - Active LOW
relay = Pin(0, Pin.OUT)
relay.value(1)  # Start OFF

# Below this light level (0-100%) the room counts as dark
DARK_THRESHOLD = 30
mode = "AUTO"  # AUTO follows the light sensor; ON and OFF are set from the web page

def read_light():
    return int((light.read_u16() / 65535) * 100)

def control_light(t=None):
    """Runs every second: in AUTO mode the light follows the room's brightness"""
    if mode == "AUTO":
        if read_light() < DARK_THRESHOLD:
            relay.value(0)  # dark: light ON
        else:
            relay.value(1)  # bright: light OFF

control_timer = Timer(period=1000, mode=Timer.PERIODIC, callback=control_light)

# ==================== WEB PAGE ====================
def web_page():
    light_level = read_light()
    state = "ON" if relay.value() == 0 else "OFF"

    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Smart Light</title>
    <meta http-equiv="refresh" content="2; url=/">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {{font-family: Arial; text-align: center; padding: 40px;}}
        .light {{font-size: 60px; color: #FFC107;}}
        .status {{font-size: 24px; padding: 15px;}}
        .btn {{padding: 15px 30px; font-size: 20px; margin: 5px;}}
    </style>
</head>
<body>
    <h1>💡 Smart Light Control</h1>
    <p class="light">☀️ {light_level}%</p>
    <p class="status">Light: {state} (mode {mode})</p>
    <p>Dark below: {DARK_THRESHOLD}%</p>
    <a href="/auto"><button class="btn">AUTO</button></a>
    <a href="/on"><button class="btn">ON</button></a>
    <a href="/off"><button class="btn">OFF</button></a>
</body>
</html>"""
    return html

${webServer(
  String.raw`        if '/auto' in request:
            mode = "AUTO"
            control_light()
        elif '/on' in request:
            mode = "ON"
            relay.value(0)
        elif '/off' in request:
            mode = "OFF"
            relay.value(1)

        response = web_page()`,
  'print("Smart light server running!")'
)}`;

const smartLightActivity: LessonActivity = {
  id: 'aider-50-smart-light',
  title: 'Switch a light on when it gets dark',
  goal: 'Switch a light through a relay automatically when the room gets dark, and override it from a web page.',
  realWorld: 'Street lights and security lights switch on at dusk by themselves; the override is for when people need something else.',
  parts: [
    PICO,
    { type: 'LDR', label: 'LDR (light-dependent resistor)', count: 1 },
    { type: 'RESISTOR_10K', label: '10 kΩ resistor (brown-black-orange)', count: 1 },
    RELAY_PART,
    LED_PART,
    RESISTOR_220,
    BREADBOARD,
    jumpers(10),
    USB,
    WIFI,
  ],
  onRealHardware: true,
  steps: [
    wireStep(
      'build-sensor',
      'Build the light sensor',
      'Put the LDR in the breadboard with its two legs in different rows. Connect one leg to 3V3 (pin 36), and the other leg to GP26 (pin 31) and, through the 10 kΩ resistor, to GND (pin 38).',
      'This is the same light sensor as in the light logger: more light gives a higher reading on GP26.'
    ),
    relayModuleStep(),
    relayLedLoad(),
    pasteCodeStep(
      SMART_LIGHT_CODE,
      [
        analogPin('light', 26, 'Reads the light sensor on GP26'),
        outputPin('relay', 0, 'GP0 is an output for the relay'),
        code(String.raw`Timer\.PERIODIC`, 'A timer checks the light every second'),
        handlesPath('/auto', 'AUTO hands the light back to the sensor'),
        servesOnPort80,
      ],
      'joins your Wi-Fi network, checks the light level every second and switches the relay when it is dark, and serves a page with AUTO, ON and OFF buttons'
    ),
    credentialsStep(),
    uploadStep(),
    openPageStep(
      'Open the Pico\'s IP address on a phone on the same Wi-Fi network. Cover the LDR with your hand: within a second the relay clicks and the LED lights. Uncover it and the LED goes out. Press ON or OFF to override, and AUTO to give control back to the sensor.',
      'If the light switches at the wrong brightness, read the light level on the page in a dark and a bright room, and set DARK_THRESHOLD between them.'
    ),
  ],
  solutionCode: SMART_LIGHT_CODE,
  observe: 'The LED lights when you cover the sensor and goes out in the light, and the buttons override it.',
  wrapUp: 'The timer keeps checking the light even when nobody has the page open: that is what makes it automatic. Try this next: wait until it has been dark for 5 seconds before switching, so a passing shadow does not switch the light.',
};

// --- Project 51: Wi-Fi relay scheduler -----------------------------------------------------

const SCHEDULER_CODE = String.raw`import network
import socket
import ntptime
from machine import Pin, I2C, Timer
import sh1106
import time

${WIFI_JOIN}
ip = wlan.ifconfig()[0]

${CLOCK_FROM_INTERNET}

${LOCAL_TIME}

# ==================== HARDWARE SETUP ====================
i2c = I2C(0, sda=Pin(8), scl=Pin(9), freq=400000)
display = sh1106.SH1106_I2C(128, 64, i2c)

# Relay on GPIO 0 - Active LOW
relay = Pin(0, Pin.OUT)
relay.value(1)  # Start OFF

# Schedule (hour, minute, action) - action: 1 = ON, 0 = OFF
schedule = [
    (8, 0, 1),   # 8:00 ON
    (18, 0, 0),  # 18:00 (6 PM) OFF
]
last_minute_checked = None

def show_status():
    """Shows the relay and the time on the OLED"""
    status = "ON" if relay.value() == 0 else "OFF"
    hour, minute, second = local_time()
    display.fill(0)
    display.text("Relay: " + status, 0, 0, 1)
    display.text(f"Time: {hour:02d}:{minute:02d}", 0, 16, 1)
    display.text("IP:", 0, 36, 1)
    display.text(ip, 0, 48, 1)
    display.show()

def check_schedule(t=None):
    """Runs every 10 seconds: switches the relay at the times in the schedule"""
    global last_minute_checked
    hour, minute, second = local_time()
    if (hour, minute) != last_minute_checked:  # act once per minute
        last_minute_checked = (hour, minute)
        for sh, sm, action in schedule:
            if hour == sh and minute == sm:
                relay.value(1 - action)  # action 1 (ON) means relay value 0
                print("Schedule:", "ON" if action == 1 else "OFF", f"at {hour:02d}:{minute:02d}")
    show_status()

check_schedule()
schedule_timer = Timer(period=10000, mode=Timer.PERIODIC, callback=check_schedule)

# ==================== WEB PAGE ====================
def web_page():
    status = "ON" if relay.value() == 0 else "OFF"
    hour, minute, second = local_time()
    current_time = f"{hour:02d}:{minute:02d}"

    # Format schedule
    sched_text = ""
    for h, m, a in schedule:
        time_str = f"{h:02d}:{m:02d}"
        action = "ON" if a == 1 else "OFF"
        sched_text += f"<li>{time_str} - {action}</li>"

    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Relay Scheduler</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>body {{font-family: Arial; text-align: center; padding: 30px;}} ul {{list-style: none; padding: 0;}}</style>
</head>
<body>
    <h1>⏰ Relay Scheduler</h1>
    <p>Current Time: {current_time}</p>
    <p>Relay Status: {status}</p>
    <h3>Schedule</h3>
    <ul>{sched_text}</ul>
    <a href="/toggle"><button>Toggle Now</button></a>
</body>
</html>"""
    return html

${webServer(
  String.raw`        if '/toggle' in request:
            relay.value(1 - relay.value())
            show_status()

        response = web_page()`,
  'print("Scheduler running!")'
)}`;

const schedulerActivity: LessonActivity = {
  id: 'aider-51-scheduler',
  title: 'Switch a relay on a schedule',
  goal: 'Switch a relay on and off at set times of day, using the time from the internet, with the status on an OLED screen and a web page.',
  realWorld: 'Shop signs, school bells and water heaters run on schedules like this one.',
  parts: [PICO, RELAY_PART, LED_PART, RESISTOR_220, OLED_PART, BREADBOARD, jumpers(12), USB, WIFI],
  onRealHardware: true,
  steps: [
    libraryStep('SH1106', 'OLED screen'),
    oledWiring(''),
    relayModuleStep(),
    relayLedLoad(),
    pasteCodeStep(
      SCHEDULER_CODE,
      [
        importsDriver('sh1106'),
        outputPin('relay', 0, 'GP0 is an output for the relay'),
        code(String.raw`ntptime\.settime\(\)`, 'Gets the time from the internet'),
        code(String.raw`schedule\s*=\s*\[`, 'Has a schedule of times'),
        handlesPath('/toggle', 'Toggle Now switches the relay by hand'),
        servesOnPort80,
      ],
      'joins your Wi-Fi network, gets the time from the internet, switches the relay at the times in the schedule, and shows the status on the screen and a web page'
    ),
    credentialsStep(),
    {
      id: 'set-time',
      kind: 'code',
      title: 'Set your time zone and a schedule to test',
      body: 'Set UTC_OFFSET to your time zone (0 in Ghana, 1 in Nigeria, 3 in Kenya). To see it work today, change the first line of the schedule to a time 2 minutes from now, for example (14, 32, 1), and the second to 2 minutes after that.',
      hint: 'Times use the 24-hour clock: 2:32 PM is (14, 32, 1). The third number is the action: 1 switches ON, 0 switches OFF.',
    },
    uploadStep(),
    openPageStep(
      'The screen shows the relay, the time and the IP address. Open the IP address on a phone to see the schedule. Wait for your test time: the relay clicks on at the first time and off at the second. Toggle Now switches it by hand at any time.',
      'If the time on the screen is wrong by whole hours, change UTC_OFFSET. If it shows 00:00 and the Terminal says it could not get the time, the network may block internet time: try a phone hotspot.'
    ),
  ],
  solutionCode: SCHEDULER_CODE,
  observe: 'The relay switches on and off by itself at the times in the schedule.',
  wrapUp: 'The Pico\'s clock starts at midnight 2021 when it is switched on; ntptime sets it from a time server on the internet. Try this next: add a third line to the schedule, or a schedule for each day of the week.',
};

// --- Project 52: IoT alarm clock ---------------------------------------------------------------

const ALARM_CODE = String.raw`import network
import socket
import ntptime
from machine import Pin, I2C, PWM, Timer
import sh1106
import time

${WIFI_JOIN}

${CLOCK_FROM_INTERNET}

${LOCAL_TIME}

# ==================== HARDWARE SETUP ====================
i2c = I2C(0, sda=Pin(8), scl=Pin(9), freq=400000)
display = sh1106.SH1106_I2C(128, 64, i2c)

buzzer = Pin(0, Pin.OUT)
red = PWM(Pin(1))
green = PWM(Pin(2))
blue = PWM(Pin(3))
red.freq(1000)
green.freq(1000)
blue.freq(1000)

# Alarm settings
alarm_hour = 7
alarm_minute = 0
alarm_enabled = False
last_rung = None

def set_led(r, g, b):
    red.duty_u16(r)
    green.duty_u16(g)
    blue.duty_u16(b)

def play_alarm():
    """Alarm sound pattern"""
    for _ in range(3):
        buzzer.value(1)
        set_led(65535, 0, 0)  # Red
        time.sleep(0.2)
        buzzer.value(0)
        set_led(0, 0, 0)  # Off
        time.sleep(0.2)

def clock_tick(t=None):
    """Runs every second: shows the time and rings at the alarm time"""
    global last_rung
    hour, minute, second = local_time()
    if alarm_enabled and hour == alarm_hour and minute == alarm_minute and last_rung != (hour, minute):
        last_rung = (hour, minute)  # ring once for this minute
        print("ALARM!")
        play_alarm()

    display.fill(0)
    display.text(f"Time: {hour:02d}:{minute:02d}:{second:02d}", 0, 10, 1)
    display.text(f"Alarm: {alarm_hour:02d}:{alarm_minute:02d}", 0, 30, 1)
    display.text("Status: " + ("ON" if alarm_enabled else "OFF"), 0, 50, 1)
    display.show()

clock_timer = Timer(period=1000, mode=Timer.PERIODIC, callback=clock_tick)

${GET_NUMBER}

# ==================== WEB PAGE ====================
def web_page():
    hour, minute, second = local_time()
    current = f"{hour:02d}:{minute:02d}:{second:02d}"
    alarm_str = f"{alarm_hour:02d}:{alarm_minute:02d}"
    status = "ENABLED" if alarm_enabled else "DISABLED"

    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Alarm Clock</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>body {{font-family: Arial; text-align: center; padding: 30px;}} input {{width: 60px;}}</style>
</head>
<body>
    <h1>⏰ IoT Alarm Clock</h1>
    <p>Current: <strong>{current}</strong></p>
    <p>Alarm: {alarm_str} ({status})</p>
    <form action="/">
        Hour: <input type="number" name="hour" min="0" max="23" value="{alarm_hour}">
        Minute: <input type="number" name="minute" min="0" max="59" value="{alarm_minute}">
        <input type="submit" value="Set">
    </form>
    <br>
    <a href="/enable"><button>Enable</button></a>
    <a href="/disable"><button>Disable</button></a>
</body>
</html>"""
    return html

${webServer(
  String.raw`        new_hour = get_number(request, 'hour')
        new_minute = get_number(request, 'minute')
        if new_hour is not None and new_minute is not None and new_hour <= 23 and new_minute <= 59:
            alarm_hour = new_hour
            alarm_minute = new_minute
            print(f"Alarm set for {alarm_hour:02d}:{alarm_minute:02d}")

        if '/enable' in request:
            alarm_enabled = True
            last_rung = None
        elif '/disable' in request:
            alarm_enabled = False

        response = web_page()`,
  'print("Alarm clock running!")'
)}`;

const alarmActivity: LessonActivity = {
  id: 'aider-52-alarm',
  title: 'Build an alarm clock you set from a phone',
  goal: 'Show the time on an OLED screen, set an alarm from a web page, and sound a buzzer with a flashing red light when the time comes.',
  realWorld: 'Smart alarm clocks and medicine reminders are set from a phone and ring on their own.',
  parts: [
    PICO,
    OLED_PART,
    BUZZER_PART,
    { type: 'RGB_LED', label: 'RGB LED (common cathode)', count: 1 },
    { type: 'RESISTOR_220', label: '220 Ω resistors', count: 3 },
    BREADBOARD,
    jumpers(12),
    USB,
    WIFI,
  ],
  onRealHardware: true,
  steps: [
    libraryStep('SH1106', 'OLED screen'),
    oledWiring(''),
    wireStep(
      'build-outputs',
      'Connect the buzzer and the RGB LED',
      'Connect the buzzer\'s + leg to GP0 (pin 1) and its − leg to GND. Put the RGB LED on the breadboard: its longest leg (the common cathode) goes to GND. Connect its red, green and blue legs through a 220 Ω resistor each to GP1 (pin 2), GP2 (pin 4) and GP3 (pin 5).',
      'On a common-cathode RGB LED the long leg is −; the red leg is the one next to it on the outside. If the alarm flashes green or blue instead of red, swap the wires on GP1, GP2 and GP3.'
    ),
    pasteCodeStep(
      ALARM_CODE,
      [
        importsDriver('sh1106'),
        outputPin('buzzer', 0, 'GP0 is an output for the buzzer'),
        code(String.raw`ntptime\.settime\(\)`, 'Gets the time from the internet'),
        code(String.raw`Timer\(\s*period\s*=\s*1000`, 'Checks the alarm every second'),
        handlesPath('/enable', 'Enable turns the alarm on'),
        servesOnPort80,
      ],
      'joins your Wi-Fi network, gets the time from the internet, shows it on the screen, and rings at the alarm time you set on its web page'
    ),
    credentialsStep(),
    uploadStep(),
    openPageStep(
      'Open the Pico\'s IP address on a phone on the same Wi-Fi network. Set the alarm 2 minutes ahead of the time on the screen, press Set, then Enable. When the screen reaches that time, the buzzer beeps and the LED flashes red.',
      'If the time on the screen is wrong by whole hours, change UTC_OFFSET near the top of the code.'
    ),
  ],
  solutionCode: ALARM_CODE,
  observe: 'At the alarm time the buzzer beeps three times and the LED flashes red.',
  wrapUp: 'The clock and the alarm run on a timer, so the alarm rings even with no page open. Try this next: keep ringing every few seconds until Disable is pressed.',
};

// --- Project 53: Web motion counter ----------------------------------------------------------

const MOTION_COUNTER_CODE = String.raw`import network
import socket
from machine import Pin, I2C, Timer
import sh1106
import time

${WIFI_JOIN}

# ==================== HARDWARE SETUP ====================
i2c = I2C(0, sda=Pin(8), scl=Pin(9), freq=400000)
display = sh1106.SH1106_I2C(128, 64, i2c)

pir = Pin(1, Pin.IN, Pin.PULL_DOWN)
reset_btn = Pin(2, Pin.IN, Pin.PULL_UP)

# Counter
motion_count = 0

def motion_detected(pin):
    """Runs by itself (an interrupt) each time the PIR sees a new movement"""
    global motion_count
    motion_count += 1
    print("Motion! Count:", motion_count)

def reset_pressed(pin):
    """Runs by itself when the reset button is pressed"""
    global motion_count
    motion_count = 0
    print("Counter reset")

pir.irq(trigger=Pin.IRQ_RISING, handler=motion_detected)
reset_btn.irq(trigger=Pin.IRQ_FALLING, handler=reset_pressed)

def update_display(t=None):
    """Runs twice a second: shows the count on the OLED"""
    display.fill(0)
    display.text("Motion:", 20, 10, 1)
    display.text(str(motion_count), 40, 30, 1)
    if pir.value() == 1:
        display.text("DETECTED!", 25, 50, 1)
    display.show()

display_timer = Timer(period=500, mode=Timer.PERIODIC, callback=update_display)

# ==================== WEB PAGE ====================
def web_page():
    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Motion Counter</title>
    <meta http-equiv="refresh" content="2; url=/">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>body {{font-family: Arial; text-align: center; padding: 50px;}}</style>
</head>
<body>
    <h1>🚶 Motion Counter</h1>
    <h2 style="font-size:60px">{motion_count}</h2>
    <p>Total Motion Events</p>
    <a href="/reset"><button>Reset Counter</button></a>
</body>
</html>"""
    return html

print("Wait about a minute for the PIR sensor to settle before testing")
${webServer(
  String.raw`        if '/reset' in request:
            motion_count = 0
            print("Counter reset from the web page")

        response = web_page()`,
  'print("Motion counter running!")'
)}`;

const motionCounterActivity: LessonActivity = {
  id: 'aider-53-motion-counter',
  title: 'Count movements on a screen and a web page',
  goal: 'Count every movement a PIR sensor sees, show the count on an OLED screen and a web page, and reset it with a button or from the page.',
  realWorld: 'Shops and libraries count visitors this way, to know their busiest hours.',
  parts: [PICO, { type: 'PIR', label: 'PIR motion sensor (HC-SR501)', count: 1 }, OLED_PART, { type: 'BUTTON', label: 'Push button (reset)', count: 1 }, BREADBOARD, jumpers(10), USB, WIFI],
  onRealHardware: true,
  steps: [
    libraryStep('SH1106', 'OLED screen'),
    oledWiring(''),
    wireStep(
      'build-inputs',
      'Connect the PIR sensor and the reset button',
      'Connect the PIR sensor\'s VCC to VBUS (5 V, pin 40), GND to GND (pin 38) and OUT to GP1 (pin 2). Put the push button across the breadboard\'s middle gap, and connect one leg to GP2 (pin 4) and the other side to GND.',
      'The PIR needs 5 V but sends 3.3 V on OUT, which is safe for the Pico. The button needs no resistor: Pin.PULL_UP uses one inside the Pico.'
    ),
    pasteCodeStep(
      MOTION_COUNTER_CODE,
      [
        importsDriver('sh1106'),
        inputPin('pir', 1, 'GP1 is an input for the PIR sensor'),
        code(String.raw`pir\.irq\(`, 'Counts movements with an interrupt'),
        code(String.raw`reset_btn\.irq\(`, 'The button resets the count with an interrupt'),
        handlesPath('/reset', 'Reset Counter on the page resets it too'),
        servesOnPort80,
      ],
      'joins your Wi-Fi network, counts every movement, shows the count on the screen and a web page, and resets it from the button or the page'
    ),
    credentialsStep(),
    uploadStep(),
    openPageStep(
      'Wait a minute for the PIR to settle, then wave in front of it a few times: the count goes up on the screen and on the page (open the Pico\'s IP address on a phone). Press the button or Reset Counter, and it goes back to 0.',
      'A PIR keeps its output high for a few seconds after a movement, so quick waves can count as one: the orange knobs set that time.'
    ),
  ],
  solutionCode: MOTION_COUNTER_CODE,
  observe: 'Every new movement adds one to the count on the screen and the page, and both resets set it to 0.',
  wrapUp: 'Interrupts count and reset straight away, and a timer refreshes the screen, so nothing waits for the web page. Try this next: show the time of the last movement.',
};

// --- Project 54: Soil dryness indicator --------------------------------------------------------

const SOIL_ALERT_CODE = String.raw`import network
import socket
from machine import Pin, I2C, ADC, Timer
import sh1106
import time

${WIFI_JOIN}

# ==================== HARDWARE SETUP ====================
i2c = I2C(0, sda=Pin(8), scl=Pin(9), freq=400000)
display = sh1106.SH1106_I2C(128, 64, i2c)

soil = ADC(Pin(26))
buzzer = Pin(0, Pin.OUT)

# Below this moisture (%) the soil is too dry
DRY_THRESHOLD = 40

def read_moisture():
    raw = soil.read_u16()
    return 100 - int((raw / 65535) * 100)  # dry soil gives high readings: turn them round

def get_status(moisture):
    if moisture < DRY_THRESHOLD:
        return "DRY - WATER!", "red"
    elif moisture < 60:
        return "OK", "orange"
    return "WET", "green"

def check_soil(t=None):
    """Runs every 2 seconds: shows the moisture and beeps when the soil is dry"""
    moisture = read_moisture()
    status, color = get_status(moisture)

    if moisture < DRY_THRESHOLD:
        buzzer.value(1)
        time.sleep(0.1)
        buzzer.value(0)

    display.fill(0)
    display.text("Soil:", 30, 10, 1)
    display.text(f"{moisture}%", 35, 30, 1)
    display.text(status, 10, 50, 1)
    display.show()

check_timer = Timer(period=2000, mode=Timer.PERIODIC, callback=check_soil)

# ==================== WEB PAGE ====================
def web_page():
    moisture = read_moisture()
    status, color = get_status(moisture)

    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Soil Moisture</title>
    <meta http-equiv="refresh" content="3">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>body {{font-family: Arial; text-align: center; padding: 40px;}} .status {{font-size: 40px; color: {color};}}</style>
</head>
<body>
    <h1>🌱 Soil Moisture</h1>
    <p style="font-size:50px">{moisture}%</p>
    <p class="status">{status}</p>
</body>
</html>"""
    return html

${webServer('        response = web_page()', 'print("Soil monitor running!")')}`;

const soilAlertActivity: LessonActivity = {
  id: 'aider-54-soil-alert',
  title: 'Beep when a plant is thirsty',
  goal: 'Show the soil moisture on an OLED screen and a web page, and beep when the soil is too dry.',
  realWorld: 'Greenhouse alarms warn growers before plants wilt, without anyone watching a screen.',
  parts: [PICO, SOIL_PART, OLED_PART, BUZZER_PART, { type: 'POT_PLANT', label: 'Pot of soil', count: 1 }, BREADBOARD, jumpers(10), USB, WIFI],
  onRealHardware: true,
  steps: [
    libraryStep('SH1106', 'OLED screen'),
    oledWiring(''),
    wireStep(
      'build-sensor',
      'Connect the soil sensor and the buzzer',
      'Connect the soil sensor\'s VCC to 3V3 (pin 36), GND to GND and AOUT to GP26 (pin 31). Connect the buzzer\'s + leg to GP0 (pin 1) and its − leg to GND.',
      'Push the sensor\'s fork into the soil up to the line, not deeper. Several wires go to GND: use the breadboard\'s − rail to share one GND pin.'
    ),
    pasteCodeStep(
      SOIL_ALERT_CODE,
      [
        importsDriver('sh1106'),
        analogPin('soil', 26, 'Reads the soil sensor on GP26'),
        outputPin('buzzer', 0, 'GP0 is an output for the buzzer'),
        code(String.raw`Timer\.PERIODIC`, 'A timer checks the soil every 2 seconds'),
        servesOnPort80,
      ],
      'joins your Wi-Fi network, checks the soil every 2 seconds, shows it on the screen, beeps when it is dry, and serves a page with the moisture'
    ),
    credentialsStep(),
    uploadStep(),
    openPageStep(
      'With the sensor in dry soil (or in the air) the screen says DRY - WATER! and the buzzer beeps every 2 seconds. Water the soil, or dip the fork in water: the beeping stops and the screen says OK or WET. Open the IP address on a phone to see the same on the page.',
      'Beeps even in wet soil? Look at the moisture shown in water and in dry soil, and set DRY_THRESHOLD between them.'
    ),
  ],
  solutionCode: SOIL_ALERT_CODE,
  observe: 'The buzzer beeps while the soil is dry and stops once it is watered.',
  wrapUp: 'The timer checks the soil on its own; the web page is extra. Try this next: beep only once an hour, so the alarm is not annoying at night.',
};

// --- Project 55: Colour control ----------------------------------------------------------------

const COLOR_CODE = String.raw`import network
import socket
from machine import Pin, PWM
import time

${WIFI_JOIN}

# ==================== HARDWARE SETUP ====================
# RGB LED on GPIO 12, 13, 14 (PWM pins)
red = PWM(Pin(12))
green = PWM(Pin(13))
blue = PWM(Pin(14))
red.freq(1000)
green.freq(1000)
blue.freq(1000)

# Current colour, 0-255 for each, as in web colours
r, g, b = 0, 0, 0

def set_color(red_val, green_val, blue_val):
    global r, g, b
    r, g, b = red_val, green_val, blue_val
    # 0-255 becomes a duty cycle of 0-65535 (255 * 257 = 65535)
    red.duty_u16(red_val * 257)
    green.duty_u16(green_val * 257)
    blue.duty_u16(blue_val * 257)

${GET_NUMBER}

# ==================== WEB PAGE ====================
def web_page():
    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Colour Control</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {{font-family: Arial; text-align: center; padding: 30px;}}
        .color-box {{width: 100px; height: 100px; margin: 20px auto; border: 1px solid #999; background: rgb({r},{g},{b});}}
        input {{padding: 10px; margin: 5px;}}
    </style>
</head>
<body>
    <h1>🎨 Colour Control</h1>
    <div class="color-box"></div>
    <form action="/">
        R: <input type="range" name="r" min="0" max="255" value="{r}"><br>
        G: <input type="range" name="g" min="0" max="255" value="{g}"><br>
        B: <input type="range" name="b" min="0" max="255" value="{b}"><br>
        <input type="submit" value="Set Color">
    </form>
</body>
</html>"""
    return html

${webServer(
  String.raw`        new_r = get_number(request, 'r')
        new_g = get_number(request, 'g')
        new_b = get_number(request, 'b')
        if new_r is not None and new_g is not None and new_b is not None:
            set_color(min(new_r, 255), min(new_g, 255), min(new_b, 255))
            print("Colour:", r, g, b)

        response = web_page()`,
  'print("Colour controller running!")'
)}`;

const colorActivity: LessonActivity = {
  id: 'aider-55-color',
  title: 'Mix colours on an RGB LED from a web page',
  goal: 'Mix any colour on an RGB LED with three sliders on a web page, and see the same colour in a box on the page.',
  realWorld: 'Smart light strips and stage lights mix red, green and blue light the same way to make every colour.',
  parts: [PICO, { type: 'RGB_LED', label: 'RGB LED (common cathode)', count: 1 }, { type: 'RESISTOR_220', label: '220 Ω resistors', count: 3 }, BREADBOARD, jumpers(4), USB, WIFI],
  onRealHardware: true,
  steps: [
    wireStep(
      'build',
      'Connect the RGB LED',
      'Put the RGB LED on the breadboard. Its longest leg (the common cathode) goes to GND (pin 38). Connect the red, green and blue legs through a 220 Ω resistor each to GP12 (pin 16), GP13 (pin 17) and GP14 (pin 19).',
      'Each colour inside the LED needs its own resistor. If the colours come out mixed up, swap the wires on GP12, GP13 and GP14.'
    ),
    pasteCodeStep(
      COLOR_CODE,
      [
        code(String.raw`red\s*=\s*PWM\(\s*Pin\(\s*12\s*\)\s*\)`, 'GP12 drives the red LED with PWM'),
        code(String.raw`\*\s*257\b`, 'Turns 0-255 into a duty cycle'),
        code(String.raw`def\s+get_number\(`, 'Reads the slider values from the request'),
        servesOnPort80,
      ],
      'joins your Wi-Fi network and serves a page with red, green and blue sliders that set the LED\'s colour'
    ),
    credentialsStep(),
    uploadStep(),
    openPageStep(
      'Open the Pico\'s IP address on a phone on the same Wi-Fi network. Move the sliders and press Set Color: the LED and the box on the page show the colour. Try red and green full with blue at 0: that makes yellow.',
      'The address after pressing Set Color shows the numbers, for example /?r=255&g=255&b=0.'
    ),
  ],
  solutionCode: COLOR_CODE,
  observe: 'The LED glows in the colour you mix with the sliders, matching the box on the page.',
  wrapUp: 'Screens make every colour from red, green and blue in steps of 0 to 255, just like this page. Try this next: add buttons for your favourite colours.',
};

// --- Project 56: Wi-Fi touch switch -----------------------------------------------------------

const TOUCH_CODE = String.raw`import network
import socket
from machine import Pin
import time

${WIFI_JOIN}

# ==================== HARDWARE SETUP ====================
touch = Pin(1, Pin.IN, Pin.PULL_DOWN)  # TTP223 touch sensor
relay = Pin(0, Pin.OUT)  # Active LOW
led = Pin(2, Pin.OUT)    # status light
relay.value(1)  # Start OFF
led.value(0)

def toggle():
    """Switch the relay over, and show its state on the LED"""
    relay.value(1 - relay.value())
    led.value(1 - relay.value())  # LED on while the relay is ON (relay value 0)
    print("Switch", "ON" if relay.value() == 0 else "OFF")

def touched(pin):
    """Runs by itself (an interrupt) each time the sensor is touched"""
    toggle()

touch.irq(trigger=Pin.IRQ_RISING, handler=touched)

# ==================== WEB PAGE ====================
def web_page():
    state = "ON" if relay.value() == 0 else "OFF"
    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Touch Switch</title>
    <meta http-equiv="refresh" content="1; url=/">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {{font-family: Arial; text-align: center; padding: 50px;}}
        .btn {{padding: 30px 60px; font-size: 30px; background: #2196F3; color: white; border: none;}}
    </style>
</head>
<body>
    <h1>👆 Touch Switch</h1>
    <p style="font-size:50px">{state}</p>
    <a href="/toggle"><button class="btn">Toggle</button></a>
</body>
</html>"""
    return html

${webServer(
  String.raw`        if '/toggle' in request:
            toggle()

        response = web_page()`,
  'print("Touch switch running!")'
)}`;

const touchActivity: LessonActivity = {
  id: 'aider-56-touch',
  title: 'Switch with a touch or a tap on a phone',
  goal: 'Switch a relay with a touch sensor or a web button, with an LED that shows whether it is on.',
  realWorld: 'Touch light switches and lamps work like this, and smart ones can also be switched from a phone.',
  parts: [PICO, { type: 'TOUCH_SENSOR', label: 'TTP223 touch sensor', count: 1 }, RELAY_PART, LED_PART, RESISTOR_220, BREADBOARD, jumpers(9), USB, WIFI],
  onRealHardware: true,
  steps: [
    relayModuleStep(),
    wireStep(
      'build-touch',
      'Connect the touch sensor and the status LED',
      'Connect the touch sensor\'s VCC to 3V3 (pin 36), GND to GND and I/O (or SIG) to GP1 (pin 2). Connect the LED\'s long leg through a 220 Ω resistor to GP2 (pin 4), and its short leg to GND.',
      'The TTP223 gives 1 on its output while a finger touches the pad. The relay clicks when it switches; the LED shows its state.'
    ),
    pasteCodeStep(
      TOUCH_CODE,
      [
        inputPin('touch', 1, 'GP1 is an input for the touch sensor'),
        code(String.raw`touch\.irq\(`, 'Reacts to each touch with an interrupt'),
        handlesPath('/toggle', 'Toggle on the page switches it too'),
        servesOnPort80,
      ],
      'joins your Wi-Fi network, switches the relay on each touch, and serves a page with a Toggle button'
    ),
    credentialsStep(),
    uploadStep(),
    openPageStep(
      'Touch the sensor\'s pad: the relay clicks and the LED lights. Touch again to switch off. Open the Pico\'s IP address on a phone and press Toggle: it switches the same way, and the page shows ON or OFF.',
      'Nothing happens on touch? Check the sensor\'s small LED: it should light while you touch the pad. If it does, check the wire to GP1.'
    ),
  ],
  solutionCode: TOUCH_CODE,
  observe: 'Each touch, or each press of Toggle, switches the relay, and the LED shows its state.',
  wrapUp: 'Both the touch and the web button call the same toggle(), so they always agree. Try this next: switch off by itself after a minute, like a stairway light.',
};

// --- Project 57: Web water pump --------------------------------------------------------------

const PUMP_CODE = String.raw`import network
import socket
from machine import Pin, ADC, Timer
import time

${WIFI_JOIN}

# ==================== HARDWARE SETUP ====================
relay = Pin(0, Pin.OUT)  # Active LOW
level_sensor = ADC(Pin(26))
relay.value(1)  # Pump OFF

# Above this level (%) the tank is full
FULL_LEVEL = 80

def read_level():
    return int((level_sensor.read_u16() / 65535) * 100)

def check_level(t=None):
    """Runs twice a second: switches the pump off when the tank is full"""
    if read_level() > FULL_LEVEL and relay.value() == 0:
        relay.value(1)  # Turn OFF
        print("Tank full: pump OFF")

level_timer = Timer(period=500, mode=Timer.PERIODIC, callback=check_level)

# ==================== WEB PAGE ====================
def web_page():
    level = read_level()
    pump = "ON" if relay.value() == 0 else "OFF"

    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Water Pump</title>
    <meta http-equiv="refresh" content="2; url=/">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {{font-family: Arial; text-align: center; padding: 40px;}}
        .btn {{padding: 20px 40px; font-size: 24px; margin: 10px;}}
        .on {{background: #4CAF50; color: white;}}
        .off {{background: #f44336; color: white;}}
    </style>
</head>
<body>
    <h1>💧 Water Pump</h1>
    <p>Water Level: {level}%</p>
    <p>Pump: {pump}</p>
    <a href="/on"><button class="btn on">START</button></a>
    <a href="/off"><button class="btn off">STOP</button></a>
</body>
</html>"""
    return html

${webServer(
  String.raw`        if '/on' in request:
            if read_level() > FULL_LEVEL:
                print("Tank already full: pump stays OFF")
            else:
                relay.value(0)  # Turn ON
                print("Pump ON")
        elif '/off' in request:
            relay.value(1)  # Turn OFF
            print("Pump OFF")

        response = web_page()`,
  'print("Water pump server running!")'
)}`;

const pumpActivity: LessonActivity = {
  id: 'aider-57-pump',
  title: 'Fill a tank and stop when it is full',
  goal: 'Start and stop a pump from a web page, and switch it off by itself when a level sensor says the tank is full.',
  realWorld: 'Water towers and overhead tanks use a level switch so the pump never overflows the tank.',
  parts: [
    PICO,
    RELAY_PART,
    { type: 'WATER_PUMP', label: 'Small 5 V water pump with tube', count: 1 },
    { type: 'DIODE_1N4007', label: '1N4007 diode', count: 1 },
    { type: 'WATER_LEVEL', label: 'Water level sensor', count: 1 },
    EXTERNAL_5V,
    { type: 'CUP', label: 'Two containers (water source and tank)', count: 1 },
    BREADBOARD,
    jumpers(11),
    USB,
    WIFI,
  ],
  onRealHardware: true,
  steps: [
    relayModuleStep(),
    wireStep(
      'build-pump',
      'Connect the pump through the relay',
      'Connect the external supply\'s + to the relay\'s COM, the relay\'s NO to the pump\'s + wire, and the pump\'s − wire to the supply\'s −. Put the 1N4007 diode across the pump\'s wires, striped end on the + wire. Put the pump in the source container and its tube into the empty tank.',
      'Keep the Pico, the relay and the supply away from the water. Never let the pump run dry.'
    ),
    wireStep(
      'build-level',
      'Put the level sensor in the tank',
      'Connect the water level sensor\'s + to 3V3 (pin 36), − to GND and S to GP26 (pin 31). Fix it inside the tank so that the water reaches the top of its lines when the tank is full.',
      'Only the lines on the sensor\'s lower part may get wet.'
    ),
    pasteCodeStep(
      PUMP_CODE,
      [
        outputPin('relay', 0, 'GP0 is an output for the relay'),
        analogPin('level_sensor', 26, 'Reads the level sensor on GP26'),
        code(String.raw`Timer\.PERIODIC`, 'A timer watches the level all the time'),
        handlesPath('/on', 'START switches the pump on'),
        servesOnPort80,
      ],
      'joins your Wi-Fi network, serves a page with START and STOP buttons, and switches the pump off by itself when the tank is full'
    ),
    credentialsStep(),
    uploadStep(),
    openPageStep(
      'Open the Pico\'s IP address on a phone on the same Wi-Fi network and press START. Watch the water level rise on the page; when it passes 80% the pump stops by itself. Press START again: it stays off, because the tank is full.',
      'If the pump stops too early or too late, read the level on the page at the height you want and set FULL_LEVEL to it.'
    ),
  ],
  solutionCode: PUMP_CODE,
  observe: 'The pump fills the tank and switches itself off when the level reaches 80%.',
  wrapUp: 'The safety check runs on a timer, so it protects the tank even when no one is watching the page. Try this next: start the pump by itself when the level falls below 20%.',
};

// --- Project 58: Rain alert ------------------------------------------------------------------

const RAIN_ALERT_CODE = String.raw`import network
import socket
from machine import Pin, Timer
import time

${WIFI_JOIN}

# ==================== HARDWARE SETUP ====================
rain_sensor = Pin(1, Pin.IN)  # the module's DO: 0 when the plate is wet
buzzer = Pin(0, Pin.OUT)
led = Pin(2, Pin.OUT)

rain_alert = False

def check_rain(t=None):
    """Runs every half second: beeps and lights the LED while it rains"""
    global rain_alert
    rain_alert = rain_sensor.value() == 0  # Active LOW
    if rain_alert:
        led.value(1)
        buzzer.value(1 - buzzer.value())  # on, off, on...: a beep
    else:
        led.value(0)
        buzzer.value(0)

rain_timer = Timer(period=500, mode=Timer.PERIODIC, callback=check_rain)

# ==================== WEB PAGE ====================
def web_page():
    status = "RAIN DETECTED!" if rain_alert else "No Rain"
    color = "red" if rain_alert else "green"

    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Rain Alert</title>
    <meta http-equiv="refresh" content="2">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>body {{font-family: Arial; text-align: center; padding: 50px;}} .alert {{font-size: 50px; color: {color};}}</style>
</head>
<body>
    <h1>🌧️ Rain Alert</h1>
    <p class="alert">{status}</p>
</body>
</html>"""
    return html

${webServer('        response = web_page()', 'print("Rain alert server running!")')}`;

const rainAlertActivity: LessonActivity = {
  id: 'aider-58-rain-alert',
  title: 'Sound an alarm when it rains',
  goal: 'Beep and light an LED while the rain sensor is wet, and show the alert on a web page.',
  realWorld: 'A rain alarm tells you to bring in the washing or close the windows before things get wet.',
  parts: [PICO, { type: 'RAIN_SENSOR', label: 'Rain sensor module (plate and control board)', count: 1 }, BUZZER_PART, LED_PART, RESISTOR_220, BREADBOARD, jumpers(8), USB, WIFI],
  onRealHardware: true,
  steps: [
    wireStep(
      'build',
      'Connect the rain sensor, buzzer and LED',
      'Connect the rain control board\'s VCC to 3V3 (pin 36), GND to GND and DO to GP1 (pin 2). Connect the buzzer\'s + leg to GP0 (pin 1), and the LED\'s long leg through a 220 Ω resistor to GP2 (pin 4). The buzzer\'s − leg and the LED\'s short leg go to GND.',
      'Turn the blue knob on the control board until its second LED lights when you drip water on the plate.'
    ),
    pasteCodeStep(
      RAIN_ALERT_CODE,
      [
        inputPin('rain_sensor', 1, 'GP1 is an input for the rain sensor'),
        code(String.raw`rain_sensor\.value\(\)\s*==\s*0`, 'Wet is 0 (the module is active LOW)'),
        code(String.raw`Timer\.PERIODIC`, 'A timer checks for rain twice a second'),
        servesOnPort80,
      ],
      'joins your Wi-Fi network, checks the rain sensor twice a second, beeps and lights the LED while it is wet, and serves a page with the alert'
    ),
    credentialsStep(),
    uploadStep(),
    openPageStep(
      'Drip water on the plate: the buzzer beeps and the LED lights, and the page on your phone says RAIN DETECTED!. Dry the plate with a tissue and it all stops.',
      'Alarm while the plate is dry? Turn the blue knob the other way.'
    ),
  ],
  solutionCode: RAIN_ALERT_CODE,
  observe: 'The buzzer beeps and the LED lights while the plate is wet, and stop when it is dry.',
  wrapUp: 'The alarm runs on a timer, so it works with no page open. Try this next: beep only for the first 10 seconds of each shower.',
};

// --- Project 59: Safety alert buzzer ---------------------------------------------------------

const SAFETY_CODE = String.raw`import network
import socket
from machine import Pin
import time

${WIFI_JOIN}

# ==================== HARDWARE SETUP ====================
buzzer = Pin(0, Pin.OUT)
buzzer.value(0)
alert_count = 0

def play_alert():
    for _ in range(3):
        buzzer.value(1)
        time.sleep(0.2)
        buzzer.value(0)
        time.sleep(0.2)

# ==================== WEB PAGE ====================
def web_page():
    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Safety Alert</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {{font-family: Arial; text-align: center; padding: 50px;}}
        .btn {{background: red; color: white; padding: 30px; font-size: 30px; border: none; border-radius: 10px;}}
    </style>
</head>
<body>
    <h1>⚠️ Safety Alert</h1>
    <a href="/alert"><button class="btn">TRIGGER ALERT</button></a>
    <p>Alerts sent: {alert_count}</p>
</body>
</html>"""
    return html

${webServer(
  String.raw`        if '/alert' in request:
            alert_count += 1
            print("ALERT! Number", alert_count)
            play_alert()

        response = web_page()`,
  'print("Safety alert server running!")'
)}`;

const safetyActivity: LessonActivity = {
  id: 'aider-59-safety',
  title: 'Trigger a safety alarm from a phone',
  goal: 'Sound a buzzer alarm from a big red button on a web page.',
  realWorld: 'Panic buttons in banks, clinics and schools send an alert over the network to sound an alarm somewhere else.',
  parts: [PICO, BUZZER_PART, BREADBOARD, jumpers(2), USB, WIFI],
  onRealHardware: true,
  steps: [
    wireStep(
      'build',
      'Connect the buzzer',
      'Connect the active buzzer\'s + leg to GP0 (pin 1) and its − leg to GND (pin 38).',
      'An active buzzer beeps by itself when it gets power.'
    ),
    pasteCodeStep(
      SAFETY_CODE,
      [outputPin('buzzer', 0, 'GP0 is an output for the buzzer'), handlesPath('/alert', 'TRIGGER ALERT sounds the alarm'), servesOnPort80],
      'joins your Wi-Fi network and serves a page with a TRIGGER ALERT button that beeps the buzzer three times'
    ),
    credentialsStep(),
    uploadStep(),
    openPageStep(
      'Open the Pico\'s IP address on a phone on the same Wi-Fi network and press TRIGGER ALERT: the buzzer beeps three times, the Terminal prints the alert, and the page counts it.',
      'After an alert the address ends in /alert, so reloading the page sounds it again: press the button instead.'
    ),
  ],
  solutionCode: SAFETY_CODE,
  observe: 'The buzzer beeps three times each time you press TRIGGER ALERT.',
  wrapUp: 'Any phone on the network can now sound the alarm. Try this next: add a second Pico with a push button that triggers this one, by opening its /alert address.',
};

// --- Project 60: IoT plant status --------------------------------------------------------------

const PLANT_CODE = String.raw`import network
import socket
from machine import Pin, I2C, ADC, Timer
import BME280
import sh1106
import time

${WIFI_JOIN}

# ==================== HARDWARE SETUP ====================
# The screen and the BME280 share I2C bus 0 (SDA on GP8, SCL on GP9)
i2c = I2C(0, sda=Pin(8), scl=Pin(9), freq=400000)
display = sh1106.SH1106_I2C(128, 64, i2c)
bme = BME280.BME280(i2c=i2c)

soil = ADC(Pin(26))  # soil moisture sensor's analog output

def read_soil():
    moisture = 100 - int((soil.read_u16() / 65535) * 100)  # dry soil gives high readings
    status = "DRY" if moisture < 40 else "WET"
    return moisture, status

def update_display(t=None):
    """Runs every 2 seconds: shows the plant's conditions on the OLED"""
    temp = bme.temperature
    hum = bme.humidity
    moisture, soil_status = read_soil()

    display.fill(0)
    display.text("Plant Status", 16, 0, 1)
    display.text(f"Temp: {temp}", 0, 20, 1)
    display.text(f"Hum: {hum}", 0, 35, 1)
    display.text(f"Soil: {moisture}% {soil_status}", 0, 50, 1)
    display.show()

update_display()
display_timer = Timer(period=2000, mode=Timer.PERIODIC, callback=update_display)

print("Plant Monitor Started!")

# ==================== WEB PAGE ====================
def web_page():
    moisture, soil_status = read_soil()
    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Plant Status</title>
    <meta http-equiv="refresh" content="5">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>body {{font-family: Arial; text-align: center; padding: 40px;}} p {{font-size: 24px;}}</style>
</head>
<body>
    <h1>🪴 Plant Status</h1>
    <p>Temperature: {bme.temperature}</p>
    <p>Humidity: {bme.humidity}</p>
    <p>Soil: {moisture}% ({soil_status})</p>
</body>
</html>"""
    return html

${webServer('        response = web_page()', 'print("Plant status page running!")')}`;

const plantActivity: LessonActivity = {
  id: 'aider-60-plant',
  title: 'Watch a plant\'s conditions',
  goal: 'Show temperature, humidity and soil moisture on an OLED screen next to the plant and on a web page.',
  realWorld: 'Smart planters and greenhouse controllers watch all three, because a plant needs the right air and the right soil.',
  parts: [PICO, BME280_PART, SOIL_PART, OLED_PART, { type: 'POT_PLANT', label: 'Pot plant', count: 1 }, BREADBOARD, jumpers(11), USB, WIFI],
  onRealHardware: true,
  steps: [
    libraryStep('BME280', 'BME280'),
    libraryStep('SH1106', 'OLED screen'),
    wireStep(
      'build',
      'Connect the screen and the two sensors',
      'The screen and the BME280 share four lines: VCC to 3V3 (pin 36), GND to GND (pin 38), SDA to GP8 (pin 11) and SCL to GP9 (pin 12); join each pair of wires in a breadboard row. Connect the soil sensor\'s VCC to 3V3, GND to GND and AOUT to GP26 (pin 31).',
      'Use the breadboard\'s + and − rails for 3V3 and GND: five wires need them.'
    ),
    pasteCodeStep(
      PLANT_CODE,
      [
        importsDriver('BME280'),
        importsDriver('sh1106'),
        i2cOnGp8Gp9,
        analogPin('soil', 26, 'Reads the soil sensor on GP26'),
        code(String.raw`Timer\.PERIODIC`, 'A timer updates the screen every 2 seconds'),
        servesOnPort80,
      ],
      'joins your Wi-Fi network, shows temperature, humidity and soil moisture on the screen every 2 seconds, and serves a page with the same'
    ),
    credentialsStep(),
    uploadStep(),
    openPageStep(
      'The screen shows Plant Status with the temperature, humidity and soil moisture. Water the plant and watch the soil reading rise; open the Pico\'s IP address on a phone to see the same on the page.',
      BME280_NOT_FOUND
    ),
  ],
  solutionCode: PLANT_CODE,
  observe: 'The screen and the page show the temperature, humidity and soil moisture, and the soil reading rises when you water the plant.',
  wrapUp: 'Three sensors and a screen share the Pico: two on the I2C bus, one on an analog pin. Try this next: show a smiley face on the screen when all three readings are good.',
};

// --- Project 62: Wi-Fi temperature alert --------------------------------------------------------

const TEMP_ALERT_CODE = String.raw`import network
import socket
from machine import Pin, I2C, Timer
import BME280
import time

${WIFI_JOIN}

# ==================== HARDWARE SETUP ====================
i2c = I2C(0, sda=Pin(8), scl=Pin(9), freq=400000)
bme = BME280.BME280(i2c=i2c)
led = Pin(0, Pin.OUT)

HIGH_TEMP = 30
LOW_TEMP = 18
status = "Starting"

def check_temperature(t=None):
    """Runs every 2 seconds: lights the LED when it is too hot or too cold"""
    global status
    temp_val = float(bme.temperature.replace('C', ''))  # "23.45C" -> 23.45
    if temp_val > HIGH_TEMP:
        status = "TOO HOT!"
        led.value(1)
    elif temp_val < LOW_TEMP:
        status = "TOO COLD!"
        led.value(1)
    else:
        status = "Normal"
        led.value(0)

check_temperature()
alert_timer = Timer(period=2000, mode=Timer.PERIODIC, callback=check_temperature)

# ==================== WEB PAGE ====================
def web_page():
    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Temperature Alert</title>
    <meta http-equiv="refresh" content="5">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>body {{font-family: Arial; text-align: center; padding: 40px;}} p {{font-size: 24px;}}</style>
</head>
<body>
    <h1>🌡️ Temperature Alert</h1>
    <p>Current: {bme.temperature}</p>
    <p>Status: {status}</p>
    <p>Range: {LOW_TEMP}°C - {HIGH_TEMP}°C</p>
</body>
</html>"""
    return html

${webServer('        response = web_page()', 'print("Temperature alert running!")')}`;

const tempAlertActivity: LessonActivity = {
  id: 'aider-62-temp-alert',
  title: 'Warn when it is too hot or too cold',
  goal: 'Light an LED when the temperature leaves a safe range, and show the status on a web page.',
  realWorld: 'Vaccine fridges, server rooms and chicken houses raise an alarm as soon as the temperature leaves its safe range.',
  parts: [PICO, BME280_PART, LED_PART, RESISTOR_220, BREADBOARD, jumpers(6), USB, WIFI],
  onRealHardware: true,
  steps: [
    libraryStep('BME280', 'BME280'),
    bme280Wiring(),
    wireStep(
      'build-led',
      'Connect the alert LED',
      'Connect the LED\'s long leg through a 220 Ω resistor to GP0 (pin 1), and its short leg to GND.',
      'If the LED never lights, turn it round.'
    ),
    pasteCodeStep(
      TEMP_ALERT_CODE,
      [
        importsDriver('BME280'),
        i2cOnGp8Gp9,
        outputPin('led', 0, 'GP0 is an output for the alert LED'),
        code(String.raw`HIGH_TEMP\s*=`, 'Sets the highest safe temperature'),
        code(String.raw`Timer\.PERIODIC`, 'A timer checks the temperature every 2 seconds'),
        servesOnPort80,
        autoRefreshes,
      ],
      'joins your Wi-Fi network, checks the temperature every 2 seconds, lights the LED outside the safe range, and serves a page with the status'
    ),
    credentialsStep(),
    uploadStep(),
    openPageStep(
      'Open the Pico\'s IP address on a phone on the same Wi-Fi network: it shows the temperature and Normal. To test the alarm, change HIGH_TEMP to 1 degree above the temperature shown, upload, and hold the sensor in your hand: the LED lights and the page says TOO HOT!.',
      `Pick HIGH_TEMP and LOW_TEMP for what you protect: a vaccine fridge, for example, must stay between 2 and 8 degrees. ${BME280_NOT_FOUND}`
    ),
  ],
  solutionCode: TEMP_ALERT_CODE,
  observe: 'The LED lights and the page says TOO HOT! or TOO COLD! when the temperature leaves the range.',
  wrapUp: 'The check runs on a timer, so the LED warns even with no page open. Try this next: add a buzzer that beeps while the temperature is out of range.',
};

// --- Lessons ----------------------------------------------------------------------------------

export const smartLightLesson = aiderLesson('smart-room-light-monitor', 'Smart Room Light Monitor', 50, smartLightActivity);
export const relaySchedulerLesson = aiderLesson('wi-fi-relay-scheduler', 'Wi-Fi Relay Scheduler', 51, schedulerActivity);
export const alarmClockLesson = aiderLesson('iot-alarm-clock', 'IoT Alarm Clock', 52, alarmActivity);
export const motionCounterLesson = aiderLesson('web-motion-counter', 'Web Motion Counter', 53, motionCounterActivity);
export const soilDrynessLesson = aiderLesson('soil-dryness-indicator', 'Soil Dryness Indicator', 54, soilAlertActivity);
export const colorControlLesson = aiderLesson('wi-fi-color-sensor', 'Wi-Fi Color Sensor', 55, colorActivity);
export const touchSwitchLesson = aiderLesson('wi-fi-touch-switch', 'Wi-Fi Touch Switch', 56, touchActivity);
export const waterPumpLesson = aiderLesson('web-water-pump', 'Web Water Pump', 57, pumpActivity);
export const rainAlertLesson = aiderLesson('rain-alert-system', 'Rain Alert System', 58, rainAlertActivity);
export const safetyAlertLesson = aiderLesson('safety-alert-buzzer', 'Safety Alert Buzzer', 59, safetyActivity);
export const plantStatusLesson = aiderLesson('iot-plant-status', 'IoT Plant Status', 60, plantActivity);
export const temperatureAlertLesson = aiderLesson('wi-fi-temperature-alert', 'Wi-Fi Temperature Alert', 62, tempAlertActivity);
