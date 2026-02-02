// Web entry point
import { registerRootComponent } from 'expo';
import './src/patches/scrollViewTouchAction.web.js';
import App from './src/App.web';
registerRootComponent(App);
