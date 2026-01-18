## 1. Build .webhapp
```bash
nix develop
```
```bash
npm run build:zomes
```
```bash
hc app pack workdir --recursive
```
```bash
npm run package -w ui
```
```bash
hc web-app pack workdir --recursive
```

## 2. Copy `.webhapp` file from `workdir/` folder to the `kangaroo-electron/pouch/`

## 3. Build the kangaroo-electron app
```bash
yarn setup
```

- Change `appId` to `org.volla.volla-messages`
- Change `productName` to `Volla Messages` 


```bash
yarn dev
```

- If some error occurs, try the below debugging steps

```bash
yarn fetch:binaries
```

## 4. For release
```bash
yarn build:linux
```