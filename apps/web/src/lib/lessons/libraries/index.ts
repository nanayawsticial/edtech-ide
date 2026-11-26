import { BME280_PY } from './bme280';
import { SH1106_PY } from './sh1106';

/**
 * MicroPython drivers from the AIDER kit that lessons add to the learner's project. Upload saves
 * every .py file in the project on the board, so the driver ends up next to main.py, where
 * `import BME280` finds it.
 */
export interface MicroPythonLibrary {
  /** The file name on the board; also what the program imports (without .py). */
  fileName: string;
  /** What it drives, for the learner. */
  description: string;
  content: string;
}

export const MICROPYTHON_LIBRARIES = {
  BME280: { fileName: 'BME280.py', description: 'the BME280 temperature and humidity sensor', content: BME280_PY },
  SH1106: { fileName: 'sh1106.py', description: 'the SH1106 OLED screen', content: SH1106_PY },
} satisfies Record<string, MicroPythonLibrary>;

export type MicroPythonLibraryId = keyof typeof MICROPYTHON_LIBRARIES;

/** Driver files are not the learner's code: lesson code checks leave them out. */
export const LIBRARY_FILE_NAMES: ReadonlySet<string> = new Set(
  Object.values(MICROPYTHON_LIBRARIES).map((library) => library.fileName)
);
