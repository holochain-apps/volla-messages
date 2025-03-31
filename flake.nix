{
  description = "Template for Holochain app development";

  inputs = {
    holonix.url = "github:holochain/holonix/main-0.3";

    nixpkgs.follows = "holonix/nixpkgs";
    flake-parts.follows = "holonix/flake-parts";
    rust-overlay.follows = "holonix/rust-overlay";

    p2p-shipyard.url = "github:darksoil-studio/p2p-shipyard/main-0.3";
  };

  outputs = inputs:
    inputs.flake-parts.lib.mkFlake { inherit inputs; } {
      systems = builtins.attrNames inputs.holonix.devShells;
      perSystem = { inputs', config, pkgs, system, ... }: {
        devShells.default = let
          overlays = [ (import inputs.rust-overlay) ];
          rustPkgs = import pkgs.path { inherit system overlays; };
          rust = rustPkgs.rust-bin.stable."1.79.0".default.override {
            targets = ["wasm32-unknown-unknown"];
          };
        in pkgs.mkShell {
          inputsFrom = [ 
            inputs'.p2p-shipyard.devShells.holochainTauriDev 
            inputs'.holonix.devShells.default
          ];
          packages = [ rust ];
        };
        devShells.androidDev = let
          overlays = [ (import inputs.rust-overlay) ];
          rustPkgs = import pkgs.path { inherit system overlays; };
          rust = rustPkgs.rust-bin.stable."1.79.0".default.override {
            targets = [
              "armv7-linux-androideabi"
              "x86_64-linux-android"
              "i686-linux-android"
              "aarch64-unknown-linux-musl"
              "wasm32-unknown-unknown"
              "x86_64-pc-windows-gnu"
              "x86_64-unknown-linux-musl"
              "x86_64-apple-darwin"
              "aarch64-linux-android"
            ];
          };
        in pkgs.mkShell {
          inputsFrom = [ 
            inputs'.p2p-shipyard.devShells.holochainTauriAndroidDev 
            inputs'.holonix.devShells.default
          ];
          packages = [ rust ];
        };
      };
    };
}
