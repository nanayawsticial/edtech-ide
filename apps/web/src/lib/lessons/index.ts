import type { Lesson } from './types';
import { wifiBuzzerLesson, wifiLedLesson, wifiRelayLesson } from './content/aider';
import {
  humidityMonitorLesson,
  lightLoggerLesson,
  motionAlertLesson,
  rainStatusLesson,
  soilMoistureLesson,
  temperatureMonitorLesson,
  waterLevelLesson,
  wifiDoorbellLesson,
} from './content/aiderSensors';
import {
  buttonLoggerLesson,
  environmentLoggerLesson,
  irrigationLesson,
  ledBrightnessLesson,
  motorControlLesson,
  oledDashboardLesson,
  timerSwitchLesson,
} from './content/aiderControl';
import {
  alarmClockLesson,
  colorControlLesson,
  motionCounterLesson,
  plantStatusLesson,
  rainAlertLesson,
  relaySchedulerLesson,
  safetyAlertLesson,
  smartLightLesson,
  soilDrynessLesson,
  temperatureAlertLesson,
  touchSwitchLesson,
  waterPumpLesson,
} from './content/aiderAutomation';
import { buzzerLesson } from './content/buzzer';
import { ledLesson } from './content/led';
import { pushButtonLesson } from './content/pushButton';
import { rgbLesson } from './content/rgb';
import { ldrLesson, soundSensorLesson } from './content/sensors';
import { servoLesson } from './content/servo';
import { trafficLightLesson } from './content/trafficLight';
import { ultrasonicLesson } from './content/ultrasonic';

export type { Lesson, LessonActivity, LessonStep, StepCheck } from './types';

/** In-app lessons by course catalog slug. Lessons without an entry open a plain workspace. */
export const LESSONS: Record<string, Lesson> = Object.fromEntries(
  [
    ledLesson,
    buzzerLesson,
    pushButtonLesson,
    trafficLightLesson,
    rgbLesson,
    ldrLesson,
    servoLesson,
    ultrasonicLesson,
    soundSensorLesson,
    wifiLedLesson,
    wifiBuzzerLesson,
    wifiRelayLesson,
    temperatureMonitorLesson,
    humidityMonitorLesson,
    lightLoggerLesson,
    motionAlertLesson,
    waterLevelLesson,
    soilMoistureLesson,
    rainStatusLesson,
    wifiDoorbellLesson,
    oledDashboardLesson,
    motorControlLesson,
    buttonLoggerLesson,
    ledBrightnessLesson,
    timerSwitchLesson,
    irrigationLesson,
    environmentLoggerLesson,
    smartLightLesson,
    relaySchedulerLesson,
    alarmClockLesson,
    motionCounterLesson,
    soilDrynessLesson,
    colorControlLesson,
    touchSwitchLesson,
    waterPumpLesson,
    rainAlertLesson,
    safetyAlertLesson,
    plantStatusLesson,
    temperatureAlertLesson,
  ].map((lesson) => [lesson.slug, lesson])
);

export function getLesson(slug: string | null | undefined): Lesson | null {
  return (slug && LESSONS[slug]) || null;
}
