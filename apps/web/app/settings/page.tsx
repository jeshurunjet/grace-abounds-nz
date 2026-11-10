import { SettingsView } from './settings-view';

export default function SettingsPage() {
  return (
    <SettingsView
      googleEnabled={Boolean(
        process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
      )}
    />
  );
}
