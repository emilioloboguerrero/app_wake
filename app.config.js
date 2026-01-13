// App configuration with environment variables for production security
export default {
  expo: {
    name: "Wake",
    slug: "wake",
    version: "1.1.10",
    orientation: "portrait",
    icon: "./assets/app_icon.png",
    userInterfaceStyle: "dark",
    splash: {
      image: "./assets/wake-logo-new.png",
      resizeMode: "contain",
      backgroundColor: "#1a1a1a"
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.lab.wake.co",
      buildNumber: "54",
      usesAppleSignIn: true,
      googleServicesFile: "./config/firebase/GoogleService-Info.plist",
      infoPlist: {
        NSPhotoLibraryUsageDescription: "Wake necesita acceso a tu galería para que puedas subir una foto de perfil.",
        NSCameraUsageDescription: "Wake necesita acceso a tu cámara para que puedas tomar una foto de perfil.",
        CFBundleURLTypes: [
          {
            CFBundleURLName: "com.lab.wake.co",
            CFBundleURLSchemes: [
              "wake"
            ]
          }
        ],
        ITSAppUsesNonExemptEncryption: false
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/app_icon.png",
        backgroundColor: "#1a1a1a"
      },
      versionCode: 15,
      edgeToEdgeEnabled: true,
      package: "com.lab.wake.co",
      googleServicesFile: "./config/firebase/google-services.json"
    },
    web: {
      favicon: "./assets/favicon.png",
      bundler: "metro"
    },
    scheme: "wake",
    plugins: [
      "expo-font",
      "expo-video",
      "@react-native-google-signin/google-signin"
    ],
    font: {
      family: "Montserrat-SemiBold"
    },
    extra: {
      eas: {
        projectId: "de513d52-b29f-4f9c-a3b3-72da2a39d4f8"
      },
      // Google Sign-In configuration
      googleSignIn: {
        iosClientId: '781583050959-5sb036unn2095q45jagh9kte0b0gbff0.apps.googleusercontent.com',
        androidClientId: '781583050959-id51mjh6r3gbif8hprj1lv0tjcg1vfg7.apps.googleusercontent.com',
        webClientId: '781583050959-ces3e6tuur06ke28bgfrmu8h0iuhine3.apps.googleusercontent.com',
      }
    }
  }
};
