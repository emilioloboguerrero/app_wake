// wakeAlert — cross-platform replacement for react-native's Alert.alert.
//
// Alert.alert is a NO-OP in react-native-web, so every error/confirmation on
// the web PWA was silently swallowed (failed cancellations, lost saves, muted
// purchase errors). This native implementation delegates straight to
// Alert.alert so mobile behavior is unchanged; wakeAlert.web.js provides the
// web overlay. Signature matches Alert.alert exactly:
//   wakeAlert(title, message?, buttons?, options?)
//   buttons: Array<{ text, onPress?, style?: 'default'|'cancel'|'destructive' }>
import { Alert } from 'react-native';

export function wakeAlert(title, message, buttons, options) {
  Alert.alert(title, message, buttons, options);
}

export default wakeAlert;
