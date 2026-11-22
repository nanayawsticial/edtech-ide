import { notFound } from 'next/navigation';
import { CourseTrackView } from '@/components/courses/CourseTrackView';
import { getCourseCatalog, getCourseTrack } from '@/lib/courses/catalog';

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return getCourseCatalog().map((track) => ({ track: track.slug }));
}

export default async function CourseTrackPage({ params }: { params: Promise<{ track: string }> }) {
  const { track } = await params;
  const courseTrack = getCourseTrack(track);

  if (!courseTrack) {
    notFound();
  }

  return <CourseTrackView track={courseTrack} />;
}
