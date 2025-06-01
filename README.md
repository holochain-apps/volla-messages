# Volla Messages

Private chat for Android and Desktop environments.

Built with Holochain + Tauri + SvelteKit + TailWind + Skeleton

## Developer Notes

Volla Messages is a Holochain application deployed using [p2pShipyard](https://darksoil.studio/p2p-shipyard/) for Mobile and Desktop.  

### Run on desktop

```bash
nix develop
npm install
npm run start:desktop
```

### Run on desktop with production happ

To run locally using the *production* happ that is included in CI release builds, run:

```bash
nix develop
npm install
npm run start:desktop:happ-release
```

### Building and Testing on Android

#### Setup App Signing

1. Generate a signing keystore and key. See https://developer.android.com/studio/publish/app-signing
2. Copy `src-tauri/gen/android/keystore.properties.example` to `src-tauri/gen/android/keystore.properties` and fill in with your signing keystore and key info. 

#### Desktop and Android

```bash
nix develop .#androidDev
npm install
npm run network:android
```

#### As an APK

```bash
nix develop .#androidDev
npm install
npm run tauri android build
adb -s device install /path/to/relay.apk
```

### Testing with a .happ release 

To test with the released version of the `.happ`, run:

```bash
nix develop
npm run setup:happ-release
AGENTS=2 npm run network
```

The `.happ` release that is downloaded with this script can be changed in the `setup:happ-release` script in the [package.json](./package.json).

### Publish a new happ release

1. Use search-and-replace to bump the version number in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and all `package.json` files. 
2. Create a git tag with the format `happ-vX.Y.Z`, where `X.Y.Z` is your happ version. This will trigger CI to create a draft github release, containing the built `.happ` file.
3. Publish the draft github release.
4. Copy the url of the `.happ` file in the github release, then paste it into the npm command `setup:happ-release` in `package.json`.

### Publish a new Volla Messages release

1. Ensure the github repository has all required secrets defined (see [Github Secrets](#github-secrets))
2. Use search-and-replace to bump the version number in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and all `package.json` files. 
3. Create a git tag with the format `vX.Y.Z`, where `X.Y.Z` is your app version. This will trigger CI to create a draft github release, containing the built applications for all supported platforms.
4. Publish the draft github release.

#### Github Secrets

The following github secrets are required to building and publishing Volla Messages app releases in CI:

##### Android Signing

- ANDROID_KEY_ALIAS
- ANDROID_KEY_BASE64: A base64-encoding your `.jks` keystore file. The base64-encoded value can be generated with the command `base64 /path/to/your/keystore.jks`.
- ANDROID_KEY_PASSWORD: The key password and keystore password, which are expected to have the same value.

##### Windows Signing

CI is currently setup to use an EV Certificate for windows code signing, based on this guide:  https://melatonin.dev/blog/how-to-code-sign-windows-installers-with-an-ev-cert-on-github-actions/

- AZURE_KEY_VAULT_URI
- AZURE_CLIENT_ID
- AZURE_TENANT_ID
- AZURE_CLIENT_SECRET
- AZURE_CERT_NAME

##### macOS Signing

- APPLE_CERTIFICATE
- APPLE_CERTIFICATE_PASSWORD
- APPLE_SIGNING_IDENTITY
- APPLE_ID
- APPLE_TEAM_ID
- APPLE_PASSWORD

## License

[Volla License 1.0](https://github.com/holochain-apps/volla-messages/blob/main/LICENSE.txt)

Copyright (C) 2023, Holochain Foundation

This program is free software: you can redistribute it and/or modify it under the terms of the license
provided in the LICENSE file (Volla License 1.0). This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
