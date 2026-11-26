"""
Runs a lesson's MicroPython program with ordinary Python, on a fake Raspberry Pi Pico 2 W.

The fakes stand in for Wi-Fi, sockets, pins, the ADC, I2C, the kit's BME280 and SH1106 drivers
and the clock, closely enough to run the program's main paths: it joins "Wi-Fi", serves the
requests given on the command line (as a browser would), reads sensors whose values change, and
stops once the requests are served or after a few hundred sleeps. Pin and I2C numbers are checked
against the Pico's real pin map, and the drivers' readings come back as the real drivers return
them (text such as "23.45C"), so mistakes in the lesson code show up as errors here.

Usage: python micropython-fake-pico.py '["/", "/?led=on"]' < main.py
Prints one JSON object: outcome ("stopped", "finished", "exited" or "error"), error, printed,
responses (path, text, closed), pins (values written per GPIO) and display (OLED text).
"""

import builtins
import json
import sys
import traceback
import types

REAL_STDOUT = sys.stdout
REQUESTS = json.loads(sys.argv[1]) if len(sys.argv) > 1 else ["/"]
MAX_SLEEPS = 400


class ProgramStopped(BaseException):
    """Raised by the fakes once the program has run long enough (not an Exception: `except` won't catch it)."""


state = {
    "now": 0.0,
    "sleeps": 0,
    "printed": [],
    "responses": [],
    "pins": {},
    "display": [],
    "irq": [],
}


def advance(seconds):
    state["now"] += max(0.0, float(seconds))
    state["sleeps"] += 1
    # A sensor's interrupt fires now and then, as a real one would.
    if state["sleeps"] % 7 == 0:
        for pin, handler in list(state["irq"]):
            handler(pin)
    if state["sleeps"] > MAX_SLEEPS:
        raise ProgramStopped("ran for %d sleeps" % MAX_SLEEPS)


def module(name, **members):
    mod = types.ModuleType(name)
    for key, value in members.items():
        setattr(mod, key, value)
    sys.modules[name] = mod
    return mod


# --- print --------------------------------------------------------------------------------------

_print = builtins.print


def fake_print(*args, sep=" ", end="\n", file=None):
    if file is not None and file is not sys.stdout:
        return _print(*args, sep=sep, end=end, file=file)
    state["printed"].append(sep.join(str(arg) for arg in args) + end)


builtins.print = fake_print

# --- time ---------------------------------------------------------------------------------------

BASE = (2026, 11, 26, 9, 0, 0)  # the fake clock starts at 09:00:00


def localtime(secs=None):
    total = int(state["now"] if secs is None else secs)
    year, month, day, hour, minute, second = BASE
    second += total
    minute += second // 60
    second %= 60
    hour += minute // 60
    minute %= 60
    day += hour // 24
    hour %= 24
    return (year, month, day, hour, minute, second, 3, 330)


module(
    "time",
    sleep=lambda s: advance(s),
    sleep_ms=lambda ms: advance(ms / 1000),
    sleep_us=lambda us: advance(us / 1000000),
    time=lambda: int(state["now"]),
    time_ns=lambda: int(state["now"] * 1e9),
    ticks_ms=lambda: int(state["now"] * 1000),
    ticks_us=lambda: int(state["now"] * 1000000),
    ticks_diff=lambda a, b: a - b,
    ticks_add=lambda a, b: a + b,
    localtime=localtime,
    gmtime=localtime,
    mktime=lambda t: 0,
)
sys.modules["utime"] = sys.modules["time"]

# --- network ------------------------------------------------------------------------------------


class WLAN:
    def __init__(self, interface=0):
        self._checks = 0
        self._active = False

    def active(self, *value):
        if value:
            self._active = bool(value[0])
        return self._active

    def connect(self, ssid=None, password=None, **kwargs):
        if not isinstance(ssid, str) or not ssid:
            raise TypeError("WLAN.connect needs the Wi-Fi name as text")

    def isconnected(self):
        self._checks += 1
        return self._checks > 1

    def status(self, *args):
        return 3 if self._checks > 1 else 1

    def ifconfig(self, *args):
        return ("192.168.1.42", "255.255.255.0", "192.168.1.1", "192.168.1.1")

    def scan(self):
        return [(b"ClassroomWiFi", b"\x00" * 6, 6, -50, 3, False)]

    def config(self, *args, **kwargs):
        return "28:cd:c1:00:00:01" if args else None

    def disconnect(self):
        pass


module(
    "network",
    WLAN=WLAN,
    STA_IF=0,
    AP_IF=1,
    STAT_IDLE=0,
    STAT_CONNECTING=1,
    STAT_GOT_IP=3,
    STAT_CONNECT_FAIL=-1,
    STAT_NO_AP_FOUND=-2,
    STAT_WRONG_PASSWORD=-3,
    hostname=lambda *args: "PicoW",
    country=lambda *args: "GH",
)

# --- socket -------------------------------------------------------------------------------------


class FakeConnection:
    def __init__(self, path):
        self.path = path
        self.sent = []
        self.closed = False
        state["responses"].append(self)

    def recv(self, size=1024):
        return ("GET %s HTTP/1.1\r\nHost: 192.168.1.42\r\nAccept: text/html\r\n\r\n" % self.path).encode()

    def send(self, data):
        if not isinstance(data, (str, bytes, bytearray)):
            raise TypeError("socket.send needs text or bytes, not %s" % type(data).__name__)
        self.sent.append(data.decode() if isinstance(data, (bytes, bytearray)) else data)
        return len(data)

    sendall = send
    write = send

    def close(self):
        self.closed = True

    def settimeout(self, value):
        pass

    def setblocking(self, flag):
        pass


class FakeSocket:
    def __init__(self, *args):
        self.queue = list(REQUESTS)
        self.bound = None

    def setsockopt(self, *args):
        pass

    def bind(self, address):
        if not (isinstance(address, tuple) and len(address) == 2):
            raise TypeError("bind needs (address, port)")
        self.bound = address

    def listen(self, backlog=5):
        if self.bound is None:
            raise OSError("listen before bind")

    def accept(self):
        if not self.queue:
            raise ProgramStopped("all requests served")
        advance(0)
        # Between two page loads the sensors' interrupts fire, as a person would wave or press.
        for pin, handler in list(state["irq"]):
            handler(pin)
        return FakeConnection(self.queue.pop(0)), ("192.168.1.50", 50000)

    def settimeout(self, value):
        pass

    def setblocking(self, flag):
        pass

    def close(self):
        pass


module(
    "socket",
    socket=FakeSocket,
    getaddrinfo=lambda host, port, *args: [(2, 1, 0, "", ("0.0.0.0", port))],
    AF_INET=2,
    SOCK_STREAM=1,
    SOL_SOCKET=1,
    SO_REUSEADDR=4,
)
sys.modules["usocket"] = sys.modules["socket"]

# --- machine ------------------------------------------------------------------------------------

ADC_PINS = {26, 27, 28}
I2C_PINS = {
    0: ({0, 4, 8, 12, 16, 20}, {1, 5, 9, 13, 17, 21}),
    1: ({2, 6, 10, 14, 18, 26}, {3, 7, 11, 15, 19, 27}),
}


def gpio_number(pin):
    number = pin.id if isinstance(pin, Pin) else pin
    if number == "LED":
        return number
    if not isinstance(number, int) or not 0 <= number <= 29:
        raise ValueError("invalid pin %r" % (number,))
    return number


class Pin:
    IN = 0
    OUT = 1
    OPEN_DRAIN = 2
    PULL_UP = 1
    PULL_DOWN = 2
    IRQ_RISING = 4
    IRQ_FALLING = 8

    def __init__(self, id, mode=-1, pull=-1, value=None):
        self.id = id
        gpio_number(self)
        self.mode = mode
        self._value = 0 if value is None else (1 if value else 0)
        self._reads = 0

    def init(self, mode=-1, pull=-1, value=None):
        if mode != -1:
            self.mode = mode

    def value(self, new=None):
        if new is None:
            if self.mode == Pin.OUT:
                return self._value
            # Inputs change: 0, 0, 0, 1, 1, 1, 0, ...
            self._reads += 1
            return (self._reads // 3) % 2
        self._value = 1 if new else 0
        state["pins"].setdefault(str(self.id), []).append(self._value)
        return None

    __call__ = value

    def on(self):
        self.value(1)

    def off(self):
        self.value(0)

    high = on
    low = off

    def toggle(self):
        self.value(0 if self._value else 1)

    def irq(self, handler=None, trigger=None, **kwargs):
        if handler is not None:
            state["irq"].append((self, handler))


class ADC:
    CORE_TEMP = 4
    READINGS = [5000, 30000, 61000, 45000, 15000, 52000]

    def __init__(self, pin):
        number = pin if isinstance(pin, int) else gpio_number(pin)
        if number not in ADC_PINS and number != ADC.CORE_TEMP:
            raise ValueError("GPIO %s cannot read analog values: use GPIO 26, 27 or 28" % number)
        self._reads = 0

    def read_u16(self):
        value = ADC.READINGS[self._reads % len(ADC.READINGS)]
        self._reads += 1
        return value


class PWM:
    def __init__(self, pin, freq=None, duty_u16=None, **kwargs):
        self.pin = pin
        self._freq = freq or 1000
        self._duty = duty_u16 or 0

    def freq(self, value=None):
        if value is None:
            return self._freq
        if not isinstance(value, int) or not 8 <= value <= 62500000:
            raise ValueError("freq out of range: %r" % (value,))
        self._freq = value

    def duty_u16(self, value=None):
        if value is None:
            return self._duty
        if not isinstance(value, int) or not 0 <= value <= 65535:
            raise ValueError("duty_u16 must be a whole number from 0 to 65535, got %r" % (value,))
        self._duty = value
        state["pins"].setdefault("pwm%s" % gpio_number(self.pin), []).append(value)

    def duty_ns(self, value=None):
        return 0

    def deinit(self):
        pass


class I2C:
    def __init__(self, id, scl=None, sda=None, freq=400000, **kwargs):
        if id not in I2C_PINS:
            raise ValueError("bad I2C bus %r" % (id,))
        sda_ok, scl_ok = I2C_PINS[id]
        if sda is not None and gpio_number(sda) not in sda_ok:
            raise ValueError("bad SDA pin for I2C%d" % id)
        if scl is not None and gpio_number(scl) not in scl_ok:
            raise ValueError("bad SCL pin for I2C%d" % id)

    def scan(self):
        return [0x3C, 0x76]


class Timer:
    ONE_SHOT = 0
    PERIODIC = 1

    def __init__(self, *args, **kwargs):
        if "callback" in kwargs:
            self.init(**kwargs)

    def init(self, mode=1, period=-1, freq=-1, callback=None, **kwargs):
        if callback is not None:
            state["irq"].append((self, callback))

    def deinit(self):
        pass


class RTC:
    def datetime(self, value=None):
        t = localtime()
        return (t[0], t[1], t[2], 0, t[3], t[4], t[5], 0)


def reset():
    raise ProgramStopped("machine.reset()")


module(
    "machine",
    Pin=Pin,
    ADC=ADC,
    PWM=PWM,
    I2C=I2C,
    SoftI2C=I2C,
    Timer=Timer,
    RTC=RTC,
    reset=reset,
    soft_reset=reset,
    freq=lambda *args: 150000000,
    unique_id=lambda: b"\x01\x02\x03\x04\x05\x06\x07\x08",
    idle=lambda: advance(0.001),
    lightsleep=lambda ms=0: advance(ms / 1000),
    deepsleep=lambda ms=0: reset(),
)

# --- kit drivers ----------------------------------------------------------------------------------


class BME280:
    """Returns readings as the kit's BME280.py does: text with the unit on the end."""

    SAMPLES = [(2345, 46315), (3120, 73830), (1805, 25600)]

    def __init__(self, mode=1, address=0x76, i2c=None, **kwargs):
        if i2c is None:
            raise ValueError("BME280 needs i2c=...")
        self._reads = 0

    def _sample(self):
        sample = BME280.SAMPLES[self._reads % len(BME280.SAMPLES)]
        self._reads += 1
        return sample

    def read_temperature(self):
        return self._sample()[0]

    def read_humidity(self):
        return self._sample()[1]

    def read_pressure(self):
        return 101325 * 256

    @property
    def temperature(self):
        t = self.read_temperature()
        return "{}.{:02d}C".format(t // 100, t % 100)

    @property
    def humidity(self):
        h = self.read_humidity()
        return "{}.{:02d}%".format(h // 1024, h * 100 // 1024 - (h // 1024) * 100)

    @property
    def pressure(self):
        return "1013.25hPa"


module("BME280", BME280=BME280, BME280_I2CADDR=0x76)


class SH1106_I2C:
    def __init__(self, width, height, i2c, res=None, addr=0x3C, rotate=0, external_vcc=False, delay=0):
        self.width = width
        self.height = height

    def text(self, string, x, y, color=1):
        if not isinstance(string, str):
            raise TypeError("display.text needs text, not %s" % type(string).__name__)
        state["display"].append(string)

    def _noop(self, *args, **kwargs):
        pass

    fill = show = pixel = hline = vline = line = rect = fill_rect = scroll = blit = _noop
    contrast = invert = rotate = poweron = poweroff = sleep = flip = init_display = _noop


module("sh1106", SH1106_I2C=SH1106_I2C)

# --- other MicroPython modules ------------------------------------------------------------------


class Response:
    status_code = 200
    text = "{}"
    content = b"{}"

    def json(self):
        return {}

    def close(self):
        pass


module("ntptime", settime=lambda: None, time=lambda: 0, host="pool.ntp.org")
module("urequests", get=lambda *a, **k: Response(), post=lambda *a, **k: Response())
sys.modules["requests"] = sys.modules["urequests"]
module("micropython", const=lambda value: value, schedule=lambda func, arg: func(arg), alloc_emergency_exception_buf=lambda size: None)

import gc as _gc  # noqa: E402

module("gc", collect=_gc.collect, mem_free=lambda: 200000, mem_alloc=lambda: 50000, enable=lambda: None, disable=lambda: None)

import json as _json  # noqa: E402
import os as _os  # noqa: E402

sys.modules["ujson"] = _json
sys.modules["uos"] = _os

# --- run ----------------------------------------------------------------------------------------

code = sys.stdin.buffer.read().decode("utf-8")
result = {"outcome": "finished", "error": None}
try:
    exec(compile(code, "main.py", "exec"), {"__name__": "__main__"})
except ProgramStopped as stop:
    result["outcome"] = "stopped"
    result["reason"] = str(stop)
except SystemExit:
    result["outcome"] = "exited"
except BaseException:  # noqa: BLE001 - every other error is a finding
    result["outcome"] = "error"
    lines = traceback.format_exc().strip().splitlines()
    program_lines = [line.strip() for line in lines if 'File "main.py"' in line]
    result["error"] = (program_lines[-1] + ": " if program_lines else "") + lines[-1]

result["printed"] = "".join(state["printed"])
result["responses"] = [
    {"path": conn.path, "text": "".join(conn.sent), "closed": conn.closed} for conn in state["responses"]
]
result["pins"] = state["pins"]
result["display"] = state["display"]
REAL_STDOUT.write(json.dumps(result))
