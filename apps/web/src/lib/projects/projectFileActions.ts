"use client";

import type { FileItem } from '@/stores/editorStore';
import type { ProjectMeta } from '@/lib/projects/projectMeta';
import { buildProjectFile, projectFileName, PROJECT_FILE_EXTENSION } from '@/lib/projects/projectFile';

/** Saves a project as a .sticial file through the browser's normal download. */
export function downloadProjectFile(name: string, meta: Omit<ProjectMeta, 'version'>, files: FileItem[]) {
  const blob = new Blob([buildProjectFile(name, meta, files)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = projectFileName(name);
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before the address goes away.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return link.download;
}

/** Asks the learner for a .sticial file and resolves to its text, or null if they cancel. */
export function pickProjectFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `${PROJECT_FILE_EXTENSION},application/json,.json`;
    input.style.display = 'none';
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return finish(null);
      file.text().then(finish, () => finish(null));
    });
    input.addEventListener('cancel', () => finish(null));
    document.body.append(input);
    input.click();
  });
}
