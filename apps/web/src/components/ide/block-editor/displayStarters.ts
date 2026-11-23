import type { BoardKey } from '@/contexts/BoardContext';
import { isBlockSupportedForBoard } from '@/lib/blockly/blockSupport';
import { getOledInstances } from '@/lib/blockly/dropdowns';

export type DisplayStarter = {
  id: string;
  label: string;
  description: string;
  requiresBlock?: string;
  /** Blockly XML for the starter program, placed at (x, y) on the canvas. */
  buildXml: (x: number, y: number) => string;
};

const escapeXmlValue = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const numberShadow = (name: string, value: number) =>
  `<value name="${name}"><shadow type="math_number"><field name="NUM">${value}</field></shadow></value>`;
const textShadow = (name: string, value: string) =>
  `<value name="${name}"><shadow type="text"><field name="TEXT">${escapeXmlValue(value)}</field></shadow></value>`;

/** Ready-made "set up the screen and print something" programs for the displays this board supports. */
export function getDisplayStarters(board: BoardKey): DisplayStarter[] {
  const oledInstance = getOledInstances().find(([, value]) => value && value !== 'NONE')?.[1] ?? 'NONE';

  const starters: DisplayStarter[] = [
    {
      id: 'oled',
      label: 'OLED starter',
      description: oledInstance === 'NONE' ? 'Initialize, clear, and print a greeting.' : 'Start with the first mapped OLED in your circuit.',
      buildXml: (x, y) => `
          <xml xmlns="https://developers.google.com/blockly/xml">
            <block type="arduino_on_start" x="${x}" y="${y}">
              <statement name="SETUP">
                <block type="oled_init">
                  <field name="SENSOR">${escapeXmlValue(oledInstance)}</field>
                  <field name="WIDTH">128</field>
                  <field name="HEIGHT">64</field>
                  <next>
                    <block type="oled_clear">
                      <field name="SENSOR">${escapeXmlValue(oledInstance)}</field>
                      <next>
                        <block type="oled_print">
                          <field name="SENSOR">${escapeXmlValue(oledInstance)}</field>
                          ${textShadow('TEXT', 'Hello!')}
                          ${numberShadow('X', 0)}
                          ${numberShadow('Y', 0)}
                        </block>
                      </next>
                    </block>
                  </next>
                </block>
              </statement>
            </block>
          </xml>
        `,
    },
    {
      id: 'lcd',
      label: 'LCD starter',
      description: 'Create a 16x2 LCD setup and print a short status line.',
      buildXml: (x, y) => `
          <xml xmlns="https://developers.google.com/blockly/xml">
            <block type="arduino_on_start" x="${x}" y="${y}">
              <statement name="SETUP">
                <block type="lcd_i2c_init">
                  <field name="ADDRESS">0x27</field>
                  <field name="COLS">16</field>
                  <field name="ROWS">2</field>
                  <next>
                    <block type="lcd_i2c_print">
                      ${textShadow('TEXT', 'System ready')}
                      ${numberShadow('COL', 0)}
                      ${numberShadow('ROW', 0)}
                    </block>
                  </next>
                </block>
              </statement>
            </block>
          </xml>
        `,
    },
    {
      id: 'tft',
      label: 'TFT starter',
      description: 'Initialize the TFT, set a background, and print a title.',
      requiresBlock: 'arduino_tft_init',
      buildXml: (x, y) => `
          <xml xmlns="https://developers.google.com/blockly/xml">
            <block type="arduino_on_start" x="${x}" y="${y}">
              <statement name="SETUP">
                <block type="arduino_tft_init">
                  <next>
                    <block type="arduino_tft_clear">
                      <field name="COLOR">TFT_BLACK</field>
                      <next>
                        <block type="arduino_tft_print">
                          ${textShadow('TEXT', 'Display ready')}
                          ${numberShadow('X', 18)}
                          ${numberShadow('Y', 24)}
                          <field name="SIZE">2</field>
                          <field name="COLOR">TFT_WHITE</field>
                        </block>
                      </next>
                    </block>
                  </next>
                </block>
              </statement>
            </block>
          </xml>
        `,
    },
  ];

  return starters.filter((starter) => !starter.requiresBlock || isBlockSupportedForBoard(starter.requiresBlock, board));
}
