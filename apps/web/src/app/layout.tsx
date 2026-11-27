import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import './globals.css';
import SupabaseAuthHashBridge from '@/components/auth/SupabaseAuthHashBridge';
import { DesktopRuntime } from '@/components/desktop/DesktopRuntime';
import { BoardProvider } from '@/contexts/BoardContext';
import { ProjectProvider } from '@/contexts/ProjectContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { StudioPreferencesProvider } from '@/contexts/StudioPreferencesContext';
import { CircuitProvider } from '@/contexts/CircuitContext';
import { DEFAULT_THEME, THEME_INIT_SCRIPT } from '@/lib/theme/themeModes';

const editorMono = localFont({
  src: './fonts/GeistMonoLatin.woff2',
  variable: '--font-editor-mono',
  display: 'swap',
  fallback: ['Fira Code', 'Cascadia Code', 'Consolas', 'monospace'],
});

export const metadata: Metadata = {
  title: 'Sticial Studio',
  description: 'Educational block and text coding platform for hardware projects',
};

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#09111f',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" data-theme={DEFAULT_THEME} suppressHydrationWarning>
      <head>
        {/* Sets data-theme from the saved preference before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={`${editorMono.variable} antialiased`}>
        <DesktopRuntime />
        <SupabaseAuthHashBridge />
        <ThemeProvider>
          <StudioPreferencesProvider>
            <AuthProvider>
              <BoardProvider>
                <ProjectProvider>
                  <CircuitProvider>{children}</CircuitProvider>
                </ProjectProvider>
              </BoardProvider>
            </AuthProvider>
          </StudioPreferencesProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
