import React, { useState, useCallback, useEffect, useRef } from 'react';
import './InstallScreen.css';

const LANDING_URL = 'https://wakelab.co/';

/** Base URL for install-guide screenshots (stored in apps/pwa/public/install-guide/). */
function getInstallGuideImage(filename) {
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/app')) {
    return `/app/install-guide/${filename}`;
  }
  return `/install-guide/${filename}`;
}

const ChevronLeftIcon = ({ size = 20, color = '#ffffff' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="m15 19-7-7 7-7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Share icon from apps/pwa/assets/share.svg */
const SHARE_PATH_D =
  'M70 45L107.5 7.5M107.5 7.5L145 45M107.5 7.5V132.5M45.0029 95C33.3543 95 27.5301 95 22.9358 96.903C16.8101 99.4404 11.9404 104.31 9.40301 110.436C7.5 115.03 7.5 120.851 7.5 132.5V192.5C7.5 206.501 7.5 213.497 10.2248 218.845C12.6217 223.549 16.4434 227.381 21.1475 229.778C26.49 232.5 33.4874 232.5 47.4614 232.5H167.545C181.519 232.5 188.506 232.5 193.849 229.778C198.553 227.381 202.381 223.549 204.778 218.845C207.5 213.502 207.5 206.513 207.5 192.539V132.5C207.5 120.851 207.499 115.03 205.596 110.436C203.058 104.31 198.193 99.4404 192.067 96.903C187.473 95 181.649 95 170 95';

const ShareIcon = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 215 240"
    width={18}
    height={20}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
  >
    <path
      d={SHARE_PATH_D}
      stroke="#ffffff"
      strokeWidth="15"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Checkmark icon – next to Listo */
const CheckIcon = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    width={18}
    height={18}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
  >
    <path
      d="M5 12l5 5L20 7"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Añadir (plus) icon from apps/pwa/assets/añadir.svg – for step 2 pill */
const AñadirIcon = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 220 220"
    width={20}
    height={20}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
  >
    <path
      d="M177.16 0H42.8398C19.1887 0 0 19.1886 0 42.8398V177.16C0 200.811 19.1887 220 42.8398 220H177.16C200.811 220 220 200.811 220 177.16V42.3935C219.554 19.1886 200.365 0 177.16 0ZM207.505 176.714C207.505 193.671 193.671 207.059 177.16 207.059H42.8398C25.8824 207.059 12.4949 193.225 12.4949 176.714V42.3935C12.4949 25.4361 26.3286 12.0487 42.8398 12.0487H177.16C194.118 12.0487 207.505 25.8824 207.505 42.3935V176.714Z"
      fill="currentColor"
    />
    <path
      d="M116.016 69.6123H103.521V103.527H70.9453V115.576H103.521V149.491H116.016V115.576H148.592V103.527H116.016V69.6123Z"
      fill="currentColor"
    />
  </svg>
);

/** Wake logo – same as landing hero (hero-logo.svg), inline for install screen */
const WakeLogoInline = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 4500 4500"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
  >
    <path
      fill="#FFFFFF"
      d="M929.282471,4035.284912 C949.620544,4004.808350 970.172241,3974.471924 990.250366,3943.825439 C1027.125732,3887.541016 1062.019897,3830.096924 1092.446289,3769.987305 C1113.814819,3727.772461 1131.007324,3683.750977 1150.160156,3640.576660 C1202.237793,3523.182373 1253.780029,3405.528564 1307.664673,3288.962158 C1457.619141,2964.570801 1608.125244,2640.431641 1759.414551,2316.660645 C1901.404541,2012.790039 2044.674927,1709.517822 2187.374268,1405.978638 C2195.300537,1389.118286 2202.901611,1372.099731 2211.110596,1355.379028 C2221.152100,1334.926636 2247.185791,1324.120361 2269.504150,1344.553833 C2274.182129,1348.836670 2277.136475,1355.350220 2279.930176,1361.285278 C2295.517334,1394.401611 2310.804199,1427.659180 2326.206055,1460.862915 C2441.577148,1709.581909 2556.941162,1958.304199 2672.327393,2207.016357 C2762.509277,2401.401123 2852.729736,2595.768066 2942.914307,2790.151611 C3061.946777,3046.714111 3181.087646,3303.226074 3299.890381,3559.895020 C3328.421143,3621.534912 3357.641846,3682.650146 3392.812256,3740.975098 C3476.861084,3880.357666 3576.568115,4007.382812 3690.784668,4123.068359 C3735.147949,4168.001465 3786.238525,4203.744141 3844.239746,4229.507324 C3909.850098,4258.649902 3977.775879,4278.515625 4049.479004,4285.199219 C4082.132080,4288.243164 4114.608398,4288.995117 4147.097656,4284.145508 C4163.661133,4281.673828 4179.630859,4277.332031 4194.293457,4268.919434 C4210.943359,4259.367188 4221.761230,4245.267090 4223.656738,4226.187988 C4224.824219,4214.434570 4224.045410,4202.140625 4221.907227,4190.499023 C4219.518555,4177.495605 4215.008789,4164.816406 4210.708008,4152.240723 C4197.526855,4113.697266 4178.207520,4077.878174 4160.713379,4041.262207 C4116.246582,3948.191162 4071.601074,3855.205322 4027.015137,3762.190918 C3978.399902,3660.770996 3929.776855,3559.354736 3881.146973,3457.941895 C3828.200439,3347.528320 3775.225342,3237.128418 3722.293213,3126.707764 C3665.333984,3007.886230 3608.433350,2889.037109 3551.464355,2770.220459 C3507.156006,2677.809570 3462.768555,2585.436768 3418.440674,2493.035400 C3372.960693,2398.231201 3327.521484,2303.407715 3282.042480,2208.602783 C3237.713135,2116.193848 3193.319092,2023.815918 3149.021240,1931.391602 C3096.096924,1820.967651 3043.291992,1710.486328 2990.347412,1600.071899 C2942.004883,1499.255615 2893.489258,1398.522827 2845.151367,1297.704346 C2792.211670,1187.286865 2739.440674,1076.788330 2686.498291,966.372192 C2638.157471,865.553406 2589.616455,764.830750 2541.292725,664.003906 C2496.127930,569.767883 2452.317871,474.861328 2403.737549,382.308960 C2386.112061,348.730743 2366.745605,316.059998 2347.894043,283.135223 C2340.220215,269.733002 2329.922119,258.290070 2318.429443,248.047119 C2300.895752,232.420013 2280.562256,223.830048 2256.731934,223.575897 C2226.486084,223.253326 2200.929443,234.044159 2178.993164,254.472107 C2159.194580,272.909393 2145.421143,295.747192 2131.870605,318.699158 C2099.350342,373.782257 2070.507812,430.830688 2042.821289,488.438751 C2001.308838,574.814392 1960.427368,661.493286 1919.295166,748.051575 C1846.174438,901.926453 1773.023315,1055.786987 1699.965454,1209.691528 C1619.773560,1378.624756 1539.713501,1547.620361 1459.520996,1716.553101 C1376.474609,1891.497559 1293.311157,2066.386475 1210.250366,2241.323730 C1134.040894,2401.831299 1057.903442,2562.373291 981.727112,2722.896484 C875.305054,2947.155518 768.926453,3171.434814 662.436218,3395.661377 C554.233704,3623.493408 445.930786,3851.277832 337.637970,4079.067139 C322.484253,4110.941895 307.790527,4142.981934 298.214264,4177.099609 C294.235870,4191.272949 291.143250,4205.519043 292.312592,4220.398438 C294.057892,4242.605957 304.161346,4259.742676 323.589996,4270.740723 C330.471344,4274.635254 338.022400,4277.636230 345.601990,4279.950195 C363.545837,4285.429688 382.098511,4287.544434 400.808044,4287.633301 C468.972626,4287.957031 536.537720,4281.605957 603.078857,4266.784668 C629.657837,4260.865234 655.740784,4252.572266 681.836975,4244.659180 C749.429993,4224.162109 803.860107,4183.281738 851.979858,4133.093262 C880.174927,4103.685547 904.396301,4071.018311 929.282471,4035.284912 z"
    />
  </svg>
);

/** Chrome on iOS: share sheet often hides "Add to Home Screen" until user taps "More" / "More options". */
function isChromeOnIOS() {
  if (typeof navigator === 'undefined' || !navigator.userAgent) return false;
  return navigator.userAgent.includes('CriOS');
}

/** Chrome (iOS or desktop). Used to show "Arriba" vs "Abajo" in the first install card. */
function isChrome() {
  if (typeof navigator === 'undefined' || !navigator.userAgent) return false;
  const ua = navigator.userAgent;
  return ua.includes('CriOS') || (ua.includes('Chrome') && !ua.includes('Edg'));
}

/** Google Search app in-app browser (GSA in user agent). Add to Home Screen not available; user must open in Chrome/Safari first. */
function isGoogleApp() {
  if (typeof navigator === 'undefined' || !navigator.userAgent) return false;
  return navigator.userAgent.includes('GSA');
}

function isGoogleAppAndroid() {
  if (!isGoogleApp()) return false;
  const ua = navigator.userAgent;
  return /Android|wv\)/.test(ua);
}

function isGoogleAppIOS() {
  return isGoogleApp() && !isGoogleAppAndroid();
}

/** Android device (not in Google app – used for install flow). */
function isAndroidStandalone() {
  if (typeof navigator === 'undefined' || !navigator.userAgent) return false;
  return /Android/i.test(navigator.userAgent) && !isGoogleApp();
}

/** Safari on iOS (not Chrome, not Google app). */
function isSafariIOS() {
  if (typeof navigator === 'undefined' || !navigator.userAgent) return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) && !ua.includes('CriOS') && !ua.includes('GSA');
}

/** Samsung Internet on Android. */
function isSamsungBrowser() {
  if (typeof navigator === 'undefined' || !navigator.userAgent) return false;
  return /SamsungBrowser|Samsung/i.test(navigator.userAgent);
}

/** Chrome on Android (standalone, not Google app). */
function isChromeAndroid() {
  if (!isAndroidStandalone()) return false;
  const ua = navigator.userAgent;
  return /Chrome/i.test(ua) && !ua.includes('GSA');
}

/** Safari (iOS) – two Paso 1 (abajo = botones + Compartir; arriba = solo Compartir), then Paso 2 and 3 same for both. */
function getIosSafariSteps() {
  return [
    {
      stepNum: 1,
      label: 'Barra de búsqueda abajo',
      text: 'Toca los botones en la barra y luego Compartir en el menú.',
      images: [getInstallGuideImage('IMG_1363.jpg'), getInstallGuideImage('IMG_1364.jpg')],
    },
    {
      stepNum: 1,
      label: 'Barra de búsqueda arriba',
      text: 'Toca Compartir en la barra (solo eso).',
      image: getInstallGuideImage('IMG_1360.jpg'),
    },
    {
      stepNum: 2,
      text: 'Toca "Añadir a pantalla de inicio". Si no la ves, desliza hacia abajo o toca "Editar acciones".',
      image: getInstallGuideImage('IMG_1359.jpg'),
    },
    {
      stepNum: 3,
      text: 'Toca "Añadir".',
      image: getInstallGuideImage('IMG_1361.jpg'),
    },
  ];
}

/** Chrome (iOS) – barra arriba: Compartir → Más → Añadir a pantalla de inicio → Añadir. */
function getIosChromeSteps() {
  return [
    { text: 'Toca el botón Compartir en la barra de búsqueda (arriba).', image: getInstallGuideImage('IMG_1365.jpg') },
    { text: 'En el menú que se abre, toca "Más" o "Más opciones".', image: getInstallGuideImage('IMG_1367.jpg') },
    { text: 'Toca "Añadir a pantalla de inicio".', image: getInstallGuideImage('IMG_1368.jpg') },
    { text: 'Toca "Añadir".', image: getInstallGuideImage('IMG_1361.jpg') },
  ];
}

function getIosGoogleAppSteps() {
  return [
    { text: 'Toca Compartir en la barra.' },
    { text: 'Toca "Abrir en Safari" o "Abrir en Chrome".' },
    { text: 'Cuando se abra la página en el navegador, sigue la guía de Safari o Chrome (barra abajo o arriba).' },
  ];
}

/** Unified Chrome (Android) steps: first step = use in-page button if available; then manual. */
function getAndroidChromeSteps() {
  return [
    {
      text: 'Si en esta página ves el botón "Añadir a inicio", tócalo primero. No descarga nada, solo añade un acceso directo. Si no ves el botón, sigue los pasos siguientes.',
      tryButtonFirst: true,
    },
    {
      text: 'Toca los tres puntos en la barra (arriba o abajo, según tu Chrome).',
      imageMenuArriba: undefined,
      imageMenuAbajo: undefined,
    },
    { text: 'Toca "Instalar aplicación" o "Añadir a la pantalla de inicio".' },
    { text: 'Toca "Instalar" o "Añadir".' },
  ];
}

function getAndroidSamsungSteps() {
  return [
    {
      text: 'Si en esta página ves el botón "Añadir a inicio", tócalo primero. No descarga nada, solo un acceso directo. Si no lo ves, sigue los pasos siguientes.',
      tryButtonFirst: true,
    },
    { text: 'Toca el menú (tres líneas o tres puntos) en la barra.' },
    { text: 'Toca "Añadir página a" o "Add page to".' },
    { text: 'Toca "Pantalla de inicio" o "Home screen".' },
    { text: 'Confirma si aparece el diálogo.' },
  ];
}

function getAndroidGoogleAppSteps() {
  return [
    { text: 'Toca los tres puntos en la barra.' },
    { text: 'Toca "Abrir en Chrome" o "Abrir en el navegador".' },
    { text: 'Cuando se abra en Chrome, sigue la guía de Chrome (menú arriba o abajo).' },
  ];
}

/** All install guide variants: one entry per browser. Barra arriba/abajo covered in steps + optional images. */
const INSTALL_GUIDES = {
  ios: {
    label: 'iPhone / iPad',
    browsers: [
      { id: 'ios_safari', label: 'Safari', steps: getIosSafariSteps() },
      { id: 'ios_chrome', label: 'Chrome', steps: getIosChromeSteps() },
      { id: 'ios_google_app', label: 'App de Google', steps: getIosGoogleAppSteps() },
    ],
  },
  android: {
    label: 'Android',
    browsers: [
      { id: 'android_chrome', label: 'Chrome', steps: getAndroidChromeSteps() },
      { id: 'android_samsung', label: 'Samsung Internet', steps: getAndroidSamsungSteps() },
      { id: 'android_google_app', label: 'App de Google', steps: getAndroidGoogleAppSteps() },
    ],
  },
};

/** Current device is iOS (iPhone/iPad). For OS picker "Actual" badge. */
function isIOSDevice() {
  if (typeof navigator === 'undefined' || !navigator.userAgent) return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Current device is Android. For OS picker "Actual" badge. */
function isAndroidDevice() {
  if (typeof navigator === 'undefined' || !navigator.userAgent) return false;
  return /Android/i.test(navigator.userAgent);
}

/** True if this guide id matches the current device/browser (for "Actual" badge). */
function isGuideCurrent(guideId) {
  if (!guideId) return false;
  if (isGoogleAppIOS() && guideId === 'ios_google_app') return true;
  if (isGoogleAppAndroid() && guideId === 'android_google_app') return true;
  if (isSafariIOS() && guideId === 'ios_safari') return true;
  if (isChromeOnIOS() && guideId === 'ios_chrome') return true;
  if (isChromeAndroid() && guideId === 'android_chrome') return true;
  if (isSamsungBrowser() && guideId === 'android_samsung') return true;
  return false;
}

/** Three-dots (More) menu icon – for Google app Android step */
const MoreVertIcon = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    width={18}
    height={18}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
  >
    <path
      d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"
      fill="currentColor"
    />
  </svg>
);

/** Build URL to open current page in Chrome. iOS: googlechromes:// ; Android: intent with package=com.android.chrome */
function getOpenInChromeUrl() {
  if (typeof window === 'undefined' || !window.location) return null;
  const url = window.location.href;
  const isHttps = url.startsWith('https://');
  const isHttp = url.startsWith('http://');
  if (!isHttps && !isHttp) return null;
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  if (isIOS) {
    const path = url.slice(isHttps ? 8 : 7);
    return (isHttps ? 'googlechromes://' : 'googlechrome://') + path;
  }
  if (/Android/.test(ua)) {
    try {
      const fallback = encodeURIComponent(url);
      const path = url.replace(/^https?:\/\//, '');
      return `intent://${path}#Intent;scheme=${isHttps ? 'https' : 'http'};package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
    } catch (_) {
      return url;
    }
  }
  return null;
}

/**
 * PWA Install screen – shown when user visits the PWA in browser mode (not installed).
 */
export default function InstallScreen() {
  const showChromeIOSMoreStep = isChromeOnIOS();
  const isGoogleAppBrowser = isGoogleApp();
  const googleAppAndroid = isGoogleAppAndroid();
  const googleAppIOS = isGoogleAppIOS();
  const openInChromeUrl = isGoogleAppBrowser ? getOpenInChromeUrl() : null;
  const isAndroid = isAndroidStandalone();

  const [showSafariModal, setShowSafariModal] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installOutcome, setInstallOutcome] = useState(null);
  const deferredPromptRef = useRef(null);
  const [showGuidePicker, setShowGuidePicker] = useState(false);
  const [selectedGuide, setSelectedGuide] = useState(null);
  const [guidePickerOs, setGuidePickerOs] = useState(null);
  const [expandedMainStep, setExpandedMainStep] = useState(null);

  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      setDeferredPrompt(e);
    };
    const onInstalled = () => {
      setInstallOutcome('accepted');
      deferredPromptRef.current = null;
      setDeferredPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleAndroidInstall = useCallback(async () => {
    const e = deferredPromptRef.current || deferredPrompt;
    if (!e || typeof e.prompt !== 'function') return;
    e.prompt();
    try {
      const { outcome } = await e.userChoice;
      setDeferredPrompt(null);
      deferredPromptRef.current = null;
      if (outcome === 'accepted') setInstallOutcome('accepted');
    } catch (_) {
      setDeferredPrompt(null);
      deferredPromptRef.current = null;
    }
  }, [deferredPrompt]);

  const handleOpenInSafari = useCallback(() => {
    const url = typeof window !== 'undefined' && window.location ? window.location.href : '';
    if (!url) return;
    const copy = () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(url);
      }
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(ta);
      }
      return Promise.resolve();
    };
    copy().then(() => setShowSafariModal(true)).catch(() => setShowSafariModal(true));
  }, []);

  return (
    <div className="install-screen">
      <a
        href={LANDING_URL}
        className="install-back-link"
        aria-label="Ahora no, ir al landing"
      >
        <span className="install-back-icon" aria-hidden="true">
          <ChevronLeftIcon size={18} color="#ffffff" />
        </span>
        <span className="install-back-text">Ahora no</span>
      </a>
      <div className="install-hero-heading">
        <h1 className="install-hero-title">
          <span className="install-hero-title-inner">
            Para usar la <span className="install-hero-title-bold">app</span>
          </span>
          <WakeLogoInline className="install-hero-logo" />
        </h1>
        {isGoogleAppBrowser ? (
          <div className="install-steps install-steps-google">
            <p className="install-google-intro">
              Estás en la <strong>app de Google</strong>. Para añadir Wake a la pantalla de inicio, ábrela primero en Chrome o Safari.
            </p>
            <div className="install-open-buttons">
              {openInChromeUrl && (
                <a
                  href={openInChromeUrl}
                  className="install-open-btn install-open-btn-chrome"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Abrir en Chrome
                </a>
              )}
              {googleAppIOS && (
                <button
                  type="button"
                  className="install-open-btn install-open-btn-safari"
                  onClick={handleOpenInSafari}
                >
                  Abrir en Safari
                </button>
              )}
            </div>
          </div>
        ) : isAndroid ? (
          <div className="install-steps install-steps-android">
            {installOutcome === 'accepted' ? (
              <div className="install-android-done">
                <CheckIcon className="install-android-done-icon" />
                <p className="install-android-done-title">Listo</p>
                <p className="install-android-done-text">Abre Wake desde el icono en tu pantalla de inicio.</p>
              </div>
            ) : deferredPrompt ? (
              <>
                <p className="install-android-intro install-android-intro-first">
                  <strong>Primero prueba esto:</strong> toca el botón de abajo. No se descarga nada, solo se añade un acceso directo en tu pantalla de inicio.
                </p>
                <button
                  type="button"
                  className="install-open-btn install-open-btn-android"
                  onClick={handleAndroidInstall}
                >
                  <AñadirIcon className="install-open-btn-android-icon" />
                  Añadir a inicio
                </button>
                <p className="install-android-reassurance">Solo un acceso directo. No descarga archivos.</p>
              </>
            ) : (
              <div className="install-android-fallback">
                <p className="install-android-fallback-intro">Abre el menú del navegador y elige instalar.</p>
                <div className="install-card install-android-fallback-card">
                  <div className="install-card-body">
                    <p className="install-card-line1">Toca los <strong>tres puntos</strong> <MoreVertIcon className="install-card-share-icon install-card-share-icon-inline" /> en la barra</p>
                    <p className="install-card-note">Luego <strong>&quot;Instalar aplicación&quot;</strong> o <strong>&quot;Añadir a la pantalla de inicio&quot;</strong>.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="install-steps">
            {/* Step 1: Share */}
            <div className="install-card install-card-with-image">
              <div className="install-card-number" aria-hidden="true">1</div>
              <div className="install-card-body">
                <p className="install-card-line1">{isChrome() ? 'Arriba' : 'Abajo'}, en la <strong>barra del navegador</strong></p>
                <div className="install-card-line2">
                  <span className="install-card-line2-text">Busca y toca <strong>compartir</strong></span>
                  <ShareIcon className="install-card-share-icon" />
                </div>
                <button type="button" className="install-ver-imagen" onClick={() => setExpandedMainStep((s) => (s === 1 ? null : 1))} aria-expanded={expandedMainStep === 1}>
                  {expandedMainStep === 1 ? 'Ocultar imagen' : 'Ver imagen'}
                </button>
                {expandedMainStep === 1 && (
                  <div className="install-step-image-expanded">
                    {isSafariIOS() ? (
                      <>
                        <div className="install-step-image-variant">
                          <span className="install-step-image-variant-label">Barra de búsqueda abajo</span>
                          <img src={getInstallGuideImage('IMG_1364.jpg')} alt="" className="install-step-image-thumb" />
                          <img src={getInstallGuideImage('IMG_1363.jpg')} alt="" className="install-step-image-thumb" />
                        </div>
                        <div className="install-step-image-variant">
                          <span className="install-step-image-variant-label">Barra de búsqueda arriba</span>
                          <img src={getInstallGuideImage('IMG_1360.jpg')} alt="" className="install-step-image-thumb" />
                        </div>
                      </>
                    ) : (
                      <img src={getInstallGuideImage('IMG_1365.jpg')} alt="" className="install-step-image-thumb" />
                    )}
                  </div>
                )}
              </div>
            </div>
            {showChromeIOSMoreStep && (
              <div className="install-step install-step-with-image">
                <div className="install-card-number" aria-hidden="true">2</div>
                <div className="install-card-body">
                  <p className="install-card-line1">Toca <strong>&quot;Más&quot;</strong> o <strong>&quot;Más opciones&quot;</strong></p>
                  <p className="install-card-note">Para ver todas las acciones del menú de compartir.</p>
                  <button type="button" className="install-ver-imagen" onClick={() => setExpandedMainStep((s) => (s === 2 ? null : 2))} aria-expanded={expandedMainStep === 2}>
                    {expandedMainStep === 2 ? 'Ocultar imagen' : 'Ver imagen'}
                  </button>
                  {expandedMainStep === 2 && (
                    <div className="install-step-image-expanded">
                      <img src={getInstallGuideImage('IMG_1367.jpg')} alt="" className="install-step-image-thumb" />
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="install-step install-step-with-image">
              <div className="install-card-number" aria-hidden="true">{showChromeIOSMoreStep ? 3 : 2}</div>
              <div className="install-card-body">
                <p className="install-card-line1"><strong>Desliza</strong> en el menú y busca</p>
                <div className="install-card-pill">
                  <span className="install-card-pill-icon">
                    <AñadirIcon className="install-card-pill-plus" />
                  </span>
                  <span className="install-card-pill-text">Añadir a inicio</span>
                </div>
                <p className="install-card-note">¿No la ves? Toca «Editar acciones» y actívala.</p>
                <button type="button" className="install-ver-imagen" onClick={() => setExpandedMainStep((s) => (s === 3 ? null : 3))} aria-expanded={expandedMainStep === 3}>
                  {expandedMainStep === 3 ? 'Ocultar imagen' : 'Ver imagen'}
                </button>
                {expandedMainStep === 3 && (
                  <div className="install-step-image-expanded">
                    <img src={getInstallGuideImage(isSafariIOS() ? 'IMG_1359.jpg' : 'IMG_1368.jpg')} alt="" className="install-step-image-thumb" />
                  </div>
                )}
              </div>
            </div>
            <div className="install-step install-step-with-image">
              <div className="install-card-number" aria-hidden="true">{showChromeIOSMoreStep ? 4 : 3}</div>
              <div className="install-card-body">
                <p className="install-card-line1">Toca <strong>Añadir</strong></p>
                <div className="install-card-listo">
                  <CheckIcon className="install-card-check-icon" />
                  <span className="install-card-note">Listo</span>
                </div>
                <button type="button" className="install-ver-imagen" onClick={() => setExpandedMainStep((s) => (s === 4 ? null : 4))} aria-expanded={expandedMainStep === 4}>
                  {expandedMainStep === 4 ? 'Ocultar imagen' : 'Ver imagen'}
                </button>
                {expandedMainStep === 4 && (
                  <div className="install-step-image-expanded">
                    <img src={getInstallGuideImage('IMG_1361.jpg')} alt="" className="install-step-image-thumb" />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        <div className="install-guide-link-wrap">
          <button
            type="button"
            className="install-guide-link"
            onClick={() => { setGuidePickerOs(null); setSelectedGuide(null); setShowGuidePicker(true); }}
          >
            Pasos detallados con imágenes
          </button>
        </div>
      </div>

      {showGuidePicker && !selectedGuide && (
        <div
          className="install-guide-picker-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-guide-picker-title"
          onClick={() => setShowGuidePicker(false)}
        >
          <div className="install-guide-picker" onClick={(e) => e.stopPropagation()}>
            <h2 id="install-guide-picker-title" className="install-guide-picker-title">
              Guía paso a paso
            </h2>
            <p className="install-guide-picker-subtitle">Elige tu dispositivo y navegador para ver los pasos exactos.</p>
            {guidePickerOs === null ? (
              <div className="install-guide-picker-os">
                <button
                  type="button"
                  className="install-guide-picker-option"
                  onClick={() => setGuidePickerOs('ios')}
                >
                  <span className="install-guide-picker-option-label">iPhone / iPad</span>
                  {isIOSDevice() && <span className="install-guide-picker-actual">Actual</span>}
                </button>
                <button
                  type="button"
                  className="install-guide-picker-option"
                  onClick={() => setGuidePickerOs('android')}
                >
                  <span className="install-guide-picker-option-label">Android</span>
                  {isAndroidDevice() && <span className="install-guide-picker-actual">Actual</span>}
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="install-guide-picker-back"
                  onClick={() => setGuidePickerOs(null)}
                >
                  ← Cambiar dispositivo
                </button>
                <div className="install-guide-picker-browsers">
                  {INSTALL_GUIDES[guidePickerOs].browsers.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      className="install-guide-picker-option install-guide-picker-browser"
                      onClick={() => {
                        setSelectedGuide({ os: guidePickerOs, browserId: b.id, label: b.label, steps: b.steps });
                        setShowGuidePicker(false);
                      }}
                    >
                      <span className="install-guide-picker-option-label">{b.label}</span>
                      {isGuideCurrent(b.id) && <span className="install-guide-picker-actual">Actual</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
            <button
              type="button"
              className="install-guide-picker-close"
              onClick={() => setShowGuidePicker(false)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {selectedGuide && (
        <div className="install-guide-fullpage" role="document" aria-label={`Guía: ${selectedGuide.label}`}>
          <div className="install-guide-fullpage-inner">
            <div className="install-guide-fullpage-header">
              <button
                type="button"
                className="install-guide-fullpage-back"
                onClick={() => setSelectedGuide(null)}
                aria-label="Volver"
              >
                <ChevronLeftIcon size={24} color="#ffffff" />
                <span className="install-guide-fullpage-back-text">Volver</span>
              </button>
              <button
                type="button"
                className="install-guide-fullpage-close"
                onClick={() => setSelectedGuide(null)}
                aria-label="Cerrar guía"
              >
                Cerrar
              </button>
            </div>
            <h2 className="install-guide-fullpage-title">{selectedGuide.label}</h2>
            <div className="install-guide-fullpage-steps">
              {selectedGuide.steps.map((step, i) => (
                <div key={i} className={`install-guide-step${step.tryButtonFirst ? ' install-guide-step--try-first' : ''}`}>
                  <span className="install-guide-step-num">
                    Paso {step.stepNum != null ? step.stepNum : i + 1}
                    {step.label && <span className="install-guide-step-sublabel"> — {step.label}</span>}
                  </span>
                  <p className="install-guide-step-text">{step.text}</p>
                  {Array.isArray(step.images) && step.images.length > 0 && (
                    <div className="install-guide-step-images">
                      {step.images.map((src, j) => (
                        <div key={j} className="install-guide-step-image-wrap">
                          {step.images.length > 1 && <span className="install-guide-step-image-label">{j + 1}</span>}
                          <img src={src} alt="" className="install-guide-step-img" />
                        </div>
                      ))}
                    </div>
                  )}
                  {(step.imageBarraAbajo || step.imageBarraArriba) && (
                    <div className="install-guide-step-images">
                      {step.imageBarraAbajo && (
                        <div className="install-guide-step-image-wrap">
                          <span className="install-guide-step-image-label">{step.labelBarraAbajo || 'Barra abajo'}</span>
                          <img src={step.imageBarraAbajo} alt="" className="install-guide-step-img" />
                        </div>
                      )}
                      {step.imageBarraArriba && (
                        <div className="install-guide-step-image-wrap">
                          <span className="install-guide-step-image-label">{step.labelBarraArriba || 'Barra arriba'}</span>
                          <img src={step.imageBarraArriba} alt="" className="install-guide-step-img" />
                        </div>
                      )}
                    </div>
                  )}
                  {(step.imageMenuArriba || step.imageMenuAbajo) && (
                    <div className="install-guide-step-images">
                      {step.imageMenuArriba && (
                        <div className="install-guide-step-image-wrap">
                          <span className="install-guide-step-image-label">Menú arriba</span>
                          <img src={step.imageMenuArriba} alt="" className="install-guide-step-img" />
                        </div>
                      )}
                      {step.imageMenuAbajo && (
                        <div className="install-guide-step-image-wrap">
                          <span className="install-guide-step-image-label">Menú abajo</span>
                          <img src={step.imageMenuAbajo} alt="" className="install-guide-step-img" />
                        </div>
                      )}
                    </div>
                  )}
                  {step.image && !Array.isArray(step.images) && !step.imageBarraAbajo && !step.imageBarraArriba && !step.imageMenuArriba && !step.imageMenuAbajo && (
                    <div className="install-guide-step-image-wrap install-guide-step-image-wrap-single">
                      <img src={step.image} alt="" className="install-guide-step-img" />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="install-guide-fullpage-done">Listo. Abre Wake desde el icono en tu pantalla de inicio.</p>
          </div>
        </div>
      )}

      {showSafariModal && (
        <div
          className="install-safari-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-safari-modal-title"
          onClick={() => setShowSafariModal(false)}
        >
          <div
            className="install-safari-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="install-safari-modal-title" className="install-safari-modal-title">
              Enlace copiado
            </h2>
            <p className="install-safari-modal-text">
              El enlace se ha copiado al portapapeles. Abre <strong>Safari</strong> y pégalo en la barra de direcciones para continuar.
            </p>
            <button
              type="button"
              className="install-safari-modal-btn"
              onClick={() => setShowSafariModal(false)}
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
