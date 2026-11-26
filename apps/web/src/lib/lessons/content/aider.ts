import type { Lesson, LessonActivity } from '../types';
import { all } from './helpers';
import {
  BREADBOARD,
  PICO,
  USB,
  WIFI,
  WIFI_JOIN,
  connects,
  credentialsStep,
  handlesButton,
  joinsWifi,
  openPageStep,
  outputPin,
  pasteCodeStep,
  printsIp,
  servesOnPort80,
  uploadStep,
  webServer,
} from './aiderShared';

// Projects 31-33 of the AIDER student manuals, the first AIDER lessons. Project 31 was tested end
// to end on a real Pico 2 W. Shared steps, checks and program pieces are in aiderShared.ts.
//
// Correction to manual 33: its wiring table puts both sides of the LED on 5 V (anode through the
// resistor, cathode through the relay to COM, which also goes to 5 V), so the LED can never light.
// Here the relay switches 5 V to the LED, and the LED's short leg goes to GND.

/** A switch-it-from-a-web-page program: Wi-Fi, one output, a page with ON and OFF buttons. */
const wifiServerCode = (hardware: string, html: string, handler: string, banner = 'print("Web server started!")\nprint("Open your browser and enter the IP address above")') =>
  String.raw`import network
import socket
from machine import Pin
import time

${WIFI_JOIN}

# ==================== HARDWARE SETUP ====================
${hardware}

# ==================== WEB PAGE ====================
html = """${html}"""

${webServer(handler, banner)}`;

const controlPage = (title: string, heading: string, item: string, query: string, onLabel: string, offLabel: string, onColor: string, offColor: string) => `<!DOCTYPE html>
<html>
<head>
    <title>${title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {font-family: Arial; text-align: center; margin: 50px;}
        .button {padding: 20px 40px; font-size: 24px; margin: 10px;}
        .on {background-color: ${onColor}; color: white;}
        .off {background-color: ${offColor}; color: white;}
    </style>
</head>
<body>
    <h1>${heading}</h1>
    <p>${item} is currently: <strong>STATE</strong></p>
    <a href="/?${query}=on"><button class="button on">${onLabel}</button></a>
    <a href="/?${query}=off"><button class="button off">${offLabel}</button></a>
</body>
</html>
`;

// --- Project 31: Wi-Fi LED control ------------------------------------------------------------

const WIFI_TEST_CODE = `import network
import time

SSID = "YOUR_WIFI_NAME"
PASSWORD = "YOUR_PASSWORD"

wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect(SSID, PASSWORD)

print("Connecting to Wi-Fi...")
while wlan.isconnected() == False:
    if wlan.status() == network.STAT_NO_AP_FOUND:
        print("\\nCannot find a Wi-Fi network called", SSID)
        print("The Pico can see these networks (2.4 GHz only):")
        for net in wlan.scan():
            if net[0]:
                print("   ", net[0].decode())
        break
    if wlan.status() == network.STAT_WRONG_PASSWORD:
        print("\\nThe password for", SSID, "is not right")
        break
    print('.', end='')
    time.sleep(1)

if wlan.isconnected():
    print("\\nConnected!")
    print("IP Address:", wlan.ifconfig()[0])
`;

const LED_CODE = wifiServerCode(
  'led = Pin(0, Pin.OUT)\nled.value(0)  # Start with LED off',
  controlPage('Pico LED Control', 'Raspberry Pi Pico 2 W LED Control', 'LED', 'led', 'LED ON', 'LED OFF', 'green', 'red'),
  String.raw`        print("Client connected from:", addr)

        # Control LED based on request
        if '/?led=on' in request:
            led.value(1)
            print("LED turned ON")
        elif '/?led=off' in request:
            led.value(0)
            print("LED turned OFF")

        # Update LED state in HTML
        state = "ON" if led.value() else "OFF"
        response = html.replace('STATE', state)`
);

const connectActivity: LessonActivity = {
  id: 'aider-31-wifi',
  title: 'Connect the Pico to Wi-Fi',
  goal: 'Get the Raspberry Pi Pico 2 W onto your Wi-Fi network and find its address on the network.',
  realWorld: 'Every smart device at home, from light bulbs to doorbells, first joins the Wi-Fi network like this.',
  parts: [PICO, USB, WIFI],
  onRealHardware: true,
  steps: [
    {
      id: 'code',
      kind: 'code',
      title: 'Paste the Wi-Fi code',
      body: 'Click Copy, then in main.py select everything that is there and paste. This short program only joins the Wi-Fi network and prints the Pico\'s address.',
      python: WIFI_TEST_CODE,
      hint: 'STA_IF means "station": the Pico joins an existing network, the way a phone does.',
      check: all(joinsWifi, connects, printsIp),
    },
    credentialsStep(),
    uploadStep(),
  ],
  solutionCode: WIFI_TEST_CODE,
  observe: 'The Terminal shows "Connected!" and an IP address such as 192.168.1.42.',
  wrapUp: 'The IP address is how other devices find the Pico on the network. Next you will use it to open a web page that the Pico serves.',
};

const ledActivity: LessonActivity = {
  id: 'aider-31-led',
  title: 'Switch an LED from a web page',
  goal: 'Build a web page on the Pico with LED ON and LED OFF buttons, and switch a real LED from any phone or computer on the same Wi-Fi network.',
  realWorld: 'This is how smart home apps switch lights: the phone sends a request over Wi-Fi and the device switches.',
  parts: [PICO, { type: 'LED', label: 'LED', count: 1 }, { type: 'RESISTOR_220', label: '220 Ω resistor (red-red-brown)', count: 1 }, BREADBOARD, { type: 'JUMPER', label: 'Jumper wires', count: 3 }, USB, WIFI],
  onRealHardware: true,
  steps: [
    {
      id: 'build',
      kind: 'wire',
      title: 'Build the LED circuit',
      body: 'Put the LED on the breadboard: long leg (+) in one row, short leg (−) in another. Connect a 220 Ω resistor from the long leg\'s row to an empty row. Run a wire from GP0 (pin 1 on the Pico) to the resistor, and a wire from GND (pin 38) to the LED\'s short leg.',
      hint: 'The resistor protects the LED from too much current. If the LED never lights later, turn it round: the long leg must go towards GP0.',
    },
    pasteCodeStep(
      LED_CODE,
      [outputPin('led', 0, 'GP0 is an output for the LED'), servesOnPort80, handlesButton('led=on', 'Handles the LED ON button'), handlesButton('led=off', 'Handles the LED OFF button')],
      'joins your Wi-Fi network, sets GP0 as an output for the LED, and shows a web page with buttons'
    ),
    credentialsStep(),
    uploadStep(),
    openPageStep(
      'On a phone or computer on the same Wi-Fi network, open the web browser and type the IP address into the address bar, for example http://192.168.1.42. Press LED ON and LED OFF. The page shows whether the LED is on.',
      'The Terminal prints "Client connected from" each time the page loads.',
      'Control it from a phone'
    ),
  ],
  solutionCode: LED_CODE,
  observe: 'The LED switches on and off when you press the buttons on the web page.',
  wrapUp: 'You built your first IoT controller. Try this next: add two more LEDs with their own buttons, or a slider that sets the brightness with PWM.',
};

// --- Project 32: Wi-Fi buzzer control ---------------------------------------------------------

const BUZZER_CODE = wifiServerCode(
  'buzzer = Pin(0, Pin.OUT)\nbuzzer.value(0)  # Start with buzzer off',
  controlPage('Pico Buzzer Control', 'Raspberry Pi Pico 2 W Buzzer Control', 'Buzzer', 'buzzer', 'BUZZER ON', 'BUZZER OFF', 'red', 'gray'),
  String.raw`        print("Client connected from:", addr)

        # Control buzzer based on request
        if '/?buzzer=on' in request:
            buzzer.value(1)
            print("Buzzer ON")
        elif '/?buzzer=off' in request:
            buzzer.value(0)
            print("Buzzer OFF")

        # Update HTML with current state
        state = "ACTIVE" if buzzer.value() else "SILENT"
        response = html.replace('STATE', state)`
);

const buzzerActivity: LessonActivity = {
  id: 'aider-32-buzzer',
  title: 'Sound a buzzer from a web page',
  goal: 'Switch an active buzzer on and off from a web page served by the Pico.',
  realWorld: 'Remote alarms, doorbells and alert systems sound a buzzer when a message arrives over the network.',
  parts: [PICO, { type: 'BUZZER', label: 'Active buzzer', count: 1 }, BREADBOARD, { type: 'JUMPER', label: 'Jumper wires', count: 3 }, USB, WIFI],
  onRealHardware: true,
  steps: [
    {
      id: 'build',
      kind: 'wire',
      title: 'Connect the buzzer',
      body: 'Connect the buzzer\'s + leg (red wire) to GP0 (pin 1 on the Pico) and its − leg (black wire) to GND (pin 38).',
      hint: 'An active buzzer beeps by itself when it gets power, so the code only switches it on and off. If it stays silent later, swap its two wires.',
    },
    pasteCodeStep(
      BUZZER_CODE,
      [outputPin('buzzer', 0, 'GP0 is an output for the buzzer'), servesOnPort80, handlesButton('buzzer=on', 'Handles the BUZZER ON button'), handlesButton('buzzer=off', 'Handles the BUZZER OFF button')],
      'joins your Wi-Fi network, sets GP0 as an output for the buzzer, and shows a web page with buttons'
    ),
    credentialsStep(),
    uploadStep(),
    openPageStep(
      'On a phone or computer on the same Wi-Fi network, open the browser and type the Pico\'s IP address. Press BUZZER ON, then BUZZER OFF. The page says ACTIVE or SILENT.',
      'Buzzer on all the time? Check the wire to GP0, or try another GPIO pin and change the 0 in Pin(0, Pin.OUT) to match.',
      'Control it from a phone'
    ),
  ],
  solutionCode: BUZZER_CODE,
  observe: 'The buzzer sounds when you press BUZZER ON and stops when you press BUZZER OFF.',
  wrapUp: 'The web page now controls sound as well as light. Try this next: add a button that beeps three times, like a doorbell.',
};

// --- Project 33: Wi-Fi relay switch -----------------------------------------------------------

const RELAY_CODE = wifiServerCode(
  '# Relay on GPIO 0 - Active LOW!\nrelay = Pin(0, Pin.OUT)\nrelay.value(1)  # Start with relay OFF',
  controlPage('Pico Relay Control', 'Wi-Fi Relay Switch', 'Relay', 'relay', 'RELAY ON', 'RELAY OFF', 'green', 'red'),
  String.raw`        # Control relay - Note: Active LOW!
        if '/?relay=on' in request:
            relay.value(0)  # Relay ON
            print("Relay ON")
        elif '/?relay=off' in request:
            relay.value(1)  # Relay OFF
            print("Relay OFF")

        # Update HTML
        state = "ON" if relay.value() == 0 else "OFF"
        response = html.replace('STATE', state)`,
  'print("Web server started!")'
);

const relayActivity: LessonActivity = {
  id: 'aider-33-relay',
  title: 'Switch a relay from a web page',
  goal: 'Use a relay, an electronic switch, to turn a separately powered LED on and off from a web page.',
  realWorld: 'Relays let small boards like the Pico switch fans, pumps and lamps that need more power than a GPIO pin can give.',
  parts: [
    PICO,
    { type: 'RELAY', label: '5 V relay module (1 channel)', count: 1 },
    { type: 'LED', label: 'LED (the load)', count: 1 },
    { type: 'RESISTOR_220', label: '220 Ω resistor', count: 1 },
    BREADBOARD,
    { type: 'JUMPER', label: 'Jumper wires', count: 8 },
    USB,
    WIFI,
  ],
  onRealHardware: true,
  steps: [
    {
      id: 'build-relay',
      kind: 'wire',
      title: 'Connect the relay module',
      body: 'Connect the relay module\'s VCC to 5 V (VBUS, pin 40 on the Pico), its GND to GND (pin 38), and its IN to GP0 (pin 1).',
      hint: 'VBUS gives 5 V from the USB cable. The relay\'s coil needs 5 V; the Pico only gives the signal on IN.',
    },
    {
      id: 'build-load',
      kind: 'wire',
      title: 'Connect the LED through the relay',
      body: 'Connect the relay\'s COM terminal to 5 V (pin 40). Connect its NO (normally open) terminal to the 220 Ω resistor, the resistor to the LED\'s long leg, and the LED\'s short leg to GND.',
      hint: 'When the relay switches on, it joins COM to NO and 5 V flows through the LED. Never connect mains electricity (the wall socket) to the relay: use low-voltage loads only.',
    },
    pasteCodeStep(
      RELAY_CODE,
      [outputPin('relay', 0, 'GP0 is an output for the relay'), servesOnPort80, handlesButton('relay=on', 'Handles the RELAY ON button'), handlesButton('relay=off', 'Handles the RELAY OFF button')],
      'joins your Wi-Fi network, controls the relay on GP0, and shows a web page with buttons'
    ),
    credentialsStep(),
    uploadStep(),
    openPageStep(
      'On a phone or computer on the same Wi-Fi network, open the browser and type the Pico\'s IP address. Press RELAY ON: the relay clicks and the LED lights. Press RELAY OFF: it clicks again and the LED goes out.',
      'Most relay modules are "active low": value(0) switches them ON and value(1) switches them OFF, which is why the code looks back to front. If yours works the other way round, swap the 0 and 1.',
      'Control it from a phone'
    ),
  ],
  solutionCode: RELAY_CODE,
  observe: 'The relay clicks and the LED lights when you press RELAY ON, and goes out when you press RELAY OFF.',
  wrapUp: 'With a relay, the Pico can switch things that need their own power, like a fan or a pump. Try this next: show the relay\'s state in colour on the page.',
};

export const wifiLedLesson: Lesson = {
  slug: 'wi-fi-led-control-via-web-page',
  title: 'Wi-Fi LED Control via Web Page',
  source: 'STEMAIDE AIDER student manual: Project 31, Wi-Fi LED Control via Web Page',
  activities: [connectActivity, ledActivity],
};

export const wifiBuzzerLesson: Lesson = {
  slug: 'wi-fi-buzzer-control',
  title: 'Wi-Fi Buzzer Control',
  source: 'STEMAIDE AIDER student manual: Project 32, Wi-Fi Buzzer Control',
  activities: [buzzerActivity],
};

export const wifiRelayLesson: Lesson = {
  slug: 'wi-fi-relay-switch',
  title: 'Wi-Fi Relay Switch',
  source: 'STEMAIDE AIDER student manual: Project 33, Wi-Fi Relay Switch',
  activities: [relayActivity],
};
