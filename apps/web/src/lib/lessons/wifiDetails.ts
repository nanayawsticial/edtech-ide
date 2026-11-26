// Wi-Fi lessons paste a whole new program into main.py, which would wipe the Wi-Fi name and
// password the learner typed in the activity before. When they copy lesson code, the details
// already in main.py are put into the copy instead of the placeholders.

const PLACEHOLDERS = {
  SSID: 'YOUR_WIFI_NAME',
  PASSWORD: 'YOUR_PASSWORD',
} as const;

/** A line such as `SSID = "MyWiFi"`: group 1 is everything before the string, group 2 the string with its quotes. */
const assignment = (name: string) => new RegExp(String.raw`^([ \t]*${name}[ \t]*=[ \t]*)("[^"\n]*"|'[^'\n]*')`, 'm');

export interface CarriedCode {
  code: string;
  /** True when at least one of the learner's details went into the code. */
  carried: boolean;
}

export function carryOverWifiDetails(lessonCode: string, currentCode: string): CarriedCode {
  let code = lessonCode;
  let carried = false;

  for (const [name, placeholder] of Object.entries(PLACEHOLDERS)) {
    const pattern = assignment(name);
    const target = code.match(pattern);
    const mine = currentCode.match(pattern);
    if (!target || !mine || target[2].slice(1, -1) !== placeholder) {
      continue;
    }

    const value = mine[2].slice(1, -1);
    // Not filled in yet. An empty password is kept: open networks have none.
    if (value === placeholder || (name === 'SSID' && value.trim() === '')) {
      continue;
    }

    // A function, so "$" in a password is not read as a replacement pattern.
    code = code.replace(pattern, (_match, prefix: string) => `${prefix}${mine[2]}`);
    carried = true;
  }

  return { code, carried };
}
