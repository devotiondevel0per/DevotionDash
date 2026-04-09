# DevotionDash Mobile App

Flutter mobile client for the DevotionDash business groupware platform.

## Prerequisites

- [Flutter SDK](https://flutter.dev/docs/get-started/install) ≥ 3.3.0
- Android Studio / Xcode
- DevotionDash Next.js server running

## Setup

1. **Install Flutter** — follow https://flutter.dev/docs/get-started/install

2. **Configure the API base URL**
   Edit `lib/services/api_client.dart`:
   ```dart
   const String kBaseUrl = 'http://YOUR_SERVER_IP:3030/api';
   ```
   > For Android emulator use `10.0.2.2` instead of `localhost`

3. **Install dependencies**
   ```bash
   flutter pub get
   ```

4. **Run the app**
   ```bash
   flutter run
   ```

## Project Structure

```
mobile/
├── lib/
│   ├── main.dart              # Entry point
│   ├── router.dart            # go_router navigation
│   ├── theme.dart             # Material 3 theme
│   ├── services/
│   │   ├── api_client.dart    # Dio HTTP client (all API calls)
│   │   └── auth_service.dart  # JWT auth + secure storage
│   └── screens/
│       ├── splash_screen.dart
│       ├── login_screen.dart
│       ├── home_screen.dart   # Module dashboard
│       ├── tasks/
│       ├── chat/
│       ├── board/
│       ├── contacts/
│       ├── projects/
│       └── documents/
├── android/
├── ios/
├── assets/
└── pubspec.yaml
```

## Modules Implemented

| Module    | Status |
|-----------|--------|
| Auth/Login | ✅ |
| Home Dashboard | ✅ |
| Tasks | ✅ (list + create) |
| Chat | ✅ (conversation list) |
| Board | ✅ (post list) |
| Contacts | ✅ (search) |
| Projects | ✅ (list) |
| Documents | ✅ (list) |
| Calendar | 🔲 |
| Team | 🔲 |
| Service Desk | 🔲 |
| Notifications | 🔲 |

## Notes

- Uses **Riverpod** for state management
- Uses **go_router** for navigation
- Auth token stored in **flutter_secure_storage** (encrypted)
- Real-time chat uses **socket_io_client** (wire up in chat screen)
