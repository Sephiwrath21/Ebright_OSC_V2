"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      refetchInterval={0}
      refetchOnWindowFocus={false}
    >
      {/* attribute="class" matches the CRM providers, so both subtrees toggle
          the same `.dark` class that globals.css's @custom-variant keys off.
          defaultTheme="light" because dark coverage is being rolled out
          progressively — users opt in. enableSystem is off for the same
          reason: following the OS would flip people into a partially-themed
          app without them asking. */}
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
        disableTransitionOnChange
      >
        {children}
      </ThemeProvider>
    </SessionProvider>
  );
}
