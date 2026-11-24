import type { Lesson } from './types';
import { ledLesson } from './content/led';
import { pushButtonLesson } from './content/pushButton';
import { servoLesson } from './content/servo';
import { ultrasonicLesson } from './content/ultrasonic';

export type { Lesson, LessonActivity, LessonStep, StepCheck } from './types';

/** In-app lessons by course catalog slug. Lessons without an entry open a plain workspace. */
export const LESSONS: Record<string, Lesson> = Object.fromEntries(
  [ledLesson, pushButtonLesson, servoLesson, ultrasonicLesson].map((lesson) => [lesson.slug, lesson])
);

export function getLesson(slug: string | null | undefined): Lesson | null {
  return (slug && LESSONS[slug]) || null;
}
