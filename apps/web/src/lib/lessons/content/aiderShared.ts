import type { LessonStep, StepCheck } from '../types';
import { MICROPYTHON_LIBRARIES, type MicroPythonLibraryId } from '../libraries';
import { all } from './helpers';

// Shared by the AIDER lessons (Raspberry Pi Pico 2 W, MicroPython, from the STEMAIDE AIDER student
// manuals). Built on real hardware: the steps cannot see the circuit, so wiring and testing steps
// are ticked by the learner, and code steps check the code typed into main.py.
//
// The programs keep each manual's idea and code, with the same corrections everywhere:
// - The Wi-Fi join stops with a message when the name or password is wrong instead of waiting
//   for ever (tested on a real Pico 2 W).
// - The web server reads each request before answering, survives a browser dropping the
//   connection, says its pages are UTF-8 (the emoji show), and sets SO_REUSEADDR so a new upload
//   can start it again straight away.
// - Requests are turned into text with str() before they are searched: '/on' in request fails on
//   the bytes that recv() returns, so several manuals' servers stopped at the first click.
// `npm test` runs every program on a fake Pico (scripts/micropython-fake-pico.py) to catch the rest.

export const PICO = { type: 'PICO_2W', label: 'Raspberry Pi Pico 2 W', count: 1 };
export const USB = { type: 'USB_CABLE', label: 'USB data cable', count: 1 };
export const BREADBOARD = { type: 'BREADBOARD', label: 'Breadboard', count: 1 };
export const WIFI = { type: 'WIFI', label: '2.4 GHz Wi-Fi network', count: 1 };
export const jumpers = (count: number) => ({ type: 'JUMPER', label: 'Jumper wires', count });

// --- Code checks (spacing-tolerant regular expressions on main.py) -----------------------------

export const code = (pattern: string, label: string): StepCheck => ({ kind: 'code', pattern, label });

export const joinsWifi = code(String.raw`network\.WLAN\(\s*network\.STA_IF\s*\)`, 'Joins a Wi-Fi network');
export const connects = code(String.raw`\.connect\(\s*SSID\s*,\s*PASSWORD\s*\)`, 'Connects with your name and password');
export const printsIp = code(String.raw`ifconfig\(\)\s*\[\s*0\s*\]`, 'Prints the IP address');
export const servesOnPort80 = code(String.raw`\.bind\(\s*\(\s*['"]0\.0\.0\.0['"]\s*,\s*80\s*\)\s*\)`, 'Runs a web server on port 80');
export const autoRefreshes = code(String.raw`http-equiv=["']refresh["']`, 'The page refreshes itself');
export const ssidFilledIn: StepCheck = {
  kind: 'code',
  pattern: String.raw`SSID\s*=\s*["'](?!YOUR_WIFI_NAME["'])[^"'\n]+["']`,
  label: 'Your Wi-Fi name is filled in',
};
export const passwordFilledIn: StepCheck = {
  kind: 'code',
  pattern: String.raw`PASSWORD\s*=\s*["'](?!YOUR_PASSWORD["'])[^"'\n]*["']`,
  label: 'Your Wi-Fi password is filled in',
};

export const outputPin = (name: string, pin: number, label: string) =>
  code(String.raw`${name}\s*=\s*Pin\(\s*${pin}\s*,\s*Pin\.OUT\s*\)`, label);
export const inputPin = (name: string, pin: number, label: string) =>
  code(String.raw`${name}\s*=\s*Pin\(\s*${pin}\s*,\s*Pin\.IN\b`, label);
export const analogPin = (name: string, pin: number, label: string) =>
  code(String.raw`${name}\s*=\s*ADC\(\s*Pin\(\s*${pin}\s*\)\s*\)`, label);
export const handlesButton = (query: string, label: string) => code(String.raw`['"]/\?${query}['"]\s+in\s+request`, label);
export const handlesPath = (path: string, label: string) => code(String.raw`['"]${path}['"]\s+in\s+request`, label);
export const importsDriver = (module: string) => code(String.raw`(?:^|\n)import\s+${module}\b`, `Imports the ${module} driver`);
/** I2C bus 0 on GP8 (SDA) and GP9 (SCL), as every AIDER manual wires it. */
export const i2cOnGp8Gp9 = code(
  String.raw`I2C\(\s*0\s*,\s*sda\s*=\s*Pin\(\s*8\s*\)\s*,\s*scl\s*=\s*Pin\(\s*9\s*\)`,
  'I2C uses GP8 (SDA) and GP9 (SCL)'
);

// --- Steps --------------------------------------------------------------------------------------

export const credentialsStep = (): LessonStep => ({
  id: 'wifi-details',
  kind: 'code',
  title: 'Add your Wi-Fi name and password',
  body: 'Near the top of the code, replace YOUR_WIFI_NAME with the name of the Wi-Fi network and YOUR_PASSWORD with its password. Keep the quotation marks.',
  hint: 'Names and passwords are case-sensitive. Many routers show two networks with similar names, such as MyWiFi and MyWiFi_2.4GHz: use the 2.4 GHz one. Your password is saved inside this project, so take it out before you export or share the project.',
  check: all(ssidFilledIn, passwordFilledIn),
});

export const uploadStep = (): LessonStep => ({
  id: 'upload',
  kind: 'run',
  title: 'Upload and find the IP address',
  body: 'Plug the Pico into the computer with the USB cable and click Upload. If a list of ports opens, pick the Pico (it is often called "USB Serial Device"). The Terminal on the right shows what the Pico prints: after "Connected!" comes its IP address, for example 192.168.1.42. Write it down.',
  hint: 'If the Pico cannot find your network, it lists the networks it can see: copy the name exactly from that list. The Pico 2 W only joins 2.4 GHz networks. If the upload says the board did not answer, the Pico needs MicroPython first: hold its BOOTSEL button while plugging it in, then copy the MicroPython file from micropython.org onto the drive that appears.',
});

/** `does` finishes the sentence "This program ...". */
export const pasteCodeStep = (python: string, checks: StepCheck[], does: string): LessonStep => ({
  id: 'code',
  kind: 'code',
  title: 'Paste the code',
  body: `Click Copy, then in main.py select everything that is there and paste. This program ${does}. If main.py already has your Wi-Fi name and password, Copy keeps them.`,
  python,
  hint: 'Python uses the spaces at the start of a line to group code, so paste it as it is and do not change the indentation.',
  check: all(...checks),
});

export const openPageStep = (body: string, hint: string, title = 'Open the page on a phone'): LessonStep => ({
  id: 'open-page',
  kind: 'observe',
  title,
  body,
  hint: `${hint} If the page will not load, check that the phone is on the same Wi-Fi network as the Pico. Many school networks stop devices from talking to each other: a phone hotspot works instead.`,
});

/** Adds a kit driver (BME280.py, sh1106.py) to the project; Upload then saves it on the Pico. */
export const libraryStep = (id: MicroPythonLibraryId, partName: string): LessonStep => {
  const { fileName } = MICROPYTHON_LIBRARIES[id];
  const module = fileName.replace(/\.py$/, '');
  return {
    id: `library-${module.toLowerCase()}`,
    kind: 'code',
    title: `Add the ${partName} driver`,
    body: `Click Add ${fileName}. It puts the driver in your project next to main.py, and Upload saves both on the Pico. Your program loads it with "import ${module}".`,
    hint: `A driver is code written once so that every program can use a part with simple commands. You add it once per project; keep it even if you never open it.`,
    library: id,
    check: { kind: 'file', name: fileName, label: `${fileName} is in the project` },
  };
};

// --- Program pieces -----------------------------------------------------------------------------

/** Joins the Wi-Fi network and prints the IP address; stops with a message if it cannot. */
export const WIFI_JOIN = String.raw`# ==================== Wi-Fi SETUP ====================
SSID = "YOUR_WIFI_NAME"
PASSWORD = "YOUR_PASSWORD"

wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect(SSID, PASSWORD)

print("Connecting to Wi-Fi...")
while wlan.isconnected() == False:
    if wlan.status() < 0:  # the Pico gave up: wrong Wi-Fi name or password
        print("Could not join", SSID, "- check the Wi-Fi name and password (2.4 GHz networks only)")
        raise SystemExit
    time.sleep(1)

print("Connected!")
print("IP Address:", wlan.ifconfig()[0])`;

/** Sets the Pico's clock from the internet, for pages that show the time. */
export const CLOCK_FROM_INTERNET = String.raw`# Set the Pico's clock from the internet (UTC, also called GMT)
try:
    ntptime.settime()
except OSError:
    print("Could not get the time from the internet: the clock shown may be wrong")`;

/**
 * Starts the web server and answers every request. `handle` (indented 8 spaces) can read
 * `request` (text) and must set `response` to the page to send.
 */
export const webServer = (handle: string, banner = 'print("Web server started! Open the IP address above in a browser")') =>
  String.raw`# ==================== WEB SERVER ====================
s = socket.socket()
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)  # lets the server restart straight away
s.bind(('0.0.0.0', 80))
s.listen(5)

${banner}

while True:
    conn, addr = s.accept()
    try:
        request = str(conn.recv(1024))  # what the browser asked for, as text

${handle}

        conn.send('HTTP/1.1 200 OK\r\n')
        conn.send('Content-Type: text/html; charset=utf-8\r\n')
        conn.send('Connection: close\r\n\r\n')
        conn.sendall(response)
    except OSError as error:
        print("Connection problem:", error)
    conn.close()
`;
