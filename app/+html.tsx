import { ScrollViewStyleReset } from 'expo-router/html';
import React, { type PropsWithChildren } from 'react';

const APP_URL = process.env.EXPO_PUBLIC_APP_URL ?? 'https://cinelink.example.com';
const DESCRIPTION = 'Connect actors and directors through shared movie credits.';
const OG_IMAGE = `${APP_URL}/assets/og-image.png`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#020617" />
        <meta name="description" content={DESCRIPTION} />
        <title>CineLink</title>

        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="CineLink" />
        <meta property="og:title" content="CineLink" />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:url" content={APP_URL} />
        <meta property="og:image" content={OG_IMAGE} />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="CineLink" />
        <meta name="twitter:description" content={DESCRIPTION} />
        <meta name="twitter:image" content={OG_IMAGE} />

        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: 'html, body, #root { height: 100%; margin: 0; background-color: #020617; }' }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
