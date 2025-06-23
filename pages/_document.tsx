import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html>
      <Head>
        {/* Matomo Tracking Code */}
        <script dangerouslySetInnerHTML={{
          __html: `
            var _paq = window._paq = window._paq || [];
            _paq.push(["setCookieDomain", "*.suunto-mcp.vercel.ai"]);
            _paq.push(['trackPageView']);
            _paq.push(['enableLinkTracking']);
            (function() {
              var u="https://track.visin.ch/";
              _paq.push(['setTrackerUrl', u+'m.php']);
              _paq.push(['setSiteId', '14']);
              var d=document, g=d.createElement('script'), s=d.getElementsByTagName('script')[0];
              g.async=true; g.src=u+'m.js'; s.parentNode.insertBefore(g,s);
            })();
          `
        }} />
        <noscript>
          <p>
            <img referrerPolicy="no-referrer-when-downgrade" src="https://track.visin.ch/matomo.php?idsite=14&amp;rec=1" style={{border:0}} alt="" />
          </p>
        </noscript>
        {/* End Matomo Tracking Code */}
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
