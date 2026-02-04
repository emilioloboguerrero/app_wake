import React from 'react';
import './InstallScreen.css';

const LANDING_URL = 'https://wakelab.co/';

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

/**
 * PWA Install screen – shown when user visits the PWA in browser mode (not installed).
 */
export default function InstallScreen() {
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
        <p className="install-hero-subtitle">No se descarga nada.</p>
        <div className="install-steps">
          <div className="install-card">
            <div className="install-card-number" aria-hidden="true">
              1
            </div>
            <div className="install-card-body">
              <p className="install-card-line1">Abajo, en la <strong>barra del navegador</strong></p>
              <div className="install-card-line2">
                <span className="install-card-line2-text">Busca y toca <strong>compartir</strong></span>
                <ShareIcon className="install-card-share-icon" />
              </div>
            </div>
          </div>
          <div className="install-step">
            <div className="install-card-number" aria-hidden="true">
              2
            </div>
            <div className="install-card-body">
              <p className="install-card-line1"><strong>Desliza</strong> en el menú y busca</p>
              <div className="install-card-pill">
                <span className="install-card-pill-icon">
                  <AñadirIcon className="install-card-pill-plus" />
                </span>
                <span className="install-card-pill-text">Añadir a pantalla de inicio</span>
              </div>
              <p className="install-card-note">¿No la ves? Toca «Editar acciones» y actívala.</p>
            </div>
          </div>
          <div className="install-step">
            <div className="install-card-number" aria-hidden="true">
              3
            </div>
            <div className="install-card-body">
              <p className="install-card-line1">Toca <strong>Añadir</strong></p>
              <div className="install-card-listo">
                <CheckIcon className="install-card-check-icon" />
                <span className="install-card-note">Listo</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
