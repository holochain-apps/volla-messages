# Volla Messages

Private chat for Android and Desktop environments.

Built with Holochain + Tauri + SvelteKit + TailWind + Skeleton

## Developer Notes

Volla Messages is a Holochain application deployed using [p2pShipyard](https://darksoil.studio/p2p-shipyard/) for Mobile and Desktop.  

### Dev Testing Desktop only

`nix develop`
`npm install`
`npm run start`

### Building and Testing on Android

#### Desktop and Android

`nix develop .#androidDev`
`npm install`
`npm run network:android`

#### As an APK

`nix develop .#androidDev`
`npm install`
`npm run tauri android build`
`adb -s device install /path/to/relay.apk`

### Testing with a .happ release 

To test with the released version of the `.happ`, run:

`nix develop`
`npm run setup:happ-release`
`AGENTS=2 npm run network`

The `.happ` release that is downloaded with this script can be changed in the `setup:happ-release` script in the [package.json](./package.json).

### Publish a new happ release

1. (optional) Use search-and-replace to bump the version number in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and all `package.json` files. 
2. Create a git tag with the format `happ-vX.Y.Z`, where `X.Y.Z` is your happ version. This will trigger CI to create a draft github release, containing the built `.happ` file.
3. Publish the draft github release.
4. Copy the url of the `.happ` file in the github release, then paste it into the npm command `setup:happ-release` in `package.json`.

### Publish a new Volla Messages release

1. (optional) Use search-and-replace to bump the version number in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and all `package.json` files. 
2. Create a git tag with the format `vX.Y.Z`, where `X.Y.Z` is your app version. This will trigger CI to create a draft github release, containing the built applications for all supported platforms.
3. Publish the draft github release.

## License

[Volla License 1.0](https://github.com/holochain-apps/volla-messages/blob/main/LICENSE.txt)

Copyright (C) 2023, Holochain Foundation

This program is free software: you can redistribute it and/or modify it under the terms of the license
provided in the LICENSE file (Volla License 1.0). This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
