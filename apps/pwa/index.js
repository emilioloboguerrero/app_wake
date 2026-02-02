import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

// Web build must use the web App (src/App.web.js) so BrowserRouter is mounted and
// useNavigate() in LoginScreen.web.js has router context. The default entry is index.js,
// so we branch here instead of relying on index.web.js as entry.
const isWeb = Platform.OS === 'web';
const App = isWeb ? require('./src/App.web').default : require('./App').default;
if (typeof window !== 'undefined') {
  console.log('[ENTRY] Platform.OS:', Platform.OS, '| Using App:', isWeb ? 'src/App.web (web)' : 'App (native)');
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
