// MINIMAL WEB ENTRY POINT - No error logging, no blocking operations
import { registerRootComponent } from 'expo';
import App from './src/App.web.minimal';

registerRootComponent(App);

