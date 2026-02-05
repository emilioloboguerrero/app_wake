# Install guide screenshots

Put the **screenshots (ss)** for the “Pasos detallados con imágenes” flow here.

- Path: `apps/pwa/public/install-guide/`
- These files are copied to the build as-is and served at `/app/install-guide/` (or `/install-guide/` in dev).

## Suggested filenames (used by InstallScreen)

### Safari (iOS) – one guide: two starting flows, then same steps
| File | Shown as |
|------|----------|
| `IMG_1360.jpg` | Barra de búsqueda arriba – paso 1 (Compartir en la barra) |
| `IMG_1359.jpg` | Barra arriba paso 2; paso 3 para ambos (Añadir a pantalla de inicio) |
| `IMG_1361.jpg` | Paso final – Toca "Añadir" |
| `IMG_1363.jpg` | Barra de búsqueda abajo – paso 1 (Toca los botones en la barra) |
| `IMG_1364.jpg` | Barra de búsqueda abajo – paso 2 (Toca Compartir en el menú) |

### Chrome (iOS)
| File | Step |
|------|------|
| `IMG_1365.jpg` | 1 – Toca Compartir en la barra de búsqueda (arriba) |
| `IMG_1367.jpg` | 2 – Toca "Más" o "Más opciones" en el menú |
| `IMG_1368.jpg` | 3 – Toca "Añadir a pantalla de inicio" |
| `IMG_1361.jpg` | 4 – Toca "Añadir" (también usado en Safari paso final) |

### Chrome (Android)
| File | Shown in guide as |
|------|-------------------|
| `chrome-android-menu-abajo.png` | Chrome Android – menú abajo |
| `chrome-android-menu-arriba.png` | Chrome Android – menú arriba |

Add more files as needed for Samsung, etc. and reference them in `InstallScreen.web.jsx` via `getInstallGuideImage('filename')`.
