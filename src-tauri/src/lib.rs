use holochain_types::prelude::AppBundle;
use lair_keystore::dependencies::sodoken::{BufRead, BufWrite};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Listener, Manager};
#[cfg(feature = "holochain_service")]
use tauri::{WebviewUrl, WebviewWindowBuilder};
#[cfg(feature = "holochain_bundled")]
use tauri_plugin_holochain::{
    GossipArcClamp, HolochainExt, HolochainPluginConfig, WANNetworkConfig,
};
#[cfg(feature = "holochain_service")]
use tauri_plugin_holochain_service_consumer::{HolochainServiceConsumerExt, InstallAppRequestArgs};

const APP_ID: &'static str = "volla-messages";
const SIGNAL_URL: &'static str = "wss://sbd.holo.host";
const BOOTSTRAP_URL: &'static str = "https://bootstrap-0.infra.holochain.org";
static ICE_URLS: &'static [&str] = &[
    "stun:stun-0.main.infra.holo.host:443",
    "stun:stun-1.main.infra.holo.host:443",
];

const HAPP_BUNDLE_BYTES: &'static [u8] = include_bytes!("../../workdir/relay.happ");

pub fn happ_bundle() -> anyhow::Result<AppBundle> {
    let bundle = AppBundle::decode(HAPP_BUNDLE_BYTES)?;
    Ok(bundle)
}

#[allow(unused_mut)]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Warn)
                .build(),
        );
    #[cfg(mobile)]
    {
        builder = builder.plugin(tauri_plugin_sharesheet::init());
    }

    #[cfg(feature = "holochain_bundled")]
    {
        builder
            .plugin(tauri_plugin_holochain::async_init(
                vec_to_locked(vec![]).expect("Can't build passphrase"),
                HolochainPluginConfig::new(holochain_dir(), wan_network_config())
                    .gossip_arc_clamp(GossipArcClamp::Full),
            ))
            .setup(|app| {
                let handle = app.handle().clone();
                let handle_fail: AppHandle = app.handle().clone();
                app.handle()
                    .listen("holochain://setup-failed", move |_event| {
                        handle_fail.exit(1);
                    });
                app.handle()
                    .listen("holochain://setup-completed", move |_event| {
                        let handle = handle.clone();
                        tauri::async_runtime::spawn(async move {
                            setup(handle.clone()).await.expect("Failed to setup");

                            let mut window = handle
                                .holochain()
                                .expect("Failed to get holochain")
                                .main_window_builder(
                                    String::from("main"),
                                    false,
                                    Some(APP_ID.into()),
                                    None,
                                )
                                .await
                                .expect("Failed to build window");
                            #[cfg(desktop)]
                            {
                                window = window.title(String::from("Volla Messages"))
                            };

                            window.build().expect("Failed to open main window");
                            #[cfg(desktop)]
                            {
                                // After it's done, close the splashscreen and display the main window
                                let splashscreen_window =
                                    handle.get_webview_window("splashscreen").unwrap();
                                splashscreen_window.close().unwrap();
                            }

                            // Load barcode scanner plugin if on supported platform
                            // It is necessary to load this after we have created the new 'main' webview
                            //  which will be calling into it
                            #[cfg(mobile)]
                            handle
                                .plugin(tauri_plugin_barcode_scanner::init())
                                .expect("Failed to initiailze tauri_plugin_barcode_scanner");
                        });
                    });

                Ok(())
            })
            .run(tauri::generate_context!())
            .expect("error while running tauri application");
    }

    // Do not bundle a holochain conductor.
    // Instead, rely on the holochain service being available on the device.
    // Only android mobile target is supported.
    #[cfg(feature = "holochain_service")]
    {
        builder
            .plugin(tauri_plugin_holochain_service_consumer::init())
            .setup(|app| {
                println!("setup holochain_service 1");
                let handle = app.handle().clone();
                    
                WebviewWindowBuilder::new(&handle, "main", WebviewUrl::App("".into())) 
                    // Define the injectHolochainClientEnv javascript function
                    .initialization_script(r#"
                        var e,t,i,r=4294967295;function n(e,t,i){var r=Math.floor(i/4294967296),n=i;e.setUint32(t,r),e.setUint32(t+4,n)}var o=("undefined"==typeof process||"never"!==(null===(e=null===process||void 0===process?void 0:process.env)||void 0===e?void 0:e.TEXT_ENCODING))&&"undefined"!=typeof TextEncoder&&"undefined"!=typeof TextDecoder;function s(e){for(var t=e.length,i=0,r=0;r<t;){var n=e.charCodeAt(r++);if(4294967168&n)if(4294965248&n){if(n>=55296&&n<=56319&&r<t){var o=e.charCodeAt(r);56320==(64512&o)&&(++r,n=((1023&n)<<10)+(1023&o)+65536)}i+=4294901760&n?4:3}else i+=2;else i++}return i}var c=o?new TextEncoder:void 0,h=o?"undefined"!=typeof process&&"force"!==(null===(t=null===process||void 0===process?void 0:process.env)||void 0===t?void 0:t.TEXT_ENCODING)?200:0:r;var f=(null==c?void 0:c.encodeInto)?function(e,t,i){c.encodeInto(e,t.subarray(i))}:function(e,t,i){t.set(c.encode(e),i)};o&&new TextDecoder,o&&"undefined"!=typeof process&&(null===(i=null===process||void 0===process?void 0:process.env)||void 0===i||i.TEXT_DECODER);var a,u=function(e,t){this.type=e,this.data=t},p=(a=function(e,t){return a=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(e,t){e.__proto__=t}||function(e,t){for(var i in t)Object.prototype.hasOwnProperty.call(t,i)&&(e[i]=t[i])},a(e,t)},function(e,t){if("function"!=typeof t&&null!==t)throw new TypeError("Class extends value "+String(t)+" is not a constructor or null");function i(){this.constructor=e}a(e,t),e.prototype=null===t?Object.create(t):(i.prototype=t.prototype,new i)}),d=function(e){function t(i){var r=e.call(this,i)||this,n=Object.create(t.prototype);return Object.setPrototypeOf(r,n),Object.defineProperty(r,"name",{configurable:!0,enumerable:!1,value:t.name}),r}return p(t,e),t}(Error),w=4294967295,l=17179869183;var y={type:-1,encode:function(e){var t,i,r,o;return e instanceof Date?function(e){var t,i=e.sec,r=e.nsec;if(i>=0&&r>=0&&i<=l){if(0===r&&i<=w){var o=new Uint8Array(4);return(t=new DataView(o.buffer)).setUint32(0,i),o}var s=i/4294967296,c=4294967295&i;return o=new Uint8Array(8),(t=new DataView(o.buffer)).setUint32(0,r<<2|3&s),t.setUint32(4,c),o}return o=new Uint8Array(12),(t=new DataView(o.buffer)).setUint32(0,r),n(t,4,i),o}((t=e.getTime(),i=Math.floor(t/1e3),r=1e6*(t-1e3*i),o=Math.floor(r/1e9),{sec:i+o,nsec:r-1e9*o})):null},decode:function(e){var t=function(e){var t=new DataView(e.buffer,e.byteOffset,e.byteLength);switch(e.byteLength){case 4:return{sec:r=t.getUint32(0),nsec:0};case 8:var i=t.getUint32(0);return{sec:r=4294967296*(3&i)+t.getUint32(4),nsec:i>>>2};case 12:var r=function(e,t){return 4294967296*e.getInt32(t)+e.getUint32(t+4)}(t,4);return{sec:r,nsec:t.getUint32(0)};default:throw new d("Unrecognized data size for timestamp (expected 4, 8, or 12): ".concat(e.length))}}(e);return new Date(1e3*t.sec+t.nsec/1e6)}},v=function(){function e(){this.builtInEncoders=[],this.builtInDecoders=[],this.encoders=[],this.decoders=[],this.register(y)}return e.prototype.register=function(e){var t=e.type,i=e.encode,r=e.decode;if(t>=0)this.encoders[t]=i,this.decoders[t]=r;else{var n=1+t;this.builtInEncoders[n]=i,this.builtInDecoders[n]=r}},e.prototype.tryToEncode=function(e,t){for(var i=0;i<this.builtInEncoders.length;i++){if(null!=(r=this.builtInEncoders[i]))if(null!=(n=r(e,t)))return new u(-1-i,n)}for(i=0;i<this.encoders.length;i++){var r,n;if(null!=(r=this.encoders[i]))if(null!=(n=r(e,t)))return new u(i,n)}return e instanceof u?e:null},e.prototype.decode=function(e,t,i){var r=t<0?this.builtInDecoders[-1-t]:this.decoders[t];return r?r(e,t,i):new u(t,e)},e.defaultCodec=new e,e}();var U=function(){function e(e,t,i,r,n,o,s,c){void 0===e&&(e=v.defaultCodec),void 0===t&&(t=void 0),void 0===i&&(i=100),void 0===r&&(r=2048),void 0===n&&(n=!1),void 0===o&&(o=!1),void 0===s&&(s=!1),void 0===c&&(c=!1),this.extensionCodec=e,this.context=t,this.maxDepth=i,this.initialBufferSize=r,this.sortKeys=n,this.forceFloat32=o,this.ignoreUndefined=s,this.forceIntegerToFloat=c,this.pos=0,this.view=new DataView(new ArrayBuffer(this.initialBufferSize)),this.bytes=new Uint8Array(this.view.buffer)}return e.prototype.reinitializeState=function(){this.pos=0},e.prototype.encodeSharedRef=function(e){return this.reinitializeState(),this.doEncode(e,1),this.bytes.subarray(0,this.pos)},e.prototype.encode=function(e){return this.reinitializeState(),this.doEncode(e,1),this.bytes.slice(0,this.pos)},e.prototype.doEncode=function(e,t){if(t>this.maxDepth)throw new Error("Too deep objects in depth ".concat(t));null==e?this.encodeNil():"boolean"==typeof e?this.encodeBoolean(e):"number"==typeof e?this.encodeNumber(e):"string"==typeof e?this.encodeString(e):this.encodeObject(e,t)},e.prototype.ensureBufferSizeToWrite=function(e){var t=this.pos+e;this.view.byteLength<t&&this.resizeBuffer(2*t)},e.prototype.resizeBuffer=function(e){var t=new ArrayBuffer(e),i=new Uint8Array(t),r=new DataView(t);i.set(this.bytes),this.view=r,this.bytes=i},e.prototype.encodeNil=function(){this.writeU8(192)},e.prototype.encodeBoolean=function(e){!1===e?this.writeU8(194):this.writeU8(195)},e.prototype.encodeNumber=function(e){Number.isSafeInteger(e)&&!this.forceIntegerToFloat?e>=0?e<128?this.writeU8(e):e<256?(this.writeU8(204),this.writeU8(e)):e<65536?(this.writeU8(205),this.writeU16(e)):e<4294967296?(this.writeU8(206),this.writeU32(e)):(this.writeU8(207),this.writeU64(e)):e>=-32?this.writeU8(224|e+32):e>=-128?(this.writeU8(208),this.writeI8(e)):e>=-32768?(this.writeU8(209),this.writeI16(e)):e>=-2147483648?(this.writeU8(210),this.writeI32(e)):(this.writeU8(211),this.writeI64(e)):this.forceFloat32?(this.writeU8(202),this.writeF32(e)):(this.writeU8(203),this.writeF64(e))},e.prototype.writeStringHeader=function(e){if(e<32)this.writeU8(160+e);else if(e<256)this.writeU8(217),this.writeU8(e);else if(e<65536)this.writeU8(218),this.writeU16(e);else{if(!(e<4294967296))throw new Error("Too long string: ".concat(e," bytes in UTF-8"));this.writeU8(219),this.writeU32(e)}},e.prototype.encodeString=function(e){if(e.length>h){var t=s(e);this.ensureBufferSizeToWrite(5+t),this.writeStringHeader(t),f(e,this.bytes,this.pos),this.pos+=t}else{t=s(e);this.ensureBufferSizeToWrite(5+t),this.writeStringHeader(t),function(e,t,i){for(var r=e.length,n=i,o=0;o<r;){var s=e.charCodeAt(o++);if(4294967168&s){if(4294965248&s){if(s>=55296&&s<=56319&&o<r){var c=e.charCodeAt(o);56320==(64512&c)&&(++o,s=((1023&s)<<10)+(1023&c)+65536)}4294901760&s?(t[n++]=s>>18&7|240,t[n++]=s>>12&63|128,t[n++]=s>>6&63|128):(t[n++]=s>>12&15|224,t[n++]=s>>6&63|128)}else t[n++]=s>>6&31|192;t[n++]=63&s|128}else t[n++]=s}}(e,this.bytes,this.pos),this.pos+=t}},e.prototype.encodeObject=function(e,t){var i=this.extensionCodec.tryToEncode(e,this.context);if(null!=i)this.encodeExtension(i);else if(Array.isArray(e))this.encodeArray(e,t);else if(ArrayBuffer.isView(e))this.encodeBinary(e);else{if("object"!=typeof e)throw new Error("Unrecognized object: ".concat(Object.prototype.toString.apply(e)));this.encodeMap(e,t)}},e.prototype.encodeBinary=function(e){var t=e.byteLength;if(t<256)this.writeU8(196),this.writeU8(t);else if(t<65536)this.writeU8(197),this.writeU16(t);else{if(!(t<4294967296))throw new Error("Too large binary: ".concat(t));this.writeU8(198),this.writeU32(t)}var i,r=(i=e)instanceof Uint8Array?i:ArrayBuffer.isView(i)?new Uint8Array(i.buffer,i.byteOffset,i.byteLength):i instanceof ArrayBuffer?new Uint8Array(i):Uint8Array.from(i);this.writeU8a(r)},e.prototype.encodeArray=function(e,t){var i=e.length;if(i<16)this.writeU8(144+i);else if(i<65536)this.writeU8(220),this.writeU16(i);else{if(!(i<4294967296))throw new Error("Too large array: ".concat(i));this.writeU8(221),this.writeU32(i)}for(var r=0,n=e;r<n.length;r++){var o=n[r];this.doEncode(o,t+1)}},e.prototype.countWithoutUndefined=function(e,t){for(var i=0,r=0,n=t;r<n.length;r++){void 0!==e[n[r]]&&i++}return i},e.prototype.encodeMap=function(e,t){var i=Object.keys(e);this.sortKeys&&i.sort();var r=this.ignoreUndefined?this.countWithoutUndefined(e,i):i.length;if(r<16)this.writeU8(128+r);else if(r<65536)this.writeU8(222),this.writeU16(r);else{if(!(r<4294967296))throw new Error("Too large map object: ".concat(r));this.writeU8(223),this.writeU32(r)}for(var n=0,o=i;n<o.length;n++){var s=o[n],c=e[s];this.ignoreUndefined&&void 0===c||(this.encodeString(s),this.doEncode(c,t+1))}},e.prototype.encodeExtension=function(e){var t=e.data.length;if(1===t)this.writeU8(212);else if(2===t)this.writeU8(213);else if(4===t)this.writeU8(214);else if(8===t)this.writeU8(215);else if(16===t)this.writeU8(216);else if(t<256)this.writeU8(199),this.writeU8(t);else if(t<65536)this.writeU8(200),this.writeU16(t);else{if(!(t<4294967296))throw new Error("Too large extension object: ".concat(t));this.writeU8(201),this.writeU32(t)}this.writeI8(e.type),this.writeU8a(e.data)},e.prototype.writeU8=function(e){this.ensureBufferSizeToWrite(1),this.view.setUint8(this.pos,e),this.pos++},e.prototype.writeU8a=function(e){var t=e.length;this.ensureBufferSizeToWrite(t),this.bytes.set(e,this.pos),this.pos+=t},e.prototype.writeI8=function(e){this.ensureBufferSizeToWrite(1),this.view.setInt8(this.pos,e),this.pos++},e.prototype.writeU16=function(e){this.ensureBufferSizeToWrite(2),this.view.setUint16(this.pos,e),this.pos+=2},e.prototype.writeI16=function(e){this.ensureBufferSizeToWrite(2),this.view.setInt16(this.pos,e),this.pos+=2},e.prototype.writeU32=function(e){this.ensureBufferSizeToWrite(4),this.view.setUint32(this.pos,e),this.pos+=4},e.prototype.writeI32=function(e){this.ensureBufferSizeToWrite(4),this.view.setInt32(this.pos,e),this.pos+=4},e.prototype.writeF32=function(e){this.ensureBufferSizeToWrite(4),this.view.setFloat32(this.pos,e),this.pos+=4},e.prototype.writeF64=function(e){this.ensureBufferSizeToWrite(8),this.view.setFloat64(this.pos,e),this.pos+=8},e.prototype.writeU64=function(e){this.ensureBufferSizeToWrite(8),function(e,t,i){var r=i/4294967296,n=i;e.setUint32(t,r),e.setUint32(t+4,n)}(this.view,this.pos,e),this.pos+=8},e.prototype.writeI64=function(e){this.ensureBufferSizeToWrite(8),n(this.view,this.pos,e),this.pos+=8},e}(),g={};window.injectHolochainClientEnv=function(e,t,i){window.__HC_LAUNCHER_ENV__={APP_INTERFACE_PORT:t,INSTALLED_APP_ID:e,APP_INTERFACE_TOKEN:i},window.__HC_ZOME_CALL_SIGNER__={signZomeCall:async e=>{const t=Uint8Array.from(await crypto.getRandomValues(new Uint8Array(32))),i=1e3*(Date.now()+3e5),r=Array.from((n=e.payload,void 0===o&&(o=g),new U(o.extensionCodec,o.context,o.maxDepth,o.initialBufferSize,o.sortKeys,o.forceFloat32,o.ignoreUndefined,o.forceIntegerToFloat).encodeSharedRef(n)));var n,o;const s={provenance:e.provenance,cellIdDnaHash:e.cell_id[0],cellIdAgentPubKey:e.cell_id[1],zomeName:e.zome_name,fnName:e.fn_name,capSecret:null,payload:r,nonce:t,expiresAt:i},c=await window.__TAURI_INTERNALS__.invoke("plugin:holochain-service-consumer|sign_zome_call",s);return{provenance:e.provenance,cell_id:e.cell_id,zome_name:e.zome_name,fn_name:e.fn_name,cap_secret:null,payload:r,nonce:t,expires_at:i,signature:Uint8Array.from(c.signature)}}}};
                    "#)
                    // Define function to install app, get app websocket, and inject magic config variables
                    .initialization_script(format!(
                        r#"
                            async function setupHapp() {{
                                if (window.location.origin !== 'http://tauri.localhost') return;

                                // Check if happ is installed
                                const {{ installed }} = await window.__TAURI_INTERNALS__.invoke('plugin:holochain-service-consumer|is_app_installed', {{ appId: "{}" }});
                                
                                // Install happ if not already
                                if(!installed) {{
                                    await window.__TAURI_INTERNALS__.invoke('plugin:holochain-service-consumer|install_app', {{ appId: "{}", appBundleBytes: {:?}, membraneProofs: {{}}, networkSeed: "{}" }});
                                }}
                                
                                // Setup app websocket
                                const {{ appId, port, token }} = await window.__TAURI_INTERNALS__.invoke('plugin:holochain-service-consumer|app_websocket_auth', {{ appId: "{}" }});

                                // Inject magic configuration variables used by @holochain/client 
                                injectHolochainClientEnv(appId, port, token);
                            }}
                        "#, APP_ID, APP_ID, HAPP_BUNDLE_BYTES, uuid::Uuid::new_v4().to_string(), APP_ID,
                    ).as_str())
                    // Workaround that runs the setup script after a brief delay, to wait for window.__TAURI_INTERNALS__ to be defined
                    // See https://github.com/tauri-apps/tauri/issues/12404
                    .initialization_script("setTimeout(setupHapp, 100);")
                    .build()
                    .expect("Failed to build main webview");

                #[cfg(desktop)]
                {
                    // After it's done, close the splashscreen and display the main window
                    let splashscreen_window = handle.get_webview_window("splashscreen").unwrap();
                    splashscreen_window.close().unwrap();
                }

                // Load barcode scanner plugin if on supported platform
                // It is necessary to load this after we have created the new 'main' webview
                //  which will be calling into it
                #[cfg(mobile)]
                handle
                    .plugin(tauri_plugin_barcode_scanner::init())
                    .expect("Failed to initiailze tauri_plugin_barcode_scanner");

                Ok(())
            })
            .run(tauri::generate_context!())
            .expect("error while running tauri application");
    }
}

// Very simple setup for now:
// - On app start, list installed apps:
//   - If our hApp is not installed, this is the first time the app is opened: install our hApp
//   - If our hApp **is** installed:
//     - Check if it's necessary to update the coordinators for our hApp
//       - And do so if it is
//
// You can modify this function to suit your needs if they become more complex
#[cfg(feature = "holochain_bundled")]
async fn setup(handle: AppHandle) -> anyhow::Result<()> {
    let admin_ws = handle.holochain()?.admin_websocket().await?;

    let installed_apps = admin_ws
        .list_apps(None)
        .await
        .map_err(|err| tauri_plugin_holochain::Error::ConductorApiError(err))?;

    // DeepKey comes preinstalled as the first app
    if installed_apps
        .iter()
        .find(|app| app.installed_app_id.as_str().eq(APP_ID))
        .is_none()
    {
        // we do this because we don't want to join everybody into the same dht!
        let random_seed = format!(
            "{}",
            SystemTime::now().duration_since(UNIX_EPOCH)?.as_micros()
        );
        handle
            .holochain()?
            .install_app(
                String::from(APP_ID),
                happ_bundle()?,
                None,
                None,
                Some(random_seed),
            )
            .await?;
    } else {
        handle
            .holochain()?
            .update_app_if_necessary(String::from(APP_ID), happ_bundle()?)
            .await?;
    }
    Ok(())
}

#[cfg(feature = "holochain_bundled")]
fn wan_network_config() -> Option<WANNetworkConfig> {
    // Resolved at compile time to be able to point to local services
    if tauri::is_dev() {
        None
    } else {
        Some(WANNetworkConfig {
            signal_url: url2::url2!("{}", SIGNAL_URL),
            bootstrap_url: url2::url2!("{}", BOOTSTRAP_URL),
            ice_servers_urls: ICE_URLS.into_iter().map(|v| url2::url2!("{}", v)).collect(),
        })
    }
}

#[cfg(feature = "holochain_bundled")]
fn holochain_dir() -> PathBuf {
    if tauri::is_dev() {
        #[cfg(target_os = "android")]
        {
            app_dirs2::app_root(
                app_dirs2::AppDataType::UserCache,
                &app_dirs2::AppInfo {
                    name: APP_ID,
                    author: std::env!("CARGO_PKG_AUTHORS"),
                },
            )
            .expect("Could not get the UserCache directory")
        }
        #[cfg(not(target_os = "android"))]
        {
            let tmp_dir =
                tempdir::TempDir::new(APP_ID).expect("Could not create temporary directory");

            // Convert `tmp_dir` into a `Path`, destroying the `TempDir`
            // without deleting the directory.
            let tmp_path = tmp_dir.into_path();
            tmp_path
        }
    } else {
        app_dirs2::app_root(
            app_dirs2::AppDataType::UserData,
            &app_dirs2::AppInfo {
                name: APP_ID,
                author: std::env!("CARGO_PKG_AUTHORS"),
            },
        )
        .expect("Could not get app root")
        .join("holochain")
        .join(get_version())
    }
}

#[cfg(feature = "holochain_bundled")]
fn vec_to_locked(mut pass_tmp: Vec<u8>) -> std::io::Result<BufRead> {
    match BufWrite::new_mem_locked(pass_tmp.len()) {
        Err(e) => {
            pass_tmp.fill(0);
            Err(e.into())
        }
        Ok(p) => {
            {
                let mut lock = p.write_lock();
                lock.copy_from_slice(&pass_tmp);
                pass_tmp.fill(0);
            }
            Ok(p.to_read())
        }
    }
}

#[cfg(feature = "holochain_bundled")]
fn get_version() -> String {
    let semver = std::env!("CARGO_PKG_VERSION");

    if semver.starts_with("0.0.") {
        return semver.to_string();
    }

    if semver.starts_with("0.") {
        let v: Vec<&str> = semver.split(".").collect();
        return format!("{}.{}", v[0], v[1]);
    }
    let v: Vec<&str> = semver.split(".").collect();
    return format!("{}", v[0]);
}
